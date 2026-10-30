// Adding, editing and deleting expenses. Shares are computed at write time; an edit recomputes them only when
// something they depend on changes (edit_expense).
import { Hono } from 'hono';
import { expenseFieldsChanged, splitChanged } from '../../shared/expenseEdit';
import { exactSplitDifference, splitAmount, splitExact } from '../../shared/money';
import type { NewExpense, SplitMode } from '../../shared/types';
import {
  involvesRemovedMember,
  isExpensePaidToward,
  loadActiveMemberIds,
  loadGroup,
  noneRemovedSql,
  paidTowardSql,
  recordChange,
} from '../groupData';
import { amount, ApiError, isoDate, now, readJson, shareAmount, text, weight, type AppEnv, type Ctx } from '../http';
import {
  requireCanDeleteExpense,
  requireCanEditExpense,
  requireCanHideExpense,
  requireMember,
} from '../policy';
import { deleteExpenseReceipt } from '../receipts';

export const expenseRoutes = new Hono<AppEnv>();

interface ParsedExpense {
  payerId: string;
  total: number;
  description: string;
  spentOn: string;
  splitMode: SplitMode;
  participants: { memberId: string; weight: number; amount: number }[];
  /** The share of each participant, from the group's rounding (or the typed amounts in exact mode). */
  shares: Map<string, number>;
  /** The session of the group the cost belongs to (attendance_split); null when none. */
  sessionId: string | null;
}

/** A session id from the body: null, empty or absent means none; otherwise it must be a session of this group. */
async function parseSessionId(db: D1Database, code: string, value: unknown): Promise<string | null> {
  if (value === undefined || value === null || value === '') return null;
  const sessionId = text(value, 'sessionId', 64);
  const found = await db
    .prepare('SELECT 1 FROM group_sessions WHERE id = ? AND group_code = ?')
    .bind(sessionId, code)
    .first();
  if (!found) throw new ApiError(400, 'SESSION_NOT_FOUND', 'session not found');
  return sessionId;
}

/** D1 reports a foreign key failure when the session was removed after parseSessionId read it. */
const isSessionGone = (err: unknown): boolean =>
  err instanceof Error && err.message.includes('FOREIGN KEY constraint failed');

/**
 * Reads and validates an expense body, the same way for a new expense and an edit (edit_expense).
 * `roundTo` is the group's current rounding setting: an edit counts as a new save.
 */
async function parseExpense(c: Ctx, code: string, roundTo: number): Promise<ParsedExpense> {
  const body = (await readJson(c)) as Partial<Record<keyof NewExpense, unknown>>;
  // Removed members stay in the history but cannot pay or share an expense.
  const memberIds = await loadActiveMemberIds(c.env.DB, code);

  const payerId = text(body.payerId, 'payerId', 64);
  if (!memberIds.has(payerId)) throw new ApiError(400, 'PAYER_NOT_IN_GROUP', 'payer is not in this group');
  const total = amount(body.amount);
  const description = text(body.description, 'description', 120);
  const spentOn = isoDate(body.spentOn);
  const splitMode: SplitMode = body.splitMode === 'weight' || body.splitMode === 'exact' ? body.splitMode : 'equal';
  const sessionId = await parseSessionId(c.env.DB, code, body.sessionId);

  if (!Array.isArray(body.participants) || body.participants.length === 0) {
    throw new ApiError(400, 'NO_PARTICIPANTS', 'pick at least one participant');
  }
  const seen = new Set<string>();
  const participants = body.participants.map((p: { memberId?: unknown; weight?: unknown; amount?: unknown }) => {
    const memberId = text(p?.memberId, 'participant', 64);
    if (!memberIds.has(memberId))
      throw new ApiError(400, 'PARTICIPANT_NOT_IN_GROUP', 'participant is not in this group');
    if (seen.has(memberId)) throw new ApiError(400, 'DUPLICATE_PARTICIPANT', 'duplicate participant');
    seen.add(memberId);
    return {
      memberId,
      weight: splitMode === 'weight' ? weight(p?.weight) : 1,
      amount: splitMode === 'exact' ? shareAmount(p?.amount) : 0,
    };
  });

  // Exact amounts are stored as typed: the group rounding setting does not apply to them.
  if (splitMode === 'exact' && exactSplitDifference(total, participants) !== 0) {
    throw new ApiError(400, 'SPLIT_SUM_MISMATCH', 'participant amounts must add up exactly to the amount');
  }
  const shares =
    splitMode === 'exact'
      ? splitExact(total, participants)
      : splitAmount(total, participants, { roundTo, payerId });
  return { payerId, total, description, spentOn, splitMode, participants, shares, sessionId };
}

