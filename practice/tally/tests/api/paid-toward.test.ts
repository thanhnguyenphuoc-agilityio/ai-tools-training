import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { computeBalances } from '../../shared/settle';
import type { GroupDto } from '../../shared/types';
import { Browser, createTestEnv, interleave } from './helpers';

// paid_toward (TAL-61): once a transfer involving an expense's payer or a member with a share above zero is recorded,
// the expense can no longer be edited or deleted. Hidden expenses still count in balances. Fake data only.
let env: Awaited<ReturnType<typeof createTestEnv>>;
let owner: Browser;
let sam: Browser;
let jamie: Browser;
let code: string;
let ids: { alex: string; sam: string; jamie: string };

const getGroup = (b: Browser) => b.call<GroupDto>('GET', `/groups/${code}`).then((r) => r.json);
const balancesOf = (g: GroupDto) =>
  Object.fromEntries(computeBalances(g.members.map((m) => m.id), g.expenses, g.transfers));
const today = '2026-10-10';

const newExpense = (payerId: string, amount: number, participants: string[], description = 'Hotpot') => ({
  payerId,
  amount,
  description,
  spentOn: today,
  splitMode: 'equal' as const,
  participants: participants.map((memberId) => ({ memberId, weight: 1 })),
});

const edit = (b: Browser, id: string, body: unknown) => b.call('PATCH', `/groups/${code}/expenses/${id}`, body);

/** Records a transfer and confirms it (the owner confirms, so any receiver works). */
async function settle(fromId: string, toId: string, amount: number) {
  const sent = await owner.call('POST', `/groups/${code}/transfers`, { fromId, toId, amount });
  expect(sent.status).toBe(201);
  expect((await owner.call('POST', `/groups/${code}/transfers/${sent.json.id}/confirm`)).status).toBe(200);
  return sent.json.id as string;
}

const auditRows = async (action: string) =>
  (
    await env.env.DB.prepare('SELECT actor, target FROM audit_log WHERE group_code = ? AND action = ?')
      .bind(code, action)
      .all<{ actor: string; target: string }>()
  ).results;

const activityAt = async () =>
  (await env.env.DB.prepare('SELECT last_activity_at FROM groups WHERE code = ?').bind(code).first<{
    last_activity_at: string;
  }>())!.last_activity_at;

beforeEach(async () => {
  env = await createTestEnv();
  owner = new Browser(env.env);
  sam = new Browser(env.env);
  jamie = new Browser(env.env);
  ({ code } = (await owner.call('POST', '/groups', { name: 'Trip', ownerName: 'Alex', currency: 'VND' })).json);
  const samId = (await sam.call('POST', `/groups/${code}/members`, { name: 'Sam', claim: true })).json.id;
  const jamieId = (await owner.call('POST', `/groups/${code}/members`, { name: 'Jamie' })).json.id;
  await jamie.call('POST', `/groups/${code}/members/${jamieId}/claim`);
  ids = { alex: (await getGroup(owner)).members.find((m) => m.isOwner)!.id, sam: samId, jamie: jamieId };
});

afterEach(async () => {
  await env.dispose();
});

