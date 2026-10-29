// The live connection of an open group page: GET /groups/:code/live upgrades to a WebSocket held by the group's
// Durable Object. Anyone with the link may connect, the same as GET /groups/:code. Writes nothing to D1 and does not
// move last_activity_at; it is a GET, so the live middleware in app.ts never signals it.
import { Hono } from 'hono';
import { loadGroup } from '../groupData';
import { ApiError, type AppEnv } from '../http';

export const liveRoutes = new Hono<AppEnv>();

liveRoutes.get('/:code/live', async (c) => {
  const { group } = await loadGroup(c);
  const binding = c.env.GROUP_LIVE;
  if (c.req.header('Upgrade')?.toLowerCase() !== 'websocket' || !binding) {
    throw new ApiError(404, 'NOT_FOUND', 'not found');
  }
  const stub = binding.get(binding.idFromName(group.code));
  return stub.fetch(new Request('https://live/connect', { headers: { Upgrade: 'websocket' } }));
});