expenseRoutes.post('/:code/expenses', async (c) => {
  const { group, me } = await loadGroup(c);
  const author = requireMember(me);
  const parsed = await parseExpense(c, group.code, group.round_to);
  const id = crypto.randomUUID();
  // The member check is repeated inside the batch (one transaction): a member removed since loadActiveMemberIds
  // makes the expense INSERT write nothing, and the shares are only written next to an expense row.
  const named = JSON.stringify([parsed.payerId, ...parsed.participants.map((p) => p.memberId)]);
  let inserted: D1Result;
  try {
    [inserted] = await c.env.DB.batch([
      c.env.DB.prepare(
        `INSERT INTO expenses (id, group_code, payer_id, amount, description, spent_on, split_mode, session_id, created_by, created_at)
         SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10 WHERE ${noneRemovedSql(11)}`,
      ).bind(
        id,
        group.code,
        parsed.payerId,
        parsed.total,
        parsed.description,
        parsed.spentOn,
        parsed.splitMode,
        parsed.sessionId,
        author,
        now(),
        named,
      ),
      ...parsed.participants.map((p) =>
        c.env.DB.prepare(
          `INSERT INTO expense_shares (expense_id, member_id, weight, amount)
           SELECT ?1, ?2, ?3, ?4 WHERE EXISTS (SELECT 1 FROM expenses WHERE id = ?1)`,
        ).bind(id, p.memberId, p.weight, parsed.shares.get(p.memberId)!),
      ),
    ]);
  } catch (err) {
    if (isSessionGone(err)) throw new ApiError(400, 'SESSION_NOT_FOUND', 'session not found');
    throw err;
  }
  if (inserted.meta.changes === 0) {
    const active = await loadActiveMemberIds(c.env.DB, group.code);
    if (!active.has(parsed.payerId)) throw new ApiError(400, 'PAYER_NOT_IN_GROUP', 'payer is not in this group');
    throw new ApiError(400, 'PARTICIPANT_NOT_IN_GROUP', 'participant is not in this group');
  }
  await recordChange(c.env.DB, group.code, me, 'expense.add', id);
  return c.json({ id }, 201);
});

