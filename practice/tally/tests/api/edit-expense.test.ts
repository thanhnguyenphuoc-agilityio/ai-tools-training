import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { computeBalances } from '../../shared/settle';
import type { GroupDto } from '../../shared/types';
import { Browser, createTestEnv, interleave, signIn } from './helpers';

// edit_expense: the author or the owner edits any field; the previous values go to the audit log; the stored
// shares are recomputed only when the amount, payer, participants or split change. Fake data only.
let env: Awaited<ReturnType<typeof createTestEnv>>;
let owner: Browser;
let sam: Browser;
let jamie: Browser;
let code: string;
let ownerKey: string;
let ids: { alex: string; sam: string; jamie: string };

const getGroup = (b: Browser) => b.call<GroupDto>('GET', `/groups/${code}`).then((r) => r.json);
const today = '2026-10-10';

const newExpense = (payerId: string, amount: number, participants: string[], description = 'Utilities') => ({
  payerId,
  amount,
  description,
  spentOn: today,
  splitMode: 'equal' as const,
  participants: participants.map((memberId) => ({ memberId, weight: 1 })),
});

const edit = (b: Browser, id: string, body: unknown) => b.call('PATCH', `/groups/${code}/expenses/${id}`, body);

const balancesOf = (g: GroupDto) =>
  Object.fromEntries(computeBalances(g.members.map((m) => m.id), g.expenses, g.transfers));

const auditRows = async (action: string) =>
  (
    await env.env.DB.prepare('SELECT actor, target, details FROM audit_log WHERE group_code = ? AND action = ?')
      .bind(code, action)
      .all<{ actor: string; target: string; details: string | null }>()
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
  ({ code, ownerKey } = (await owner.call('POST', '/groups', { name: 'Shared house', ownerName: 'Alex' })).json);
  const samId = (await sam.call('POST', `/groups/${code}/members`, { name: 'Sam', claim: true })).json.id;
  const jamieId = (await owner.call('POST', `/groups/${code}/members`, { name: 'Jamie' })).json.id;
  await jamie.call('POST', `/groups/${code}/members/${jamieId}/claim`);
  ids = { alex: (await getGroup(owner)).members.find((m) => m.isOwner)!.id, sam: samId, jamie: jamieId };
});

afterEach(async () => {
  await env.dispose();
});

