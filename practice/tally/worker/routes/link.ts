// Route to link an existing group or member to the signed-in account.
import { Hono } from 'hono';
import { linkToAccount } from '../accountLink';
import { loadGroup, recordChange } from '../groupData';
import type { AppEnv } from '../http';

export const linkRoutes = new Hono<AppEnv>();

linkRoutes.post('/:code/link', async (c) => {
  const { group, me } = await loadGroup(c);
  const { changed, action, memberId } = await linkToAccount(c.env.DB, group, me);
  // Linking is a change of the group (it moves last_activity_at); the target is the member that was linked.
  if (changed && action) {
    await recordChange(c.env.DB, group.code, me, action, memberId);
  }
  return c.json({ ok: true, changed });
});
