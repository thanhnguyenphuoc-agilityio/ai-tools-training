// Account deletion: deletes the user row and sessions, detaches owned groups and members,
// and unlocks kept groups with an audit entry. Runs in one atomic batch.

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
