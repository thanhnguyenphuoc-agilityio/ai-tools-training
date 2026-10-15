import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { computeBalances } from '../../shared/settle';
import type { GroupDto } from '../../shared/types';
import { Browser, createTestEnv } from './helpers';

let env: Awaited<ReturnType<typeof createTestEnv>>;
let owner: Browser;
let sam: Browser;
let code: string;
let ids: { alex: string; sam: string; jamie: string };

const getGroup = (b: Browser) => b.call<GroupDto>('GET', `/groups/${code}`).then((r) => r.json);
const today = '2026-10-10';

beforeEach(async () => {
  env = await createTestEnv();
  owner = new Browser(env.env);
  sam = new Browser(env.env);
  ({ code } = (await owner.call('POST', '/groups', { name: 'Beach trip', ownerName: 'Alex' })).json);
  const samId = (await sam.call('POST', `/groups/${code}/members`, { name: 'Sam', claim: true })).json.id;
  const jamieId = (await owner.call('POST', `/groups/${code}/members`, { name: 'Jamie' })).json.id;
  ids = { alex: (await getGroup(owner)).members[0].id, sam: samId, jamie: jamieId };
});

afterEach(async () => {
  await env.dispose();
});

const balancesOf = (g: GroupDto) =>
  Object.fromEntries(computeBalances(g.members.map((m) => m.id), g.expenses, g.transfers));