// edit_expense: the author or the owner changes any field. The previous values go to the audit log. The stored
// shares are recomputed only when the amount, payer, participants, weights or typed amounts change; a repeat of the
// stored values writes nothing.
expenseRoutes.patch('/:code/expenses/:id', async (c) => {
  const { group, me } = await loadGroup(c);
  const id = c.req.param('id');
  const expense = await c.env.DB.prepare(
    'SELECT payer_id, amount, description, spent_on, split_mode, session_id, created_by FROM expenses WHERE id = ? AND group_code = ? AND deleted_at IS NULL',
  )
    .bind(id, group.code)
    .first<{
      payer_id: string;
      amount: number;
      description: string;
      spent_on: string;
      split_mode: SplitMode;
      session_id: string | null;
      created_by: string | null;
    }>();
  if (!expense) throw new ApiError(404, 'EXPENSE_NOT_FOUND', 'expense not found');
  requireCanEditExpense(me, expense);
  if (await involvesRemovedMember(c.env.DB, group.code, id)) {
    throw new ApiError(409, 'EXPENSE_HAS_REMOVED_MEMBER', 'this expense involves a removed member');
  }
  if (await isExpensePaidToward(c.env.DB, group.code, id)) {
    throw new ApiError(409, 'EXPENSE_PAID_TOWARD', 'someone has already paid toward this expense');
  }

  const { results: shareRows } = await c.env.DB.prepare(
    'SELECT member_id, weight, amount FROM expense_shares WHERE expense_id = ? ORDER BY rowid',
  )
    .bind(id)
    .all<{ member_id: string; weight: number; amount: number }>();
  const previousShares = shareRows.map((s) => ({ memberId: s.member_id, weight: s.weight, amount: s.amount }));

  const parsed = await parseExpense(c, group.code, group.round_to);
  const previous = {
    amount: expense.amount,
    payerId: expense.payer_id,
    description: expense.description,
    spentOn: expense.spent_on,
    splitMode: expense.split_mode,
    sessionId: expense.session_id ?? null,
    shares: previousShares,
  };
  const sharesChanged = splitChanged(previous, {
    amount: parsed.total,
    payerId: parsed.payerId,
    splitMode: parsed.splitMode,
    participants: parsed.participants,
  });
  const fieldsChanged = expenseFieldsChanged(previous, {
    amount: parsed.total,
    payerId: parsed.payerId,
    description: parsed.description,
    spentOn: parsed.spentOn,
    splitMode: parsed.splitMode,
    sessionId: parsed.sessionId,
  });
  // A request that repeats the stored values is not an edit: nothing is written and the row is not marked.
  if (!fieldsChanged && !sharesChanged) return c.json({ id, sharesChanged: false, changed: false });

  const named = JSON.stringify([parsed.payerId, ...parsed.participants.map((p) => p.memberId)]);
  const editedAt = now();
  const statements = [
    // The removed-member check is repeated here, so a removal committed after the reads above cannot be
    // followed by an edit that names the removed member. The member check is the same as in deletion.
    c.env.DB.prepare(
      `UPDATE expenses SET payer_id = ?1, amount = ?2, description = ?3, spent_on = ?4, split_mode = ?5, edited_at = ?6, session_id = ?10
       WHERE id = ?7 AND group_code = ?8 AND deleted_at IS NULL
         AND ${noneRemovedSql(9)}
         AND NOT EXISTS (
           SELECT 1 FROM members m
           WHERE m.group_code = ?8 AND m.removed_at IS NOT NULL
             AND (m.id = expenses.payer_id
                  OR m.id IN (SELECT member_id FROM expense_shares WHERE expense_id = ?7 AND amount <> 0))
         )
         AND NOT ${paidTowardSql(7, 8)}`,
    ).bind(
      parsed.payerId,
      parsed.total,
      parsed.description,
      parsed.spentOn,
      parsed.splitMode,
      editedAt,
      id,
      group.code,
      named,
      parsed.sessionId,
    ),
  ];
  if (sharesChanged) {
    // Gated on edited_at: when the UPDATE above changed nothing, these write nothing either.
    statements.push(
      c.env.DB.prepare(
        'DELETE FROM expense_shares WHERE expense_id = ?1 AND EXISTS (SELECT 1 FROM expenses WHERE id = ?1 AND edited_at = ?2)',
      ).bind(id, editedAt),
    );
    for (const p of parsed.participants) {
      statements.push(
        c.env.DB.prepare(
          `INSERT INTO expense_shares (expense_id, member_id, weight, amount)
           SELECT ?1, ?2, ?3, ?4 WHERE EXISTS (SELECT 1 FROM expenses WHERE id = ?1 AND edited_at = ?5)`,
        ).bind(id, p.memberId, p.weight, parsed.shares.get(p.memberId)!, editedAt),
      );
    }
  }
  let updated: D1Result;
  try {
    [updated] = await c.env.DB.batch(statements);
  } catch (err) {
    if (isSessionGone(err)) throw new ApiError(400, 'SESSION_NOT_FOUND', 'session not found');
    throw err;
  }
  if (updated.meta.changes === 0) {
    const stillThere = await c.env.DB.prepare('SELECT 1 FROM expenses WHERE id = ? AND deleted_at IS NULL')
      .bind(id)
      .first();
    if (!stillThere) throw new ApiError(404, 'EXPENSE_NOT_FOUND', 'expense not found');
    if (await involvesRemovedMember(c.env.DB, group.code, id)) {
      throw new ApiError(409, 'EXPENSE_HAS_REMOVED_MEMBER', 'this expense involves a removed member');
    }
    if (await isExpensePaidToward(c.env.DB, group.code, id)) {
      throw new ApiError(409, 'EXPENSE_PAID_TOWARD', 'someone has already paid toward this expense');
    }
    const active = await loadActiveMemberIds(c.env.DB, group.code);
    if (!active.has(parsed.payerId)) throw new ApiError(400, 'PAYER_NOT_IN_GROUP', 'payer is not in this group');
    throw new ApiError(400, 'PARTICIPANT_NOT_IN_GROUP', 'participant is not in this group');
  }
  await recordChange(c.env.DB, group.code, me, 'expense.edit', id, { previous, sharesChanged });
  return c.json({ id, sharesChanged, changed: true });
});

