import { Hono } from 'hono';
import type { MyGroupDto, MyGroupsResponse } from '../../shared/types';
import { resolveAccount } from '../auth';
import type { AppEnv } from '../http';
import { requireSignedIn } from '../policy';

export const myGroupRoutes = new Hono<AppEnv>();

myGroupRoutes.get('/me/groups', async (c) => {
  const userId = requireSignedIn(await resolveAccount(c));

  const rows = await c.env.DB.prepare(
    `SELECT g.code, g.name, g.currency, g.last_activity_at, (g.owner_user_id = ?1) AS is_owner
     FROM groups g
     WHERE g.owner_user_id = ?1
        OR EXISTS (SELECT 1 FROM members m WHERE m.group_code = g.code AND m.user_id = ?1 AND m.removed_at IS NULL)
     ORDER BY g.last_activity_at DESC, g.code`,
  )
    .bind(userId)
    .all<{ code: string; name: string; currency: string; last_activity_at: string; is_owner: number }>();

  const groups: MyGroupDto[] = rows.results.map((r) => ({
    code: r.code,
    name: r.name,
    currency: r.currency,
    isOwner: Boolean(r.is_owner),
    lastActivityAt: r.last_activity_at,
  }));

  return c.json({ groups } satisfies MyGroupsResponse);
});
