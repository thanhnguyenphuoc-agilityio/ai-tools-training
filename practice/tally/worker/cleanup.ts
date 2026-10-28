// Daily maintenance: deletes inactive groups and expired sessions.
import { inactiveBefore } from '../shared/rules';
import { deleteExpiredSessions } from './auth';
import type { Env } from './app';

export async function purgeInactiveGroups(db: D1Database, now: Date): Promise<number> {
  const cutoff = inactiveBefore(now);
  // RETURNING gives one row per deleted group; `meta.changes` would also count the cascaded child rows.
  const result = await db
    .prepare('DELETE FROM groups WHERE last_activity_at < ? AND locked_at IS NULL RETURNING code')
    .bind(cutoff)
    .all();
  return result.results.length;
}

export async function runDailyJobs(env: Env, now: Date): Promise<{ groups: number; sessions: number }> {
  const groups = await purgeInactiveGroups(env.DB, now);
  const sessions = await deleteExpiredSessions(env.DB, now);
  console.log(`[daily-jobs] Purged ${groups} inactive group(s), deleted ${sessions} expired session(s)`);
  return { groups, sessions };
}