describe('expenses', () => {
  it('stores computed shares and drives balances', async () => {
    const res = await owner.call('POST', `/groups/${code}/expenses`, {
      payerId: ids.alex,
      amount: 300_000,
      description: 'Hotpot',
      spentOn: today,
      splitMode: 'equal',
      participants: [{ memberId: ids.alex }, { memberId: ids.sam }, { memberId: ids.jamie }],
    });
    expect(res.status).toBe(201);
    const group = await getGroup(owner);
    expect(group.expenses[0].shares.map((s) => s.amount)).toEqual([100_000, 100_000, 100_000]);
    expect(balancesOf(group)).toEqual({ [ids.alex]: 200_000, [ids.sam]: -100_000, [ids.jamie]: -100_000 });
  });

  it('requires a member and valid input', async () => {
    const guest = new Browser(env.env);
    const base = { payerId: ids.alex, amount: 1000, description: 'x', spentOn: today, participants: [{ memberId: ids.sam }] };
    expect((await guest.call('POST', `/groups/${code}/expenses`, base)).status).toBe(401);
    expect((await owner.call('POST', `/groups/${code}/expenses`, { ...base, amount: 10.5 })).status).toBe(400);
    expect((await owner.call('POST', `/groups/${code}/expenses`, { ...base, participants: [] })).status).toBe(400);
    expect((await owner.call('POST', `/groups/${code}/expenses`, { ...base, payerId: 'nope' })).status).toBe(400);
    expect((await owner.call('POST', `/groups/${code}/expenses`, { ...base, spentOn: '10/10/2026' })).status).toBe(400);
    expect((await owner.call('POST', `/groups/${code}/expenses`, { ...base, spentOn: '2026-02-30' })).status).toBe(400);
    const weighted = (weight: number) => ({ ...base, splitMode: 'weight', participants: [{ memberId: ids.sam, weight }] });
    for (const weight of [0.001, 0.333]) {
      const res = await owner.call('POST', `/groups/${code}/expenses`, weighted(weight));
      expect(res.status).toBe(400);
      expect(res.json.code).toBe('INVALID_WEIGHT');
    }
    const ok = await owner.call('POST', `/groups/${code}/expenses`, weighted(0.25));
    expect(ok.status).toBe(201);
    await owner.call('DELETE', `/groups/${code}/expenses/${ok.json.id}`);
  });

  it('lets the author or the owner delete, nobody else', async () => {
    const jamie = new Browser(env.env);
    await jamie.call('POST', `/groups/${code}/members/${ids.jamie}/claim`);
    const add = (b: Browser) =>
      b.call('POST', `/groups/${code}/expenses`, {
        payerId: ids.sam,
        amount: 50_000,
        description: 'Coffee',
        spentOn: today,
        participants: [{ memberId: ids.sam }, { memberId: ids.jamie }],
      });

    const first = (await add(sam)).json.id;
    expect((await jamie.call('DELETE', `/groups/${code}/expenses/${first}`)).status).toBe(403);
    expect((await sam.call('DELETE', `/groups/${code}/expenses/${first}`)).status).toBe(200);
    expect((await sam.call('DELETE', `/groups/${code}/expenses/${first}`)).status).toBe(404);

    const second = (await add(sam)).json.id;
    expect((await owner.call('DELETE', `/groups/${code}/expenses/${second}`)).status).toBe(200);
    expect((await getGroup(owner)).expenses).toHaveLength(0);
  });

  it('accepts an expense shared by a 35-member group', async () => {
    // Inserted directly: the request under test is the expense, not 32 member requests.
    const createdAt = new Date().toISOString();
    await env.env.DB.batch(
      Array.from({ length: 32 }, (_, i) =>
        env.env.DB.prepare('INSERT INTO members (id, group_code, name, token_hash, created_at) VALUES (?, ?, ?, NULL, ?)').bind(
          crypto.randomUUID(),
          code,
          `Member ${String(i + 4).padStart(2, '0')}`,
          createdAt,
        ),
      ),
    );
    const members = (await getGroup(owner)).members;
    expect(members).toHaveLength(35);

    const res = await owner.call('POST', `/groups/${code}/expenses`, {
      payerId: ids.alex,
      amount: 3_500_000,
      description: 'Monthly fee',
      spentOn: today,
      splitMode: 'equal',
      participants: members.map((m) => ({ memberId: m.id, weight: 1 })),
    });
    expect(res.status).toBe(201);
    const shares = (await getGroup(owner)).expenses[0].shares;
    expect(shares).toHaveLength(35);
    expect(shares.every((s) => s.amount === 100_000)).toBe(true);
  });

  it('accepts a request body of exactly 16 KB and rejects one byte more', async () => {
    const limit = 16 * 1024;
    // A body without payerId whose JSON encoding is exactly `bytes` long.
    const bodyOf = (bytes: number) => {
      const body = { filler: 'x'.repeat(bytes - JSON.stringify({ filler: '' }).length) };
      expect(new TextEncoder().encode(JSON.stringify(body)).length).toBe(bytes);
      return body;
    };

    // The whole body is parsed: validation reaches the first field.
    const atLimit = await owner.call('POST', `/groups/${code}/expenses`, bodyOf(limit));
    expect(atLimit.status).toBe(400);
    expect(atLimit.json.code).toBe('FIELD_REQUIRED');
    expect(atLimit.json.params.field).toBe('payerId');

    const overLimit = await owner.call('POST', `/groups/${code}/expenses`, bodyOf(limit + 1));
    expect(overLimit.status).toBe(413);
    expect(overLimit.json.code).toBe('BODY_TOO_LARGE');
  });
});

describe('transfers', () => {
  beforeEach(async () => {
    await owner.call('POST', `/groups/${code}/expenses`, {
      payerId: ids.alex,
      amount: 200_000,
      description: 'Fuel',
      spentOn: today,
      participants: [{ memberId: ids.alex }, { memberId: ids.sam }],
    });
  });

  it('only changes balances once the receiver confirms', async () => {
    const sent = await sam.call('POST', `/groups/${code}/transfers`, { toId: ids.alex, amount: 100_000 });
    expect(sent.status).toBe(201);
    expect(balancesOf(await getGroup(owner))[ids.sam]).toBe(-100_000);

    expect((await sam.call('POST', `/groups/${code}/transfers/${sent.json.id}/confirm`)).status).toBe(403);
    expect((await owner.call('POST', `/groups/${code}/transfers/${sent.json.id}/confirm`)).status).toBe(200);
    expect(balancesOf(await getGroup(owner))[ids.sam]).toBe(0);
    expect((await owner.call('POST', `/groups/${code}/transfers/${sent.json.id}/confirm`)).status).toBe(409);
  });

  it("does not let a member record someone else's transfer", async () => {
    const res = await sam.call('POST', `/groups/${code}/transfers`, { fromId: ids.jamie, toId: ids.alex, amount: 1000 });
    expect(res.status).toBe(403);
  });
});
