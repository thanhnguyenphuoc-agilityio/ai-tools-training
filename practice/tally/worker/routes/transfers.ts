// Settling up: the payer says "I sent it", the receiver confirms it arrived.
// Only confirmed transfers change balances (shared/settle.ts).
import { Hono } from 'hono';
import { audit, loadActiveMemberIds, loadGroup, noneRemovedSql } from '../groupData';
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
  // The member check is repeated in the INSERT, so a member removed since loadActiveMemberIds gets no transfer.
  const result = await c.env.DB.prepare(
    `INSERT INTO transfers (id, group_code, from_id, to_id, amount, status, created_at)
     SELECT ?1, ?2, ?3, ?4, ?5, 'sent', ?6 WHERE ${noneRemovedSql(7)}`,
  )
    .bind(id, group.code, fromId, toId, amount(body.amount), now(), JSON.stringify([fromId, toId]))
    .run();
  if (result.meta.changes === 0) throw new ApiError(400, 'PARTICIPANT_NOT_IN_GROUP', 'member is not in this group');
  await audit(c.env.DB, group.code, me, 'transfer.add', id);
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

  await c.env.DB.prepare(`UPDATE transfers SET status = 'confirmed', confirmed_at = ? WHERE id = ?`)
    .bind(now(), id)
    .run();
  await audit(c.env.DB, group.code, me, 'transfer.confirm', id);
  return c.json({ ok: true });
});
