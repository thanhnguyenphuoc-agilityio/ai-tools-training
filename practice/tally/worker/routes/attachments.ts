// Receipt photos (receipt_photos): one optional image per expense. The bytes live in R2 and are served only through
// this Worker, so the group rules (edit rights, removed members, deleted expenses) apply to every read and write.
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { ErrorBody } from '../../shared/errors';
import { isReceiptType, MAX_RECEIPT_BYTES, receiptKey, sniffImageType } from '../../shared/receipts';
import type { Identity } from '../auth';
import { involvesRemovedMember, loadGroup, recordChange } from '../groupData';
import { ApiError, now, type AppEnv, type Ctx } from '../http';
import { requireCanEditExpense } from '../policy';
import { deleteReceiptObject } from '../receipts';

export const attachmentRoutes = new Hono<AppEnv>();

// Writes the row only while the expense is live and in this group. Zero changed rows means the expense went away.
const RECEIPT_UPLOAD_SQL = `INSERT INTO expense_attachments (id, group_code, expense_id, r2_key, content_type, size, created_by, created_at)
  SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8
  WHERE EXISTS (SELECT 1 FROM expenses WHERE id = ?3 AND group_code = ?2 AND deleted_at IS NULL)
  ON CONFLICT(expense_id) DO UPDATE SET
    id = excluded.id, r2_key = excluded.r2_key, content_type = excluded.content_type,
    size = excluded.size, created_by = excluded.created_by, created_at = excluded.created_at`;

/** The live expense a photo belongs to, if the caller may change it. Shared by upload and removal. */
async function requireEditableExpense(c: Ctx, code: string, me: Identity, id: string): Promise<void> {
  const expense = await c.env.DB.prepare(
    'SELECT created_by FROM expenses WHERE id = ? AND group_code = ? AND deleted_at IS NULL',
  )
    .bind(id, code)
    .first<{ created_by: string | null }>();
  if (!expense) throw new ApiError(404, 'EXPENSE_NOT_FOUND', 'expense not found');
  requireCanEditExpense(me, expense);
  if (await involvesRemovedMember(c.env.DB, code, id)) {
    throw new ApiError(409, 'EXPENSE_HAS_REMOVED_MEMBER', 'this expense involves a removed member');
  }
}

attachmentRoutes.post(
  '/:code/expenses/:id/attachments',
  bodyLimit({
    maxSize: MAX_RECEIPT_BYTES,
    onError: (c) => c.json({ error: 'receipt photo too large', code: 'RECEIPT_TOO_LARGE' } satisfies ErrorBody, 413),
  }),
  async (c) => {
    const { group, me } = await loadGroup(c);
    const id = c.req.param('id');
    await requireEditableExpense(c, group.code, me, id);

    const headerType = c.req.header('content-type')?.split(';')[0].trim().toLowerCase() ?? '';
    const bytes = await c.req.arrayBuffer();
    if (bytes.byteLength > MAX_RECEIPT_BYTES) {
      throw new ApiError(413, 'RECEIPT_TOO_LARGE', 'receipt photo too large');
    }
    // The header alone is not trusted: the bytes must start like the type the header names (an empty body matches none).
    if (!isReceiptType(headerType) || sniffImageType(new Uint8Array(bytes)) !== headerType) {
      throw new ApiError(415, 'RECEIPT_TYPE_NOT_ALLOWED', 'only JPEG, PNG and WebP images are allowed');
    }

    // The object is read before the write, so a replaced photo can be removed after the row points at the new one.
    const previous = await c.env.DB.prepare('SELECT r2_key FROM expense_attachments WHERE expense_id = ?')
      .bind(id)
      .first<{ r2_key: string }>();

    // Object first, then the row. A row never points at a missing object. If the expense was deleted meanwhile,
    // the upsert writes nothing and the new object is removed again.
    const aid = crypto.randomUUID();
    const key = receiptKey(group.code, id, aid);
    await c.env.RECEIPTS.put(key, bytes, { httpMetadata: { contentType: headerType } });

    let written = 0;
    try {
      const result = await c.env.DB.prepare(RECEIPT_UPLOAD_SQL)
        .bind(aid, group.code, id, key, headerType, bytes.byteLength, me.memberId ?? 'owner', now())
        .run();
      written = result.meta.changes;
    } catch (err) {
      console.error('Failed to write receipt row', key, err);
    }
    if (written === 0) {
      await deleteReceiptObject(c.env.RECEIPTS, key);
      throw new ApiError(404, 'EXPENSE_NOT_FOUND', 'expense not found');
    }
    if (previous && previous.r2_key !== key) await deleteReceiptObject(c.env.RECEIPTS, previous.r2_key);

    await recordChange(c.env.DB, group.code, me, 'expense.receipt.add', id);
    return c.json({ id: aid, contentType: headerType, size: bytes.byteLength }, 201);
  },
);

attachmentRoutes.delete('/:code/expenses/:id/attachments/:aid', async (c) => {
  const { group, me } = await loadGroup(c);
  const id = c.req.param('id');
  const aid = c.req.param('aid');
  await requireEditableExpense(c, group.code, me, id);

  const att = await c.env.DB.prepare(
    'SELECT r2_key FROM expense_attachments WHERE id = ? AND expense_id = ? AND group_code = ?',
  )
    .bind(aid, id, group.code)
    .first<{ r2_key: string }>();
  if (!att) throw new ApiError(404, 'ATTACHMENT_NOT_FOUND', 'attachment not found');

  // Repeated inside the statement: an expense deleted since the check above must not lose its photo row while the
  // change is still recorded, which would move the group's deletion date for an expense that is gone.
  const removed = await c.env.DB.prepare(
    `DELETE FROM expense_attachments WHERE id = ?1
     AND EXISTS (SELECT 1 FROM expenses WHERE id = ?2 AND group_code = ?3 AND deleted_at IS NULL)`,
  )
    .bind(aid, id, group.code)
    .run();
  if (removed.meta.changes === 0) throw new ApiError(404, 'EXPENSE_NOT_FOUND', 'expense not found');
  await deleteReceiptObject(c.env.RECEIPTS, att.r2_key);

  await recordChange(c.env.DB, group.code, me, 'expense.receipt.remove', id);
  return c.json({ ok: true });
});

// Anyone with the group link may view the photo, like the rest of the group. Writes nothing.
attachmentRoutes.get('/:code/expenses/:id/attachments/:aid', async (c) => {
  const { group } = await loadGroup(c);
  const id = c.req.param('id');
  const aid = c.req.param('aid');

  const row = await c.env.DB.prepare(
    `SELECT a.r2_key, a.content_type
     FROM expense_attachments a
     JOIN expenses e ON e.id = a.expense_id
     WHERE a.id = ? AND a.expense_id = ? AND a.group_code = ? AND e.group_code = ? AND e.deleted_at IS NULL`,
  )
    .bind(aid, id, group.code, group.code)
    .first<{ r2_key: string; content_type: string }>();
  if (!row) throw new ApiError(404, 'ATTACHMENT_NOT_FOUND', 'attachment not found');

  const object = await c.env.RECEIPTS.get(row.r2_key);
  if (!object) throw new ApiError(404, 'ATTACHMENT_NOT_FOUND', 'attachment not found');

  return new Response(object.body, {
    status: 200,
    headers: {
      'Content-Type': row.content_type,
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': 'inline',
      'Cache-Control': 'private, max-age=3600',
    },
  });
});
