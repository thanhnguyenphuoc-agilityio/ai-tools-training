// Account authentication: Google ID token, development sign-in, session status and logout.
import { Hono } from 'hono';
import type { ConfigResponse, MeResponse, UserDto } from '../../shared/types';
import { createSession, endSession, resolveAccount } from '../auth';
import { verifyGoogleIdToken } from '../google';
import { ApiError, now, optionalText, readJson, text, type AppEnv } from '../http';

export const accountRoutes = new Hono<AppEnv>();

/**
 * Creates the user for a Google account id or refreshes its email and name. One statement, so two first
 * sign-ins of the same person at the same moment cannot fail on the unique index of google_sub.
 */
async function upsertUser(db: D1Database, googleSub: string, email: string, name: string): Promise<string> {
  const row = await db
    .prepare(
      `INSERT INTO users (id, google_sub, email, name, created_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(google_sub) DO UPDATE SET email = excluded.email, name = excluded.name RETURNING id`,
    )
    .bind(crypto.randomUUID(), googleSub, email, name, now())
    .first<{ id: string }>();
  return row!.id;
}

accountRoutes.get('/config', (c) => {
  const isLocalhost = new URL(c.req.url).hostname === 'localhost';
  const devLogin = c.env.DEV_LOGIN === 'true' && isLocalhost;
  return c.json({
    googleClientId: c.env.GOOGLE_CLIENT_ID || null,
    devLogin,
  } satisfies ConfigResponse);
});

accountRoutes.post('/auth/google', async (c) => {
  if (!c.env.GOOGLE_CLIENT_ID) {
    throw new ApiError(404, 'NOT_FOUND', 'google auth not configured');
  }
  const body = await readJson(c);
  const credential = text(body.credential, 'credential', 4000);
  const googleUser = await verifyGoogleIdToken(credential, {
    clientId: c.env.GOOGLE_CLIENT_ID,
  });

  const userId = await upsertUser(c.env.DB, googleUser.sub, googleUser.email, googleUser.name);

  await createSession(c, userId);
  const user: UserDto = { id: userId, name: googleUser.name, email: googleUser.email };
  return c.json({ user });
});

accountRoutes.post('/auth/dev', async (c) => {
  const isLocalhost = new URL(c.req.url).hostname === 'localhost';
  if (c.env.DEV_LOGIN !== 'true' || !isLocalhost) {
    throw new ApiError(404, 'NOT_FOUND', 'not found');
  }

  const body = await readJson(c);
  const email = text(body.email, 'email', 255);
  if (!email.includes('@') || email.startsWith('@') || email.endsWith('@')) {
    throw new ApiError(400, 'FIELD_REQUIRED', 'valid email required', { field: 'email' });
  }

  const userName = optionalText(body.name, 'name', 80) ?? email.split('@')[0];
  const sub = 'dev:' + email.toLowerCase();

  const userId = await upsertUser(c.env.DB, sub, email, userName);

  await createSession(c, userId);
  const user: UserDto = { id: userId, name: userName, email };
  return c.json({ user });
});

accountRoutes.post('/auth/logout', async (c) => {
  await endSession(c);
  return c.json({ ok: true });
});

accountRoutes.get('/me', async (c) => {
  const account = await resolveAccount(c);
  if (!account) {
    return c.json({ user: null } satisfies MeResponse);
  }
  return c.json({
    user: { id: account.id, name: account.name, email: account.email },
  } satisfies MeResponse);
});
