// Daily maintenance: deletes inactive groups and expired sessions.
import { inactiveBefore } from '../shared/rules';
import { deleteExpiredSessions } from './auth';
import { deleteReceiptObjects } from './receipts';
import type { Env } from './app';

/**
 * Deletes inactive groups. D1 cascades their rows; R2 is not reached by a cascade, so the receipt photos of each
 * purged group (every key under `<code>/`) are deleted here. A failure there is logged and does not fail the job.
 */
export async function purgeInactiveGroups(db: D1Database, now: Date, receipts?: R2Bucket): Promise<number> {
  const cutoff = inactiveBefore(now);
  // RETURNING gives one row per deleted group; `meta.changes` would also count the cascaded child rows.
  const result = await db
    .prepare('DELETE FROM groups WHERE last_activity_at < ? AND locked_at IS NULL RETURNING code')
    .bind(cutoff)
    .all<{ code: string }>();
  if (receipts) {
    for (const { code } of result.results) {
      try {
        await deleteReceiptObjects(receipts, `${code}/`);
      } catch (err) {
        console.error(`Failed to delete receipt photos of purged group ${code}`, err);
      }
    }
  }
  return result.results.length;
}

export async function runDailyJobs(env: Env, now: Date): Promise<{ groups: number; sessions: number }> {
  const groups = await purgeInactiveGroups(env.DB, now, env.RECEIPTS);
  const sessions = await deleteExpiredSessions(env.DB, now);
  console.log(`[daily-jobs] Purged ${groups} inactive group(s), deleted ${sessions} expired session(s)`);
  return { groups, sessions };
}
