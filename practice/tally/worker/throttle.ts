// rate_limit_guessing: slows down a client that keeps failing group lookups or owner key attempts. Only failures
// are counted, so viewing an existing group and normal use never reach the limit.
import { ApiError, type Ctx } from './http';

/** The two kinds of failure, counted separately per client. */
export type GuessKind = 'lookup' | 'owner';

/**
 * Counts one failed attempt for the calling client. Over the limit (GUESS_LIMITER in wrangler.jsonc) it throws
 * 429 TOO_MANY_ATTEMPTS instead of the usual error. Without the binding nothing is counted.
 */
export async function throttleFailure(c: Ctx, kind: GuessKind): Promise<void> {
  const limiter = c.env.GUESS_LIMITER;
  if (!limiter) return;
  const client = c.req.header('cf-connecting-ip') ?? 'unknown';
  const { success } = await limiter.limit({ key: `${kind}:${client}` });
  if (!success) throw new ApiError(429, 'TOO_MANY_ATTEMPTS', 'too many failed attempts, try again later');
}
