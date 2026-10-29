// Live updates: tells the open group pages that a group changed. The signal carries no data and is not activity.
// Signals are sent after the handler returned, so the D1 write has committed. A failed signal is logged and never
// fails the request. Without the GROUP_LIVE binding (tests, or a deploy without the Durable Object) nothing happens.
import type { Context } from 'hono';
import type { Env } from './http';
import type { AppEnv } from './http';

export async function signalGroup(env: Env, code: string): Promise<void> {
  if (!env.GROUP_LIVE) return;
  try {
    const stub = env.GROUP_LIVE.get(env.GROUP_LIVE.idFromName(code));
    await stub.fetch('https://live/notify', { method: 'POST' });
  } catch (err) {
    console.error('live signal failed', err);
  }
}

export async function signalGroups(env: Env, codes: string[]): Promise<void> {
  await Promise.all([...new Set(codes)].map((code) => signalGroup(env, code)));
}

/**
 * Runs a signal after the response is built. In a Worker the work goes through waitUntil, so the response is not
 * held back. In app.request tests there is no execution context, so the signal is awaited directly, which keeps
 * the tests deterministic.
 */
export function afterResponse(c: Context<AppEnv>, work: Promise<unknown>): Promise<void> {
  let ctx: { waitUntil(promise: Promise<unknown>): void } | null = null;
  try {
    ctx = c.executionCtx;
  } catch {
    ctx = null;
  }
  if (ctx) {
    ctx.waitUntil(work);
    return Promise.resolve();
  }
  return work.then(() => undefined);
}

/** Group codes an account change affects: groups it owns, and groups where one of its members is linked to it. */
export async function groupCodesForAccount(db: D1Database, userId: string): Promise<string[]> {
  const { results } = await db
    .prepare(
      `SELECT code FROM groups WHERE owner_user_id = ?1
       UNION
       SELECT DISTINCT group_code FROM members WHERE user_id = ?1`,
    )
    .bind(userId)
    .all<{ code: string }>();
  return results.map((r) => r.code);
}
