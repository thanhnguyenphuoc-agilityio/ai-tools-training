// Wires the route files together. New features add a route file and mount it here.
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { ErrorBody } from '../shared/errors';
import { ApiError, type AppEnv } from './http';
import { accountRoutes } from './routes/account';
import { attachmentRoutes } from './routes/attachments';
import { myGroupRoutes } from './routes/myGroups';
import { expenseRoutes } from './routes/expenses';
import { groupRoutes } from './routes/groups';
import { linkRoutes } from './routes/link';
import { memberRoutes } from './routes/members';
import { sessionRoutes } from './routes/sessions';
import { transferRoutes } from './routes/transfers';
import { liveRoutes } from './routes/live';
import { signalGroup, afterResponse } from './live';
import { GROUP_CODE_RE } from '../shared/groupCode';

export type { Env } from './http';

const MAX_BODY_BYTES = 16 * 1024;

export function createApp() {
  const app = new Hono<AppEnv>().basePath('/api');

  // Receipt uploads have their own limit (routes/attachments.ts), so the global 16 KB limit skips them.
  const RECEIPT_UPLOAD = /^\/api\/groups\/[^/]+\/expenses\/[^/]+\/attachments$/;
  const jsonBodyLimit = bodyLimit({
    maxSize: MAX_BODY_BYTES,
    onError: (c) => c.json({ error: 'request body too large', code: 'BODY_TOO_LARGE' } satisfies ErrorBody, 413),
  });
  app.use('*', (c, next) =>
    c.req.method === 'POST' && RECEIPT_UPLOAD.test(c.req.path) ? next() : jsonBodyLimit(c, next),
  );

  app.onError((err, c) => {
    if (err instanceof ApiError) {
      const body: ErrorBody = { error: err.message, code: err.code, ...(err.params && { params: err.params }) };
      return c.json(body, err.status);
    }
    console.error(err);
    return c.json({ error: 'internal error', code: 'INTERNAL' } satisfies ErrorBody, 500);
  });

  app.get('/health', (c) => c.json({ ok: true }));

  // Live updates: after any group write (or a read that set groupChanged) the open pages of the group are signalled.
  // Runs after the handler, so the D1 write has committed. A refused write (status 400 or more, or an error) does not
  // signal. Every group route is covered here, so the routes do not call the signal themselves.
  app.use('/groups/:code/*', async (c, next) => {
    await next();
    const code = c.req.param('code') ?? '';
    if (!GROUP_CODE_RE.test(code)) return;
    const wrote = c.req.method !== 'GET' && c.res.status < 400 && !c.error;
    if (wrote || c.get('groupChanged')) {
      await afterResponse(c, signalGroup(c.env, code));
    }
  });

  app.route('/', accountRoutes);
  app.route('/', myGroupRoutes);
  app.route('/groups', groupRoutes);
  app.route('/groups', memberRoutes);
  app.route('/groups', expenseRoutes);
  app.route('/groups', attachmentRoutes);
  app.route('/groups', sessionRoutes);
  app.route('/groups', transferRoutes);
  app.route('/groups', linkRoutes);
  app.route('/groups', liveRoutes);

  app.all('*', (c) => c.json({ error: 'not found', code: 'NOT_FOUND' } satisfies ErrorBody, 404));
  return app;
}