describe('editing an expense', () => {
  let expenseId: string;

  // Sam added an expense of 200,000 that Alex paid, split between the three.
  beforeEach(async () => {
    const res = await sam.call(
      'POST',
      `/groups/${code}/expenses`,
      newExpense(ids.alex, 200_000, [ids.alex, ids.sam, ids.jamie]),
    );
    expect(res.status).toBe(201);
    expenseId = res.json.id;
  });

  it('lets the author change the amount and recomputes the shares', async () => {
    const res = await edit(
      sam,
      expenseId,
      newExpense(ids.alex, 300_000, [ids.alex, ids.sam, ids.jamie], 'Utilities, corrected'),
    );
    expect(res.status).toBe(200);
    expect(res.json.sharesChanged).toBe(true);
    expect(res.json.changed).toBe(true);

    const expense = (await getGroup(owner)).expenses.find((e) => e.id === expenseId)!;
    expect(expense.amount).toBe(300_000);
    expect(expense.description).toBe('Utilities, corrected');
    expect(expense.shares.map((s) => s.amount)).toEqual([100_000, 100_000, 100_000]);
    expect(expense.editedAt).not.toBeNull();
    expect(balancesOf(await getGroup(owner))).toEqual({
      [ids.alex]: 200_000,
      [ids.sam]: -100_000,
      [ids.jamie]: -100_000,
    });
  });

  it('marks the expense as edited, records the previous values and moves last_activity_at', async () => {
    const before = await activityAt();
    expect(
      (await edit(sam, expenseId, newExpense(ids.alex, 240_000, [ids.alex, ids.sam, ids.jamie]))).status,
    ).toBe(200);

    const rows = await auditRows('expense.edit');
    expect(rows).toHaveLength(1);
    expect(rows[0].actor).toBe(ids.sam);
    expect(rows[0].target).toBe(expenseId);
    const details = JSON.parse(rows[0].details!);
    expect(details.previous).toMatchObject({
      amount: 200_000,
      payerId: ids.alex,
      description: 'Utilities',
      spentOn: today,
    });
    expect(details.previous.shares).toEqual([
      { memberId: ids.alex, weight: 1, amount: 66_667 },
      { memberId: ids.sam, weight: 1, amount: 66_667 },
      { memberId: ids.jamie, weight: 1, amount: 66_666 },
    ]);
    expect(details.sharesChanged).toBe(true);
    expect(await activityAt()).not.toBe(before);
  });

  it('keeps the stored shares when only the date or the description changes', async () => {
    const before = (await getGroup(owner)).expenses.find((e) => e.id === expenseId)!;
    const res = await edit(sam, expenseId, {
      ...newExpense(ids.alex, 200_000, [ids.alex, ids.sam, ids.jamie]),
      description: 'Electricity',
      spentOn: '2026-10-09',
    });
    expect(res.status).toBe(200);
    expect(res.json.sharesChanged).toBe(false);

    const after = (await getGroup(owner)).expenses.find((e) => e.id === expenseId)!;
    expect(after.description).toBe('Electricity');
    expect(after.spentOn).toBe('2026-10-09');
    expect(after.shares).toEqual(before.shares);
    expect(JSON.parse((await auditRows('expense.edit'))[0].details!).sharesChanged).toBe(false);
  });

  it('does not mark the expense when the request repeats the stored values', async () => {
    const before = await activityAt();
    const res = await edit(sam, expenseId, newExpense(ids.alex, 200_000, [ids.alex, ids.sam, ids.jamie]));
    expect(res.status).toBe(200);
    expect(res.json.sharesChanged).toBe(false);
    expect(res.json.changed).toBe(false);
    expect((await getGroup(owner)).expenses.find((e) => e.id === expenseId)!.editedAt).toBeNull();
    expect(await auditRows('expense.edit')).toHaveLength(0);
    expect(await activityAt()).toBe(before);
  });

  it('treats the same participants in another order as unchanged', async () => {
    const body = newExpense(ids.alex, 200_000, [ids.jamie, ids.sam, ids.alex]);
    const res = await edit(sam, expenseId, body);
    expect(res.status).toBe(200);
    expect(res.json.changed).toBe(false);
    expect(res.json.sharesChanged).toBe(false);
  });

  it('treats a weight within tolerance as unchanged on edit', async () => {
    const res = await sam.call('POST', `/groups/${code}/expenses`, {
      payerId: ids.alex,
      amount: 330_000,
      description: 'Dinner',
      spentOn: today,
      splitMode: 'weight',
      participants: [
        { memberId: ids.alex, weight: 2.3 },
        { memberId: ids.sam, weight: 1 },
      ],
    });
    expect(res.status).toBe(201);
    const weightedId = res.json.id;

    const patchRes = await edit(sam, weightedId, {
      payerId: ids.alex,
      amount: 330_000,
      description: 'Dinner',
      spentOn: today,
      splitMode: 'weight',
      participants: [
        { memberId: ids.alex, weight: 2.3000000000001 },
        { memberId: ids.sam, weight: 1 },
      ],
    });
    expect(patchRes.status).toBe(200);
    expect(patchRes.json.changed).toBe(false);
    expect(patchRes.json.sharesChanged).toBe(false);

    const expense = (await getGroup(owner)).expenses.find((e) => e.id === weightedId)!;
    expect(expense.editedAt).toBeNull();
  });

  it('recomputes with the rounding setting current at the time of the edit', async () => {
    expect((await owner.call('PATCH', `/groups/${code}`, { roundTo: 1000 })).status).toBe(200);
    // The stored shares stay while the split is unchanged, even though the group now rounds to 1,000.
    const unchanged = await edit(sam, expenseId, newExpense(ids.alex, 200_000, [ids.alex, ids.sam, ids.jamie]));
    expect(unchanged.json.sharesChanged).toBe(false);
    const kept = Object.fromEntries(
      (await getGroup(owner)).expenses.find((e) => e.id === expenseId)!.shares.map((s) => [s.memberId, s.amount]),
    );
    expect(kept).toEqual({ [ids.alex]: 66_667, [ids.sam]: 66_667, [ids.jamie]: 66_666 });

    // A new amount is a new save: whole thousands per person, and the leftover that cannot be split goes to the payer.
    const res = await edit(sam, expenseId, newExpense(ids.alex, 200_500, [ids.alex, ids.sam, ids.jamie]));
    expect(res.status).toBe(200);
    const shares = Object.fromEntries(
      (await getGroup(owner)).expenses.find((e) => e.id === expenseId)!.shares.map((s) => [s.memberId, s.amount]),
    );
    expect(shares[ids.sam] % 1000).toBe(0);
    expect(shares[ids.jamie] % 1000).toBe(0);
    expect(shares[ids.alex]).toBe(200_500 - shares[ids.sam] - shares[ids.jamie]);
    expect(shares[ids.alex] % 1000).toBe(500);
  });

  it('lets the owner edit an expense someone else added', async () => {
    expect((await edit(owner, expenseId, newExpense(ids.alex, 100_000, [ids.alex, ids.sam]))).status).toBe(200);
    const expense = (await getGroup(owner)).expenses.find((e) => e.id === expenseId)!;
    expect(expense.shares.map((s) => s.memberId).sort()).toEqual([ids.alex, ids.sam].sort());
  });

  it('lets the owner edit from a device that holds only the owner key', async () => {
    const laptop = new Browser(env.env);
    expect((await laptop.call('POST', `/groups/${code}/owner/claim`, { ownerKey })).status).toBe(200);
    expect((await edit(laptop, expenseId, newExpense(ids.alex, 90_000, [ids.alex, ids.sam]))).status).toBe(200);
  });

  it('refuses a member who is neither the author nor the owner, and keeps the expense', async () => {
    const res = await edit(jamie, expenseId, newExpense(ids.alex, 300_000, [ids.alex, ids.sam, ids.jamie]));
    expect(res.status).toBe(403);
    expect(res.json.code).toBe('EDIT_NOT_ALLOWED');
    expect((await getGroup(owner)).expenses.find((e) => e.id === expenseId)!.amount).toBe(200_000);
  });

  it('refuses a guest who has not joined', async () => {
    const guest = new Browser(env.env);
    const res = await edit(guest, expenseId, newExpense(ids.alex, 300_000, [ids.alex, ids.sam, ids.jamie]));
    expect(res.status).toBe(401);
    expect(res.json.code).toBe('JOIN_FIRST');
  });

  it('lets only the owner edit an expense with no recorded author', async () => {
    // A hard-deleted author (the column is ON DELETE SET NULL) leaves created_by empty.
    await env.env.DB.prepare('UPDATE expenses SET created_by = NULL WHERE id = ?').bind(expenseId).run();
    expect((await edit(sam, expenseId, newExpense(ids.alex, 300_000, [ids.alex, ids.sam]))).status).toBe(403);
    expect((await edit(owner, expenseId, newExpense(ids.alex, 300_000, [ids.alex, ids.sam]))).status).toBe(200);
  });

  it('answers 404 for an unknown or deleted expense', async () => {
    expect((await edit(sam, 'missing', newExpense(ids.alex, 1000, [ids.alex]))).status).toBe(404);
    expect((await sam.call('DELETE', `/groups/${code}/expenses/${expenseId}`)).status).toBe(200);
    expect((await edit(sam, expenseId, newExpense(ids.alex, 1000, [ids.alex]))).status).toBe(404);
  });

  it('validates the body like a new expense and changes nothing on failure', async () => {
    const cases: [unknown, number, string][] = [
      [{ ...newExpense(ids.alex, 200_000, [ids.alex]), amount: 0 }, 400, 'INVALID_AMOUNT'],
      [{ ...newExpense(ids.alex, 200_000, [ids.alex]), spentOn: '2026-02-30' }, 400, 'INVALID_DATE'],
      [{ ...newExpense(ids.alex, 200_000, [ids.alex]), participants: [] }, 400, 'NO_PARTICIPANTS'],
      [{ ...newExpense(ids.alex, 200_000, [ids.alex]), payerId: 'nope' }, 400, 'PAYER_NOT_IN_GROUP'],
      [
        {
          ...newExpense(ids.alex, 200_000, [ids.alex]),
          participants: [{ memberId: ids.alex }, { memberId: ids.alex }],
        },
        400,
        'DUPLICATE_PARTICIPANT',
      ],
      [
        {
          ...newExpense(ids.alex, 200_000, [ids.alex]),
          splitMode: 'exact',
          participants: [{ memberId: ids.alex, amount: 1 }],
        },
        400,
        'SPLIT_SUM_MISMATCH',
      ],
    ];
    for (const [body, status, errorCode] of cases) {
      const res = await edit(sam, expenseId, body);
      expect(res.status, errorCode).toBe(status);
      expect(res.json.code, errorCode).toBe(errorCode);
    }
    const expense = (await getGroup(owner)).expenses.find((e) => e.id === expenseId)!;
    expect(expense.amount).toBe(200_000);
    expect(expense.editedAt).toBeNull();
    expect(await auditRows('expense.edit')).toHaveLength(0);
  }, 20000);

  it('accepts an exact split edit and stores the typed shares', async () => {
    const res = await edit(sam, expenseId, {
      ...newExpense(ids.alex, 200_000, []),
      splitMode: 'exact',
      participants: [
        { memberId: ids.alex, amount: 150_000 },
        { memberId: ids.sam, amount: 50_000 },
      ],
    });
    expect(res.status).toBe(200);
    const expense = (await getGroup(owner)).expenses.find((e) => e.id === expenseId)!;
    expect(expense.splitMode).toBe('exact');
    const shares = Object.fromEntries(expense.shares.map((s) => [s.memberId, s.amount]));
    expect(shares).toEqual({ [ids.alex]: 150_000, [ids.sam]: 50_000 });
    expect(expense.shares.every((s) => s.weight === 1)).toBe(true);
  });

  it('leaves sent and confirmed transfers untouched', async () => {
    const { json: transfer } = await jamie.call('POST', `/groups/${code}/transfers`, {
      toId: ids.alex,
      amount: 20_000,
    });
    expect((await owner.call('POST', `/groups/${code}/transfers/${transfer.id}/confirm`)).status).toBe(200);
    expect(
      (await edit(sam, expenseId, newExpense(ids.alex, 300_000, [ids.alex, ids.sam, ids.jamie]))).status,
    ).toBe(200);
    const group = await getGroup(owner);
    expect(group.transfers).toHaveLength(1);
    expect(group.transfers[0]).toMatchObject({ id: transfer.id, amount: 20_000, status: 'confirmed' });
  });
});

