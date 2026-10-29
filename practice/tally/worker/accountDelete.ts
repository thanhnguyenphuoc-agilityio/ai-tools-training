// Account deletion: deletes the user row and sessions, detaches owned groups and members,
// and unlocks kept groups with an audit entry. Runs in one atomic batch.

/** Owned groups that still have another active member (not the owner). Deletion is refused while this is above 0. */
export async function countSharedOwnedGroups(db: D1Database, userId: string): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS total FROM groups g
       WHERE g.owner_user_id = ?1
       AND EXISTS (
         SELECT 1 FROM members m
         WHERE m.group_code = g.code AND m.is_owner = 0 AND m.removed_at IS NULL
       )`,
    )
    .bind(userId)
    .first<{ total: number }>();
  return row?.total ?? 0;
}

export async function deleteAccount(db: D1Database, userId: string, now: string): Promise<void> {
  await db.batch([
    db
      .prepare(
        `INSERT INTO audit_log (group_code, actor, action, target, details, at)
         SELECT code, 'owner', 'group.unlock', NULL, '{"reason":"account.delete"}', ?2
         FROM groups WHERE owner_user_id = ?1 AND locked_at IS NOT NULL`,
      )
      .bind(userId, now),
    db
      .prepare(
        `UPDATE groups SET locked_at = NULL, last_activity_at = ?2
         WHERE owner_user_id = ?1 AND locked_at IS NOT NULL`,
      )
      .bind(userId, now),
    db.prepare('UPDATE groups SET owner_user_id = NULL WHERE owner_user_id = ?1').bind(userId),
    db.prepare('UPDATE members SET user_id = NULL WHERE user_id = ?1').bind(userId),
    db.prepare('DELETE FROM sessions WHERE user_id = ?1').bind(userId),
    db.prepare('DELETE FROM users WHERE id = ?1').bind(userId),
  ]);
}
