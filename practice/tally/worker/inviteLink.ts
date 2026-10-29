// Links an invited member (an unclaimed member whose invite email matches the account email) to the signed-in account.
// Called from GET /groups/:code, the only GET that writes, and only when a link happens.
import type { Identity } from './auth';
import type { GroupRow } from './groupData';
import { isUniqueViolation } from './http';

/**
 * One guarded UPDATE: the oldest active, unclaimed member whose invite email equals `email` (ignoring case) gets the
 * account as user and loses its invite email. The account must have no active member in the group. Returns the linked
 * member id, or null when nothing matched or the account already has a member (a unique violation counts as null too).
 */
export async function linkInvitedMember(
  db: D1Database,
  group: GroupRow,
  me: Identity,
  email: string,
): Promise<string | null> {
  if (me.userId === null) return null;
  try {
    const row = await db
      .prepare(
        `UPDATE members SET user_id = ?1, invite_email = NULL
         WHERE id = (
           SELECT id FROM members
           WHERE group_code = ?2 AND removed_at IS NULL AND token_hash IS NULL AND user_id IS NULL
             AND invite_email IS NOT NULL AND lower(invite_email) = lower(?3)
           ORDER BY created_at, id
           LIMIT 1
         )
         AND user_id IS NULL
         AND NOT EXISTS (SELECT 1 FROM members WHERE group_code = ?2 AND user_id = ?1 AND removed_at IS NULL)
         RETURNING id`,
      )
      .bind(me.userId, group.code, email)
      .first<{ id: string }>();
    return row?.id ?? null;
  } catch (err) {
    if (isUniqueViolation(err)) return null;
    throw err;
  }
}