describe('editing an expense that involves a removed member', () => {
  const remove = (id: string) => owner.call('POST', `/groups/${code}/members/${id}/remove`, {});
  const settle = async (fromId: string, toId: string, amount: number) => {
    const { json } = await owner.call('POST', `/groups/${code}/transfers`, { fromId, toId, amount });
    expect((await owner.call('POST', `/groups/${code}/transfers/${json.id}/confirm`)).status).toBe(200);
  };
  const stored = async (id: string) => (await getGroup(owner)).expenses.find((e) => e.id === id)!;
  const add = async (body: unknown) => {
    const res = await sam.call('POST', `/groups/${code}/expenses`, body);
    expect(res.status).toBe(201);
    return res.json.id as string;
  };

  it('refuses an edit when the removed member owes a non-zero share, as the author and as the owner', async () => {
    const id = await add(newExpense(ids.alex, 90_000, [ids.alex, ids.jamie]));
    await settle(ids.jamie, ids.alex, 45_000);
    expect((await remove(ids.jamie)).status).toBe(200);
    const before = await stored(id);

    for (const editor of [sam, owner]) {
      const res = await edit(editor, id, newExpense(ids.alex, 100_000, [ids.alex, ids.sam]));
      expect(res.status).toBe(409);
      expect(res.json.code).toBe('EXPENSE_HAS_REMOVED_MEMBER');
    }

    const after = await stored(id);
    expect(after.amount).toBe(90_000);
    expect(after.shares).toEqual(before.shares);
    expect(after.editedAt).toBeNull();
    expect(await auditRows('expense.edit')).toHaveLength(0);
  }, 20000);

  it('refuses an edit when the removed member paid the expense', async () => {
    const id = await add(newExpense(ids.jamie, 90_000, [ids.alex, ids.jamie]));
    await settle(ids.alex, ids.jamie, 45_000);
    expect((await remove(ids.jamie)).status).toBe(200);

    const res = await edit(sam, id, newExpense(ids.alex, 100_000, [ids.alex]));
    expect(res.status).toBe(409);
    expect(res.json.code).toBe('EXPENSE_HAS_REMOVED_MEMBER');
    expect((await stored(id)).amount).toBe(90_000);
  });

  it('still edits an expense in which the removed member owes zero', async () => {
    const id = await add({
      ...newExpense(ids.alex, 90_000, []),
      splitMode: 'exact',
      participants: [
        { memberId: ids.alex, amount: 60_000 },
        { memberId: ids.sam, amount: 30_000 },
        { memberId: ids.jamie, amount: 0 },
      ],
    });
    expect((await remove(ids.jamie)).status).toBe(200);

    const res = await edit(sam, id, { ...newExpense(ids.alex, 90_000, [ids.alex]), description: 'Groceries' });
    expect(res.status).toBe(200);
    const expense = await stored(id);
    expect(expense.description).toBe('Groceries');
    expect(expense.editedAt).not.toBeNull();
  });
});

