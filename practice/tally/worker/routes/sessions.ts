// Creating, updating and deleting group sessions and their attendance (attendance_split). The owner only.
import { Hono } from 'hono';
import { isValidSessionTimes } from '../../shared/sessions';
import { loadActiveMemberIds, loadGroup, noneRemovedSql, recordChange } from '../groupData';
import { ApiError, isoDate, now, optionalText, readJson, type AppEnv } from '../http';
import { requireCanManageSessions } from '../policy';

export const sessionRoutes = new Hono<AppEnv>();

/** A time from the body: anything that is not a string fails the HH:mm check (INVALID_SESSION_TIME). */
const timeValue = (value: unknown, fallback: string): string => (value === undefined ? fallback : String(value ?? ''));

/**
 * The present members from the body: strings only, duplicates counted once. An active member, or a removed member
 * who was already present (`keptIds`), is accepted; any other id is PARTICIPANT_NOT_IN_GROUP.
 */
function presentIdsFrom(raw: unknown, activeIds: Set<string>, keptIds: string[]): string[] {
  if (!Array.isArray(raw)) throw new ApiError(400, 'FIELD_REQUIRED', 'presentIds must be an array');
  const ids = Array.from(new Set<unknown>(raw));
  for (const pid of ids) {
    if (typeof pid !== 'string' || !(activeIds.has(pid) || keptIds.includes(pid))) {
      throw new ApiError(400, 'PARTICIPANT_NOT_IN_GROUP', 'participant not in group');
    }
  }
  return ids as string[];
}

const sameSet = (a: string[], b: string[]): boolean => a.length === b.length && a.every((id) => b.includes(id));

sessionRoutes.post('/:code/sessions', async (c) => {
  const { group, me } = await loadGroup(c);
  requireCanManageSessions(me);
  const body = await readJson(c);

  const day = isoDate(body.day);
  const startsAt = timeValue(body.startsAt, '');
  const endsAt = timeValue(body.endsAt, '');
  if (!isValidSessionTimes(startsAt, endsAt)) {
    throw new ApiError(400, 'INVALID_SESSION_TIME', 'invalid session times');
  }
  const note = optionalText(body.note, 'note', 80) ?? '';

  const activeIds = await loadActiveMemberIds(c.env.DB, group.code);
  const presentIds = presentIdsFrom(body.presentIds, activeIds, []);

  const id = crypto.randomUUID();
  // The removed-member check is repeated in the INSERT: a member removed after the read above writes nothing.
  const statements: D1PreparedStatement[] = [
    c.env.DB.prepare(
      `INSERT INTO group_sessions (id, group_code, day, starts_at, ends_at, note, created_at)
       SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7 WHERE ${noneRemovedSql(8)}`,
    ).bind(id, group.code, day, startsAt, endsAt, note, now(), JSON.stringify(presentIds)),
    ...presentIds.map((mId) =>
      c.env.DB.prepare(
        'INSERT INTO attendance (session_id, member_id) SELECT ?1, ?2 WHERE EXISTS (SELECT 1 FROM group_sessions WHERE id = ?1)',
      ).bind(id, mId),
    ),
  ];
  const [inserted] = await c.env.DB.batch(statements);
  if (inserted.meta.changes === 0) {
    throw new ApiError(400, 'PARTICIPANT_NOT_IN_GROUP', 'participant not in group');
  }
  await recordChange(c.env.DB, group.code, me, 'session.add', id);
  return c.json({ id }, 201);
});

