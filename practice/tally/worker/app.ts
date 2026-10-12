// Wires the route files together. New features add a route file and mount it here.
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { ErrorBody } from '../shared/errors';
import { ApiError, type AppEnv } from './http';
import { expenseRoutes } from './routes/expenses';
import { groupRoutes } from './routes/groups';
import { memberRoutes } from './routes/members';
import { transferRoutes } from './routes/transfers';

export type { Env } from './http';

export function createApp() {
  const app = new Hono<AppEnv>().basePath('/api');

  app.use(
    '*',
    bodyLimit({
      maxSize: 16 * 1024,
      onError: (c) => c.json({ error: 'request body too large', code: 'BODY_TOO_LARGE' } satisfies ErrorBody, 413),
    }),
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

  app.route('/groups', groupRoutes);
  app.route('/groups', memberRoutes);
  app.route('/groups', expenseRoutes);
  app.route('/groups', transferRoutes);

  app.all('*', (c) => c.json({ error: 'not found', code: 'NOT_FOUND' } satisfies ErrorBody, 404));
  return app;
}
