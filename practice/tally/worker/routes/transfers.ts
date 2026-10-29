// Settling up: the payer says "I sent it", the receiver confirms it arrived.
// Only confirmed transfers change balances (shared/settle.ts).
import { Hono } from 'hono';
import { loadActiveMemberIds, loadGroup, noneRemovedSql, recordChange } from '../groupData';
import { amount, ApiError, now, readJson, text, type AppEnv } from '../http';
import { requireCanConfirmTransfer, requireCanRecordTransfer, requireMember } from '../policy';

export const transferRoutes = new Hono<AppEnv>();

transferRoutes.post('/:code/transfers', async (c) => {
  const { group, me } = await loadGroup(c);
  const caller = requireMember(me);
  const body = await readJson(c);
  const fromId = body.fromId === undefined ? caller : text(body.fromId, 'fromId', 64);
  const toId = text(body.toId, 'toId', 64);
  requireCanRecordTransfer(me, fromId);

  const memberIds = await loadActiveMemberIds(c.env.DB, group.code);
  if (!memberIds.has(fromId) || !memberIds.has(toId))
    throw new ApiError(400, 'PARTICIPANT_NOT_IN_GROUP', 'member is not in this group');
  if (fromId === toId) throw new ApiError(400, 'SELF_TRANSFER', 'cannot transfer to yourself');

  const id = crypto.randomUUID();
  // One statement, so two concurrent requests cannot both insert. The member check is repeated, so a member removed
  // since loadActiveMemberIds gets no transfer, and a pair that already has a sent transfer gets none either.
  const result = await c.env.DB.prepare(
    `INSERT INTO transfers (id, group_code, from_id, to_id, amount, status, created_at)
     SELECT ?1, ?2, ?3, ?4, ?5, 'sent', ?6
     WHERE ${noneRemovedSql(7)}
       AND NOT EXISTS (SELECT 1 FROM transfers WHERE group_code = ?2 AND from_id = ?3 AND to_id = ?4 AND status = 'sent')`,
  )
    .bind(id, group.code, fromId, toId, amount(body.amount), now(), JSON.stringify([fromId, toId]))
    .run();
  if (result.meta.changes === 0) {
    // A removed member cannot have a waiting transfer (removal needs no waiting transfers), so a pending row is the
    // only other reason the insert wrote nothing.
    const pending = await c.env.DB.prepare(
      "SELECT 1 FROM transfers WHERE group_code = ? AND from_id = ? AND to_id = ? AND status = 'sent' LIMIT 1",
    )
      .bind(group.code, fromId, toId)
      .first();
    if (pending) {
      throw new ApiError(409, 'TRANSFER_PENDING', 'a transfer between these members is waiting for confirmation');
    }
    throw new ApiError(400, 'PARTICIPANT_NOT_IN_GROUP', 'member is not in this group');
  }
  await recordChange(c.env.DB, group.code, me, 'transfer.add', id);
  return c.json({ id }, 201);
});

transferRoutes.post('/:code/transfers/:id/confirm', async (c) => {
  const { group, me } = await loadGroup(c);
  const id = c.req.param('id');
  const transfer = await c.env.DB.prepare('SELECT to_id, status FROM transfers WHERE id = ? AND group_code = ?')
    .bind(id, group.code)
    .first<{ to_id: string; status: string }>();
  if (!transfer) throw new ApiError(404, 'TRANSFER_NOT_FOUND', 'transfer not found');
  requireCanConfirmTransfer(me, transfer);
  if (transfer.status === 'confirmed') throw new ApiError(409, 'ALREADY_CONFIRMED', 'already confirmed');

  const updated = await c.env.DB.prepare(
    `UPDATE transfers SET status = 'confirmed', confirmed_at = ?1 WHERE id = ?2 AND group_code = ?3 AND status = 'sent'`,
  )
    .bind(now(), id, group.code)
    .run();
  if (updated.meta.changes === 0) throw new ApiError(409, 'ALREADY_CONFIRMED', 'already confirmed');
  await recordChange(c.env.DB, group.code, me, 'transfer.confirm', id);
  return c.json({ ok: true });
});
