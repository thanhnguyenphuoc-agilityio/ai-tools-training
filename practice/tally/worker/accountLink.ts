// Attaches an existing group or member to the signed-in account.
// Reused by lock_groups to link a group before locking it.
import type { Identity } from './auth';
import type { GroupRow } from './groupData';
import { ApiError, isUniqueViolation } from './http';
import { requireAccount, requireGroupNotOwnedByOther, requireMember, requireMemberLinkable } from './policy';

const alreadyMember = () =>
  new ApiError(409, 'ACCOUNT_ALREADY_MEMBER', 'your account is already a member of this group');

export async function linkToAccount(
  db: D1Database,
  group: GroupRow,
  me: Identity,
): Promise<{ changed: boolean; action: 'group.link' | 'member.link' | null; memberId: string | null }> {
  requireAccount(me);

  if (me.hasOwnerKey) {
    const ownerMember = await db
      .prepare('SELECT id, user_id FROM members WHERE group_code = ? AND is_owner = 1 AND removed_at IS NULL')
      .bind(group.code)
      .first<{ id: string; user_id: string | null }>();
    if (!ownerMember) throw new ApiError(404, 'MEMBER_NOT_FOUND', 'owner member not found');

    requireGroupNotOwnedByOther(me, group);
    requireMemberLinkable(me, ownerMember);

    if (group.owner_user_id === me.userId && ownerMember.user_id === me.userId) {
      return { changed: false, action: null, memberId: null };
    }

    try {
      // Both or nothing: each UPDATE also requires the other row to be free for this account. The batch is one
      // transaction, so a request that lost a race (the group or the member got linked after the SELECTs above)
      // changes neither row.
      await db.batch([
        db
          .prepare(
            `UPDATE groups SET owner_user_id = ?1 WHERE code = ?2 AND (owner_user_id IS NULL OR owner_user_id = ?1)
             AND EXISTS (SELECT 1 FROM members WHERE id = ?3 AND (user_id IS NULL OR user_id = ?1))`,
          )
          .bind(me.userId, group.code, ownerMember.id),
        db
          .prepare(
            `UPDATE members SET user_id = ?1 WHERE id = ?3 AND (user_id IS NULL OR user_id = ?1)
             AND EXISTS (SELECT 1 FROM groups WHERE code = ?2 AND owner_user_id = ?1)`,
          )
          .bind(me.userId, group.code, ownerMember.id),
      ]);

      // Read the outcome back to tell which refusal applies when nothing was written.
      const [groupNow, memberNow] = await Promise.all([
        db
          .prepare('SELECT owner_user_id FROM groups WHERE code = ?')
          .bind(group.code)
          .first<{ owner_user_id: string | null }>(),
        db.prepare('SELECT user_id FROM members WHERE id = ?').bind(ownerMember.id).first<{ user_id: string | null }>(),
      ]);
      if (groupNow?.owner_user_id !== me.userId && groupNow?.owner_user_id != null) {
        throw new ApiError(403, 'GROUP_OWNED_BY_OTHER_ACCOUNT', 'group belongs to another account');
      }
      if (memberNow?.user_id !== me.userId) {
        throw new ApiError(409, 'MEMBER_LINKED_ELSEWHERE', 'owner member linked to another account');
      }
      return { changed: true, action: 'group.link', memberId: ownerMember.id };
    } catch (err: unknown) {
      if (err instanceof ApiError) throw err;
      if (isUniqueViolation(err)) throw alreadyMember();
      throw err;
    }
  }

  if (me.deviceMemberId) {
    const deviceMember = await db
      .prepare('SELECT id, user_id FROM members WHERE id = ? AND group_code = ? AND removed_at IS NULL')
      .bind(me.deviceMemberId, group.code)
      .first<{ id: string; user_id: string | null }>();
    if (!deviceMember) throw new ApiError(404, 'MEMBER_NOT_FOUND', 'member not found');

    requireMemberLinkable(me, deviceMember);

    if (deviceMember.user_id === me.userId) {
      return { changed: false, action: null, memberId: null };
    }

    try {
      const res = await db
        .prepare(
          'UPDATE members SET user_id = ?, invite_email = NULL WHERE id = ? AND (user_id IS NULL OR user_id = ?)',
        )
        .bind(me.userId, deviceMember.id, me.userId)
        .run();

      if ((res.meta.changes ?? 0) === 0 && deviceMember.user_id !== me.userId) {
        throw new ApiError(409, 'MEMBER_LINKED_ELSEWHERE', 'member linked to another account');
      }

      return { changed: true, action: 'member.link', memberId: deviceMember.id };
    } catch (err: unknown) {
      if (err instanceof ApiError) throw err;
      if (isUniqueViolation(err)) throw alreadyMember();
      throw err;
    }
  }

  requireMember(me);
  return { changed: false, action: null, memberId: null };
}