sessionRoutes.patch('/:code/sessions/:id', async (c) => {
  const { group, me } = await loadGroup(c);
  requireCanManageSessions(me);
  const id = c.req.param('id');

  const session = await c.env.DB.prepare(
    'SELECT id, day, starts_at, ends_at, note FROM group_sessions WHERE id = ? AND group_code = ?',
  )
    .bind(id, group.code)
    .first<{ id: string; day: string; starts_at: string; ends_at: string; note: string }>();
  if (!session) throw new ApiError(404, 'SESSION_NOT_FOUND', 'session not found');

  const { results: storedRows } = await c.env.DB.prepare('SELECT member_id FROM attendance WHERE session_id = ?')
    .bind(id)
    .all<{ member_id: string }>();
  const storedIds = storedRows.map((r) => r.member_id);

  const body = await readJson(c);
  const day = body.day !== undefined ? isoDate(body.day) : session.day;
  const startsAt = timeValue(body.startsAt, session.starts_at);
  const endsAt = timeValue(body.endsAt, session.ends_at);
  if (!isValidSessionTimes(startsAt, endsAt)) {
    throw new ApiError(400, 'INVALID_SESSION_TIME', 'invalid session times');
  }
  const note = body.note !== undefined ? (optionalText(body.note, 'note', 80) ?? '') : session.note;

  // Removed members who are present stay present: the form lists only active members, so an edit must not drop them.
  const activeIds = await loadActiveMemberIds(c.env.DB, group.code);
  const keptIds = storedIds.filter((mId) => !activeIds.has(mId));
  const nextIds =
    body.presentIds === undefined
      ? storedIds
      : Array.from(new Set([...presentIdsFrom(body.presentIds, activeIds, keptIds), ...keptIds]));

  const sameFields =
    day === session.day && startsAt === session.starts_at && endsAt === session.ends_at && note === session.note;
  const sameAttendance = sameSet(nextIds, storedIds);
  // A repeat of the stored values is not an edit: nothing is written and nothing is recorded.
  if (sameFields && sameAttendance) return c.json({ ok: true, changed: false });

  // Removed-member check, repeated in every write of the batch: a member removed after the read above is refused.
  const newlyAdded = nextIds.filter((mId) => !storedIds.includes(mId));
  const gate = JSON.stringify(newlyAdded);
  const statements: D1PreparedStatement[] = [
    c.env.DB.prepare(
      `UPDATE group_sessions SET day = ?1, starts_at = ?2, ends_at = ?3, note = ?4
       WHERE id = ?5 AND group_code = ?6 AND ${noneRemovedSql(7)}`,
    ).bind(day, startsAt, endsAt, note, id, group.code, gate),
  ];
  if (!sameAttendance) {
    statements.push(
      c.env.DB.prepare(`DELETE FROM attendance WHERE session_id = ?1 AND ${noneRemovedSql(2)}`).bind(id, gate),
    );
    for (const mId of nextIds) {
      statements.push(
        c.env.DB.prepare(
          // OR IGNORE: when the gate refuses the DELETE, the members still stored must not hit a primary key error.
          `INSERT OR IGNORE INTO attendance (session_id, member_id)
           SELECT ?1, ?2 WHERE EXISTS (SELECT 1 FROM group_sessions WHERE id = ?1) AND ${noneRemovedSql(3)}`,
        ).bind(id, mId, gate),
      );
    }
  }

  const [updated] = await c.env.DB.batch(statements);
  if (updated.meta.changes === 0) {
    const stillThere = await c.env.DB.prepare('SELECT 1 FROM group_sessions WHERE id = ? AND group_code = ?')
      .bind(id, group.code)
      .first();
    if (!stillThere) throw new ApiError(404, 'SESSION_NOT_FOUND', 'session not found');
    throw new ApiError(400, 'PARTICIPANT_NOT_IN_GROUP', 'participant not in group');
  }
  await recordChange(c.env.DB, group.code, me, 'session.update', id, {
    previous: {
      day: session.day,
      startsAt: session.starts_at,
      endsAt: session.ends_at,
      note: session.note,
      presentIds: storedIds,
    },
  });
  return c.json({ ok: true, changed: true });
});

sessionRoutes.delete('/:code/sessions/:id', async (c) => {
  const { group, me } = await loadGroup(c);
  requireCanManageSessions(me);
  const id = c.req.param('id');

  // One statement: the session is removed only while no live cost refers to it, so a cost added in between is kept.
  const result = await c.env.DB.prepare(
    `DELETE FROM group_sessions
     WHERE id = ?1 AND group_code = ?2
       AND NOT EXISTS (
         SELECT 1 FROM expenses WHERE expenses.session_id = group_sessions.id AND expenses.deleted_at IS NULL
       )`,
  )
    .bind(id, group.code)
    .run();
  if (result.meta.changes === 0) {
    const stillThere = await c.env.DB.prepare('SELECT 1 FROM group_sessions WHERE id = ? AND group_code = ?')
      .bind(id, group.code)
      .first();
    if (!stillThere) throw new ApiError(404, 'SESSION_NOT_FOUND', 'session not found');
    throw new ApiError(409, 'SESSION_HAS_EXPENSES', 'cannot delete a session that has expenses');
  }
  await recordChange(c.env.DB, group.code, me, 'session.delete', id);
  return c.json({ ok: true });
});
