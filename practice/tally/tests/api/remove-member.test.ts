import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { GroupDto } from '../../shared/types';
import { Browser, createTestEnv } from './helpers';

let env: Awaited<ReturnType<typeof createTestEnv>>;
let owner: Browser;
let sam: Browser;
let code: string;
let ids: { alex: string; sam: string; jamie: string };

const getGroup = (b: Browser) => b.call<GroupDto>('GET', `/groups/${code}`).then((r) => r.json);
const today = '2026-10-10';

const addExpense = (b: Browser, payerId: string, amount: number, participants: string[]) =>
  b.call('POST', `/groups/${code}/expenses`, {
    payerId,
    amount,
    description: 'Utilities',
    spentOn: today,
    splitMode: 'equal',
    participants: participants.map((memberId) => ({ memberId, weight: 1 })),
  });

const remove = (b: Browser, id: string, reason?: string) =>
  b.call('POST', `/groups/${code}/members/${id}/remove`, reason === undefined ? {} : { reason });

beforeEach(async () => {
  env = await createTestEnv();
  owner = new Browser(env.env);
  sam = new Browser(env.env);
  ({ code } = (await owner.call('POST', '/groups', { name: 'Shared house', ownerName: 'Alex' })).json);
  const samId = (await sam.call('POST', `/groups/${code}/members`, { name: 'Sam', claim: true })).json.id;
  const jamieId = (await owner.call('POST', `/groups/${code}/members`, { name: 'Jamie' })).json.id;
  const alexId = (await getGroup(owner)).members.find((m) => m.isOwner)!.id;
  ids = { alex: alexId, sam: samId, jamie: jamieId };
});

afterEach(async () => {
  await env.dispose();
});

describe('removing a member', () => {
  it('lets the owner remove a member who has settled up, keeping the history', async () => {
    expect((await addExpense(owner, ids.alex, 90_000, [ids.alex, ids.jamie])).status).toBe(201);
    const { json: transfer } = await owner.call('POST', `/groups/${code}/transfers`, {
      fromId: ids.jamie,
      toId: ids.alex,
      amount: 45_000,
    });
    expect((await owner.call('POST', `/groups/${code}/transfers/${transfer.id}/confirm`)).status).toBe(200);

    const res = await remove(owner, ids.jamie, 'Moved out');
    expect(res.status).toBe(200);

    const group = await getGroup(owner);
    const jamie = group.members.find((m) => m.id === ids.jamie)!;
    expect(jamie.removed).toBe(true);
    expect(jamie.removedReason).toBe('Moved out');
    expect(group.expenses[0].shares.map((s) => s.memberId)).toContain(ids.jamie);
    expect(group.transfers[0].fromId).toBe(ids.jamie);
  });

  it('turns the removed member device into a guest', async () => {
    expect((await remove(owner, ids.sam)).status).toBe(200);
    expect((await getGroup(sam)).me).toEqual({ memberId: null, isOwner: false });
    expect((await addExpense(sam, ids.sam, 10_000, [ids.sam])).status).toBe(401);
  });

  it('refuses while the member still owes money', async () => {
    await addExpense(owner, ids.alex, 90_000, [ids.alex, ids.jamie]);
    const res = await remove(owner, ids.jamie);
    expect(res.status).toBe(409);
    expect(res.json.code).toBe('MEMBER_HAS_BALANCE');
    expect((await getGroup(owner)).members.find((m) => m.id === ids.jamie)!.removed).toBe(false);
  });

  it('refuses while a transfer of the member waits for confirmation', async () => {
    await owner.call('POST', `/groups/${code}/transfers`, { fromId: ids.sam, toId: ids.alex, amount: 10_000 });
    const res = await remove(owner, ids.sam);
    expect(res.status).toBe(409);
    expect(res.json.code).toBe('MEMBER_HAS_BALANCE');
  });

  it('never removes the owner', async () => {
    const res = await remove(owner, ids.alex);
    expect(res.status).toBe(409);
    expect(res.json.code).toBe('CANNOT_REMOVE_OWNER');
  });

  it('refuses a guest', async () => {
    const guest = new Browser(env.env);
    expect((await remove(guest, ids.jamie)).status).toBe(401);
  });

  it('returns 404 for an unknown member and 409 for a member already removed', async () => {
    expect((await remove(owner, crypto.randomUUID())).status).toBe(404);
    await remove(owner, ids.jamie);
    const again = await remove(owner, ids.jamie);
    expect(again.status).toBe(409);
    expect(again.json.code).toBe('MEMBER_REMOVED');
  });

  it('keeps a removed member out of new expenses, transfers and claims', async () => {
    await remove(owner, ids.jamie);

    const asPayer = await addExpense(owner, ids.jamie, 10_000, [ids.alex]);
    expect(asPayer.json.code).toBe('PAYER_NOT_IN_GROUP');
    const asParticipant = await addExpense(owner, ids.alex, 10_000, [ids.alex, ids.jamie]);
    expect(asParticipant.json.code).toBe('PARTICIPANT_NOT_IN_GROUP');
    const transfer = await owner.call('POST', `/groups/${code}/transfers`, { toId: ids.jamie, amount: 10_000 });
    expect(transfer.json.code).toBe('PARTICIPANT_NOT_IN_GROUP');

    const claim = await new Browser(env.env).call('POST', `/groups/${code}/members/${ids.jamie}/claim`);
    expect(claim.status).toBe(409);
    expect(claim.json.code).toBe('MEMBER_REMOVED');
  });

  it('keeps the name of a removed member taken', async () => {
    await remove(owner, ids.jamie);
    const res = await owner.call('POST', `/groups/${code}/members`, { name: 'jamie' });
    expect(res.json.code).toBe('DUPLICATE_NAME');
  });
});
