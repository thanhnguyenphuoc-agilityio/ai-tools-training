// Adding and deleting expenses. Shares are computed once, at write time.
import { Hono } from 'hono';
import { splitAmount } from '../../shared/money';
import type { NewExpense } from '../../shared/types';
import { audit, loadGroup, loadMembers } from '../groupData';
import { amount, ApiError, isoDate, now, readJson, text, weight, type AppEnv } from '../http';
import { requireCanDeleteExpense, requireMember } from '../policy';

export const expenseRoutes = new Hono<AppEnv>();

expenseRoutes.post('/:code/expenses', async (c) => {
  const { group, me } = await loadGroup(c);
  const author = requireMember(me);
  const body = (await readJson(c)) as Partial<Record<keyof NewExpense, unknown>>;
  const memberIds = new Set((await loadMembers(c.env.DB, group.code)).map((m) => m.id));

  const payerId = text(body.payerId, 'payerId', 64);
  if (!memberIds.has(payerId)) throw new ApiError(400, 'PAYER_NOT_IN_GROUP', 'payer is not in this group');
  const total = amount(body.amount);
  const description = text(body.description, 'description', 120);
  const spentOn = isoDate(body.spentOn);
  const splitMode = body.splitMode === 'weight' ? 'weight' : 'equal';

  if (!Array.isArray(body.participants) || body.participants.length === 0) {
    throw new ApiError(400, 'NO_PARTICIPANTS', 'pick at least one participant');
  }
  const seen = new Set<string>();
  const participants = body.participants.map((p: { memberId?: unknown; weight?: unknown }) => {
    const memberId = text(p?.memberId, 'participant', 64);
    if (!memberIds.has(memberId)) throw new ApiError(400, 'PARTICIPANT_NOT_IN_GROUP', 'participant is not in this group');
    if (seen.has(memberId)) throw new ApiError(400, 'DUPLICATE_PARTICIPANT', 'duplicate participant');
    seen.add(memberId);
    return { memberId, weight: splitMode === 'equal' ? 1 : weight(p?.weight) };
  });

  const shares = splitAmount(total, participants, { roundTo: group.round_to, payerId });
  const id = crypto.randomUUID();
  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO expenses (id, group_code, payer_id, amount, description, spent_on, split_mode, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(id, group.code, payerId, total, description, spentOn, splitMode, author, now()),
    ...participants.map((p) =>
      c.env.DB.prepare('INSERT INTO expense_shares (expense_id, member_id, weight, amount) VALUES (?, ?, ?, ?)').bind(
        id,
        p.memberId,
        p.weight,
        shares.get(p.memberId)!,
      ),
    ),
  ]);
  await audit(c.env.DB, group.code, me, 'expense.add', id);
  return c.json({ id }, 201);
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

  await c.env.DB.prepare('UPDATE expenses SET deleted_at = ?, deleted_by = ? WHERE id = ?')
    .bind(now(), me.memberId ?? 'owner', id)
    .run();
  await audit(c.env.DB, group.code, me, 'expense.delete', id);
  return c.json({ ok: true });
});
