/**
 * Inactive groups policy and calculations.
 * Groups are deleted when inactive for INACTIVE_DAYS.
 */

export const INACTIVE_DAYS = 10;
export const INACTIVE_MS = INACTIVE_DAYS * 24 * 60 * 60 * 1000;
export const EXPIRY_WARNING_HOURS = 72;

/**
 * Returns ISO timestamp when the group expires (lastActivityAt + exactly 10 days).
 */
export function expiresAt(lastActivityAt: string): string {
  return new Date(Date.parse(lastActivityAt) + INACTIVE_MS).toISOString();
}

/**
 * ISO cutoff for purge query. Groups with `last_activity_at < cutoff` (strictly less) are deleted.
 * Exactly 10 days is kept.
 */
export function inactiveBefore(now: Date): string {
  return new Date(now.getTime() - INACTIVE_MS).toISOString();
}

/**
 * Returns true when `now >= expiresAt - 72h`.
 */
export function isExpiringSoon(expiresAt: string, now: Date): boolean {
  return now.getTime() >= Date.parse(expiresAt) - EXPIRY_WARNING_HOURS * 60 * 60 * 1000;
}