describe('paid-toward expenses', () => {
  it('refuses to delete an expense after a confirmed transfer and keeps balances even', async () => {
    const added = await sam.call('POST', `/groups/${code}/expenses`, {
      payerId: ids.sam,
      amount: 300_000,
      description: 'Hotpot',
      spentOn: today,
      splitMode: 'equal',
      participants: [{ memberId: ids.alex }, { memberId: ids.sam }],
    });
    expect(added.status).toBe(201);

    const sent = await owner.call('POST', `/groups/${code}/transfers`, { fromId: ids.alex, toId: ids.sam, amount: 150_000 });
    expect(sent.status).toBe(201);
    expect((await owner.call('POST', `/groups/${code}/transfers/${sent.json.id}/confirm`)).status).toBe(200);

    const res = await owner.call('DELETE', `/groups/${code}/expenses/${added.json.id}`);
    expect(res.status).toBe(409);
    expect(res.json.code).toBe('EXPENSE_PAID_TOWARD');

    const group = await getGroup(owner);
    expect(group.expenses.map((e) => e.id)).toContain(added.json.id);
    expect(balancesOf(group)).toEqual({ [ids.alex]: 0, [ids.sam]: 0, [ids.jamie]: 0 });
  });

  it('refuses an edit of a paid-toward expense and leaves the row unchanged', async () => {
    const added = await sam.call('POST', `/groups/${code}/expenses`, newExpense(ids.sam, 300_000, [ids.alex, ids.sam]));
    await settle(ids.alex, ids.sam, 150_000);

    const res = await edit(sam, added.json.id, newExpense(ids.sam, 900_000, [ids.alex, ids.sam]));
    expect(res.status).toBe(409);
    expect(res.json.code).toBe('EXPENSE_PAID_TOWARD');
    const stored = (await getGroup(owner)).expenses.find((e) => e.id === added.json.id)!;
    expect(stored.amount).toBe(300_000);
    expect(stored.editedAt).toBeNull();
    expect(await auditRows('expense.edit')).toHaveLength(0);
  });

  it('lets an expense added after the transfer be edited and deleted', async () => {
    await settle(ids.alex, ids.sam, 150_000);
    const added = await sam.call('POST', `/groups/${code}/expenses`, newExpense(ids.sam, 90_000, [ids.alex, ids.sam]));
    expect(added.status).toBe(201);

    expect((await edit(sam, added.json.id, newExpense(ids.sam, 120_000, [ids.alex, ids.sam]))).status).toBe(200);
    expect((await sam.call('DELETE', `/groups/${code}/expenses/${added.json.id}`)).status).toBe(200);
  });

  it('counts a sent (unconfirmed) transfer as paid toward', async () => {
    const added = await sam.call('POST', `/groups/${code}/expenses`, newExpense(ids.sam, 300_000, [ids.alex, ids.sam]));
    // Recorded as sent only: nobody has confirmed it yet.
    const sent = await owner.call('POST', `/groups/${code}/transfers`, { fromId: ids.alex, toId: ids.sam, amount: 150_000 });
    expect(sent.status).toBe(201);

    const res = await owner.call('DELETE', `/groups/${code}/expenses/${added.json.id}`);
    expect(res.status).toBe(409);
    expect(res.json.code).toBe('EXPENSE_PAID_TOWARD');
  });

  it('does not lock an expense for a transfer between two members who are not in it', async () => {
    // Riley is a fourth member, outside the expense. The expense is paid by Sam and shared by Sam and Jamie.
    const riley = (await owner.call('POST', `/groups/${code}/members`, { name: 'Riley' })).json.id as string;
    const added = await sam.call('POST', `/groups/${code}/expenses`, newExpense(ids.sam, 200_000, [ids.sam, ids.jamie]));
    expect(added.status).toBe(201);

    // Alex (no share, not the payer) pays Riley (no share, not the payer): neither side is involved.
    await settle(ids.alex, riley, 40_000);
    expect((await owner.call('DELETE', `/groups/${code}/expenses/${added.json.id}`)).status).toBe(200);
  });

  it('ignores a member with a zero share in an exact split', async () => {
    const res = await owner.call('POST', `/groups/${code}/expenses`, {
      payerId: ids.alex,
      amount: 100_000,
      description: 'Exact',
      spentOn: today,
      splitMode: 'exact',
      participants: [
        { memberId: ids.alex, amount: 100_000 },
        { memberId: ids.sam, amount: 0 },
      ],
    });
    expect(res.status).toBe(201);
    // Sam owes nothing here, so a transfer that involves only Sam does not lock the expense.
    await settle(ids.sam, ids.jamie, 5_000);

    const del = await owner.call('DELETE', `/groups/${code}/expenses/${res.json.id}`);
    expect(del.status).toBe(200);
  });

  it('hides and unhides a paid-toward expense for its author and the owner, with audit and activity', async () => {
    const added = await sam.call('POST', `/groups/${code}/expenses`, newExpense(ids.sam, 300_000, [ids.alex, ids.sam]));
    await settle(ids.alex, ids.sam, 150_000);
    await env.env.DB.prepare('UPDATE groups SET last_activity_at = ? WHERE code = ?')
      .bind('2026-10-01T00:00:00.000Z', code)
      .run();
    const before = balancesOf(await getGroup(owner));

    const hidden = await sam.call('POST', `/groups/${code}/expenses/${added.json.id}/hide`, { hidden: true });
    expect(hidden).toEqual({ status: 200, json: { ok: true, changed: true } });
    const afterHide = await getGroup(owner);
    expect(afterHide.expenses.find((e) => e.id === added.json.id)!.hiddenAt).not.toBeNull();
    expect(balancesOf(afterHide)).toEqual(before);
    expect(await auditRows('expense.hide')).toHaveLength(1);
    expect(await activityAt()).not.toBe('2026-10-01T00:00:00.000Z');

    const again = await sam.call('POST', `/groups/${code}/expenses/${added.json.id}/hide`, { hidden: true });
    expect(again.json).toEqual({ ok: true, changed: false });
    expect(await auditRows('expense.hide')).toHaveLength(1);

    const shown = await owner.call('POST', `/groups/${code}/expenses/${added.json.id}/hide`, { hidden: false });
    expect(shown.json).toEqual({ ok: true, changed: true });
    expect((await getGroup(owner)).expenses.find((e) => e.id === added.json.id)!.hiddenAt).toBeNull();
    expect(await auditRows('expense.unhide')).toHaveLength(1);
  }, 30_000);

  it('refuses hide for another member, a guest, and an expense nobody has paid toward', async () => {
    const added = await sam.call('POST', `/groups/${code}/expenses`, newExpense(ids.sam, 300_000, [ids.alex, ids.sam]));
    const open = await sam.call('POST', `/groups/${code}/expenses/${added.json.id}/hide`, { hidden: true });
    expect(open.status).toBe(409);
    expect(open.json.code).toBe('EXPENSE_NOT_PAID_TOWARD');

    await settle(ids.alex, ids.sam, 150_000);
    const other = await jamie.call('POST', `/groups/${code}/expenses/${added.json.id}/hide`, { hidden: true });
    expect(other.status).toBe(403);
    expect(other.json.code).toBe('HIDE_NOT_ALLOWED');

    const guest = new Browser(env.env);
    const stranger = await guest.call('POST', `/groups/${code}/expenses/${added.json.id}/hide`, { hidden: true });
    expect(stranger.status).toBe(401);
    expect(stranger.json.code).toBe('JOIN_FIRST');
    expect(await auditRows('expense.hide')).toHaveLength(0);
  });

  it('rejects a body without a boolean hidden flag', async () => {
    const added = await sam.call('POST', `/groups/${code}/expenses`, newExpense(ids.sam, 300_000, [ids.alex, ids.sam]));
    const res = await sam.call('POST', `/groups/${code}/expenses/${added.json.id}/hide`, { hidden: 'yes' });
    expect(res.status).toBe(400);
    expect(res.json.code).toBe('FIELD_REQUIRED');
  });

  it('race: a transfer recorded before the delete commits is seen by the lock', async () => {
    const added = await sam.call('POST', `/groups/${code}/expenses`, newExpense(ids.sam, 300_000, [ids.alex, ids.sam]));
    const raced = owner.withEnv({
      ...env.env,
      DB: interleave(env.env.DB, /UPDATE expenses SET deleted_at/, () =>
        owner.call('POST', `/groups/${code}/transfers`, { fromId: ids.alex, toId: ids.sam, amount: 150_000 }),
      ),
    });
    const res = await raced.call('DELETE', `/groups/${code}/expenses/${added.json.id}`);
    expect(res.status).toBe(409);
    expect(res.json.code).toBe('EXPENSE_PAID_TOWARD');
    const row = await env.env.DB.prepare('SELECT deleted_at FROM expenses WHERE id = ?').bind(added.json.id).first<{
      deleted_at: string | null;
    }>();
    expect(row!.deleted_at).toBeNull();
  });
});