describe('editing an expense in a kept group', () => {
  it('succeeds and is recorded, because a lock only stops deletion', async () => {
    await signIn(owner, 'alex@example.com');
    const { json: added } = await owner.call(
      'POST',
      `/groups/${code}/expenses`,
      newExpense(ids.alex, 90_000, [ids.alex, ids.sam]),
    );
    expect((await owner.call('POST', `/groups/${code}/lock`)).status).toBe(200);

    const res = await edit(owner, added.id, newExpense(ids.alex, 120_000, [ids.alex, ids.sam]));
    expect(res.status).toBe(200);
    expect(res.json.changed).toBe(true);
    const expense = (await getGroup(owner)).expenses.find((e) => e.id === added.id)!;
    expect(expense.amount).toBe(120_000);
    expect(expense.editedAt).not.toBeNull();
    expect(await auditRows('expense.edit')).toHaveLength(1);
    const locked = await env.env.DB.prepare('SELECT locked_at FROM groups WHERE code = ?')
      .bind(code)
      .first<{ locked_at: string | null }>();
    expect(locked?.locked_at).not.toBeNull();
  }, 20000);
});

describe('editing an expense while a member is removed', () => {
  const markRemoved = (id: string) =>
    env.env.DB.prepare('UPDATE members SET removed_at = ? WHERE id = ?').bind(new Date().toISOString(), id).run();

  it('refuses the edit when a participant is removed between the check and the update', async () => {
    const { json: added } = await sam.call(
      'POST',
      `/groups/${code}/expenses`,
      newExpense(ids.alex, 90_000, [ids.alex, ids.jamie]),
    );
    const raced = sam.withEnv({
      ...env.env,
      DB: interleave(env.env.DB, /UPDATE expenses SET payer_id/, () => markRemoved(ids.jamie)),
    });
    const res = await edit(raced, added.id, newExpense(ids.alex, 120_000, [ids.alex, ids.sam]));
    expect([400, 409]).toContain(res.status);
    expect(['EXPENSE_HAS_REMOVED_MEMBER', 'PARTICIPANT_NOT_IN_GROUP']).toContain(res.json.code);

    const expense = (await getGroup(owner)).expenses.find((e) => e.id === added.id)!;
    expect(expense.amount).toBe(90_000);
    expect(expense.editedAt).toBeNull();
    expect(await auditRows('expense.edit')).toHaveLength(0);
  });
});
