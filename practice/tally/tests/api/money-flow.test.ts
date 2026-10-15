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
    for (let i = 4; i <= 35; i++) {
      await owner.call('POST', `/groups/${code}/members`, { name: `Member ${String(i).padStart(2, '0')}` });
    }
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
    // Adding 32 members one request at a time takes several seconds in Miniflare.
  }, 60_000);

  it('rejects a request body larger than 16 KB', async () => {
    const res = await owner.call('POST', `/groups/${code}/expenses`, { filler: 'x'.repeat(16 * 1024) });
    expect(res.status).toBe(413);
    expect(res.json.code).toBe('BODY_TOO_LARGE');
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
