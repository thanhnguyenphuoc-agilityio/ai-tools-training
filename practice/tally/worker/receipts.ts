// Receipt photo objects in R2. The rows stay in D1 (expense_attachments); these helpers only remove the bytes.
import type { Env } from './http';

/** Deletes one object. A failure is logged and ignored: the row is already gone, and the bytes are only storage. */
export async function deleteReceiptObject(bucket: R2Bucket, key: string): Promise<void> {
  try {
    await bucket.delete(key);
  } catch (err) {
    console.error('Failed to delete receipt object', key, err);
  }
}

/** Deletes all objects in the bucket that start with `prefix`, in batches of up to 1000. */
export async function deleteReceiptObjects(bucket: R2Bucket, prefix: string): Promise<void> {
  let cursor: string | undefined = undefined;
  do {
    const list = await bucket.list({ prefix, cursor, limit: 1000 });
    if (list.objects.length > 0) {
      await bucket.delete(list.objects.map((o) => o.key));
    }
    cursor = list.truncated ? list.cursor : undefined;
  } while (cursor);
}

/**
 * Removes the photo of a deleted expense: its row, then its object. Called after the expense is soft-deleted, so a
 * failure here must not fail the delete; it is logged instead.
 */
export async function deleteExpenseReceipt(env: Env, expenseId: string): Promise<void> {
  try {
    const row = await env.DB.prepare('SELECT r2_key FROM expense_attachments WHERE expense_id = ?')
      .bind(expenseId)
      .first<{ r2_key: string }>();
    if (!row) return;
    await env.DB.prepare('DELETE FROM expense_attachments WHERE expense_id = ?').bind(expenseId).run();
    await deleteReceiptObject(env.RECEIPTS, row.r2_key);
  } catch (err) {
    console.error('Failed to delete receipt of expense', expenseId, err);
  }
}