// Soft delete, so the audit log can still explain where money went.
expenseRoutes.delete('/:code/expenses/:id', async (c) => {
  const { group, me } = await loadGroup(c);
  const id = c.req.param('id');
  const expense = await c.env.DB.prepare(
    'SELECT created_by FROM expenses WHERE id = ? AND group_code = ? AND deleted_at IS NULL',
  )
    .bind(id, group.code)
    .first<{ created_by: string | null }>();
  if (!expense) throw new ApiError(404, 'EXPENSE_NOT_FOUND', 'expense not found');
  requireCanDeleteExpense(me, expense);
  // A removed member had a zero balance; deleting an expense they paid or owe a share of would give them one
  // that nobody could settle any more, so such an expense stays. The check is part of the UPDATE itself, so a
  // removal that commits in the meantime cannot slip between a check and the delete.
  const result = await c.env.DB.prepare(
    `UPDATE expenses SET deleted_at = ?3, deleted_by = ?4
     WHERE id = ?1 AND group_code = ?2 AND deleted_at IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM members m
         WHERE m.group_code = ?2 AND m.removed_at IS NOT NULL
           AND (m.id = expenses.payer_id
                OR m.id IN (SELECT member_id FROM expense_shares WHERE expense_id = ?1 AND amount <> 0))
       )
       AND NOT ${paidTowardSql(1, 2)}`,
  )
    .bind(id, group.code, now(), me.memberId ?? 'owner')
    .run();
  if (result.meta.changes === 0) {
    const stillThere = await c.env.DB.prepare('SELECT 1 FROM expenses WHERE id = ? AND deleted_at IS NULL')
      .bind(id)
      .first();
    if (!stillThere) throw new ApiError(404, 'EXPENSE_NOT_FOUND', 'expense not found');
    if (await involvesRemovedMember(c.env.DB, group.code, id)) {
      throw new ApiError(409, 'EXPENSE_HAS_REMOVED_MEMBER', 'this expense involves a removed member');
    }
    throw new ApiError(409, 'EXPENSE_PAID_TOWARD', 'someone has already paid toward this expense');
  }
  await deleteExpenseReceipt(c.env, id);
  await recordChange(c.env.DB, group.code, me, 'expense.delete', id);
  return c.json({ ok: true });
});

// delete_settled_expense: the author or the owner hides or shows a paid-toward expense. Hidden expenses leave the
// list only; balances, suggestions and the export still count them. A photo changes no money, so receipt routes
// are not involved.
expenseRoutes.post('/:code/expenses/:id/hide', async (c) => {
  const { group, me } = await loadGroup(c);
  const id = c.req.param('id');
  const body = await readJson(c);
  if (typeof body.hidden !== 'boolean') throw new ApiError(400, 'FIELD_REQUIRED', 'hidden is required');
  const hidden = body.hidden;
  const expense = await c.env.DB.prepare(
    'SELECT created_by, hidden_at FROM expenses WHERE id = ? AND group_code = ? AND deleted_at IS NULL',
  )
    .bind(id, group.code)
    .first<{ created_by: string | null; hidden_at: string | null }>();
  if (!expense) throw new ApiError(404, 'EXPENSE_NOT_FOUND', 'expense not found');
  requireCanHideExpense(me, expense);

  // The paid-toward check is part of the UPDATE, so a transfer committed after the read above is still seen.
  const result = hidden
    ? await c.env.DB.prepare(
        `UPDATE expenses SET hidden_at = ?3, hidden_by = ?4
         WHERE id = ?1 AND group_code = ?2 AND deleted_at IS NULL AND hidden_at IS NULL
           AND ${paidTowardSql(1, 2)}`,
      )
        .bind(id, group.code, now(), me.memberId ?? 'owner')
        .run()
    : await c.env.DB.prepare(
        `UPDATE expenses SET hidden_at = NULL, hidden_by = NULL
         WHERE id = ?1 AND group_code = ?2 AND deleted_at IS NULL AND hidden_at IS NOT NULL`,
      )
        .bind(id, group.code)
        .run();
  if (result.meta.changes === 0) {
    const current = await c.env.DB.prepare(
      'SELECT hidden_at FROM expenses WHERE id = ? AND group_code = ? AND deleted_at IS NULL',
    )
      .bind(id, group.code)
      .first<{ hidden_at: string | null }>();
    if (!current) throw new ApiError(404, 'EXPENSE_NOT_FOUND', 'expense not found');
    // Already in the requested state: nothing is recorded.
    if ((current.hidden_at !== null) === hidden) return c.json({ ok: true, changed: false });
    throw new ApiError(409, 'EXPENSE_NOT_PAID_TOWARD', 'only a paid-toward expense can be hidden');
  }
  await recordChange(c.env.DB, group.code, me, hidden ? 'expense.hide' : 'expense.unhide', id);
  return c.json({ ok: true, changed: true });
});
