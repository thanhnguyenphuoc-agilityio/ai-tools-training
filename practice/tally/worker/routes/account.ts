// Account authentication: Google ID token, development sign-in, session status and logout.
import { Hono } from 'hono';
import type { BankDetails, ConfigResponse, MeResponse, UserDto } from '../../shared/types';
import { clearSessionCookie, createSession, endSession, resolveAccount } from '../auth';
import { deleteAccount } from '../accountDelete';
import { verifyGoogleIdToken } from '../google';
import { ApiError, bankDetails, now, optionalText, readJson, text, type AppEnv, type UserRow } from '../http';
import { requireSignedIn } from '../policy';

export const accountRoutes = new Hono<AppEnv>();

function toUserDto(row: UserRow): UserDto {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    bankBin: row.bank_bin ?? null,
    accountNo: row.account_no ?? null,
    accountName: row.account_name ?? null,
  };
}

/**
 * Creates the user for a Google account id or refreshes its email and name. One statement, so two first
 * sign-ins of the same person at the same moment cannot fail on the unique index of google_sub.
 */
async function upsertUser(db: D1Database, googleSub: string, email: string, name: string): Promise<UserRow> {
  const row = await db
    .prepare(
      `INSERT INTO users (id, google_sub, email, name, created_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(google_sub) DO UPDATE SET email = excluded.email, name = CASE WHEN users.name_custom = 1 THEN users.name ELSE excluded.name END RETURNING *`,
    )
    .bind(crypto.randomUUID(), googleSub, email, name, now())
    .first<UserRow>();
  return row!;
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

  const userRow = await upsertUser(c.env.DB, googleUser.sub, googleUser.email, googleUser.name);

  await createSession(c, userRow.id);
  const user = toUserDto(userRow);
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

  const userRow = await upsertUser(c.env.DB, sub, email, userName);

  await createSession(c, userRow.id);
  const user = toUserDto(userRow);
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
    user: toUserDto(account),
  } satisfies MeResponse);
});

accountRoutes.patch('/me', async (c) => {
  const account = await resolveAccount(c);
  const userId = requireSignedIn(account);
  const body = await readJson(c);
  const name = body.name !== undefined ? text(body.name, 'name', 40) : account!.name;
  const nameCustom = body.name !== undefined ? 1 : account!.name_custom;
  const current: BankDetails = {
    bankBin: account!.bank_bin,
    accountNo: account!.account_no,
    accountName: account!.account_name,
  };
  const patch = bankDetails(body, current);
  const updated = await c.env.DB.prepare(
    'UPDATE users SET name = ?, name_custom = ?, bank_bin = ?, account_no = ?, account_name = ? WHERE id = ? RETURNING *',
  )
    .bind(name, nameCustom, patch.bankBin, patch.accountNo, patch.accountName, userId)
    .first<UserRow>();
  return c.json({ user: toUserDto(updated!) });
});

accountRoutes.delete('/me', async (c) => {
  const userId = requireSignedIn(await resolveAccount(c));
  await deleteAccount(c.env.DB, userId, now());
  clearSessionCookie(c);
  return c.json({ ok: true });
});
