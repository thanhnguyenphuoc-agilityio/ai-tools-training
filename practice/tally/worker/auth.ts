// Who is calling. Every identity source is resolved here and nowhere else, so
// adding one (e.g. a Google account session, see docs/design.md) is one change.
import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { now, type AppEnv, type UserRow } from './http';

export const SESSION_DAYS = 30;
const SESSION_MAX_AGE = SESSION_DAYS * 24 * 60 * 60;
const ONE_YEAR = 60 * 60 * 24 * 365;

export const sessionCookieName = 'tally_session';

/** 32 random bytes, base64url. Used for owner keys and device tokens. */
export function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const ownerCookieName = (code: string) => `tally_owner_${code}`;
export const memberCookieName = (code: string) => `tally_member_${code}`;

/** Group cookies are HttpOnly and scoped to that group's API path. */
export function setGroupCookie(c: Context, code: string, name: string, value: string): void {
  setCookie(c, name, value, {
    path: `/api/groups/${code}`,
    httpOnly: true,
    sameSite: 'Lax',
    secure: new URL(c.req.url).protocol === 'https:',
    maxAge: ONE_YEAR,
  });
}

export function clearSessionCookie(c: Context<AppEnv>): void {
  deleteCookie(c, sessionCookieName, { path: '/api' });
}

export async function createSession(c: Context<AppEnv>, userId: string): Promise<string> {
  const token = randomToken();
  const hash = await sha256Hex(token);
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE * 1000).toISOString();
  await c.env.DB.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .bind(hash, userId, now(), expiresAt)
    .run();
  setCookie(c, sessionCookieName, token, {
    path: '/api',
    httpOnly: true,
    sameSite: 'Lax',
    secure: new URL(c.req.url).protocol === 'https:',
    maxAge: SESSION_MAX_AGE,
  });
  return token;
}

export async function endSession(c: Context<AppEnv>): Promise<void> {
  const token = getCookie(c, sessionCookieName);
  if (token) {
    const hash = await sha256Hex(token);
    await c.env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(hash).run();
  }
  clearSessionCookie(c);
}

export async function resolveAccount(c: Context<AppEnv>): Promise<UserRow | null> {
  const cached = c.get('user');
  if (cached !== undefined) return cached;

  const token = getCookie(c, sessionCookieName);
  if (!token) {
    c.set('user', null);
    return null;
  }

  const hash = await sha256Hex(token);
  const currentTime = new Date().toISOString();
  const user = await c.env.DB.prepare(
    'SELECT u.* FROM sessions s JOIN users u ON s.user_id = u.id WHERE s.token_hash = ? AND s.expires_at > ?',
  )
    .bind(hash, currentTime)
    .first<UserRow>();

  if (!user) {
    clearSessionCookie(c);
    c.set('user', null);
    return null;
  }

  c.set('user', user);
  return user;
}

export async function deleteExpiredSessions(db: D1Database, cutoff: Date): Promise<number> {
  const res = await db.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(cutoff.toISOString()).run();
  return res.meta.changes ?? 0;
}

export interface Identity {
  userId: string | null;
  hasOwnerKey: boolean;
  deviceMemberId: string | null;
  accountMemberId: string | null;
  /** The member this browser acts as, if any. */
  memberId: string | null;
  isOwner: boolean;
}

export async function resolveIdentity(
  c: Context<AppEnv>,
  code: string,
  group: { owner_key_hash: string; owner_user_id?: string | null },
): Promise<Identity> {
  const db = c.env.DB;
  const account = await resolveAccount(c);
  const userId = account?.id ?? null;

  const ownerKey = getCookie(c, ownerCookieName(code));
  const hasOwnerKey = !!ownerKey && (await sha256Hex(ownerKey)) === group.owner_key_hash;
  const isOwner = hasOwnerKey || (userId !== null && group.owner_user_id === userId);

  let deviceMemberId: string | null = null;
  const memberCookie = getCookie(c, memberCookieName(code));
  if (memberCookie) {
    const [id, token] = memberCookie.split('.');
    const row = await db
      .prepare('SELECT id, token_hash FROM members WHERE id = ? AND group_code = ? AND removed_at IS NULL')
      .bind(id, code)
      .first<{ id: string; token_hash: string | null }>();
    if (row?.token_hash && token && (await sha256Hex(token)) === row.token_hash) {
      deviceMemberId = row.id;
    }
  }

  let accountMemberId: string | null = null;
  if (userId !== null) {
    const row = await db
      .prepare('SELECT id FROM members WHERE group_code = ? AND user_id = ? AND removed_at IS NULL')
      .bind(code, userId)
      .first<{ id: string }>();
    accountMemberId = row?.id ?? null;
  }

  let memberId: string | null = deviceMemberId ?? accountMemberId;
  // An owner who recovered access on a new device acts as the owner member.
  if (!memberId && isOwner) {
    const row = await db
      .prepare('SELECT id FROM members WHERE group_code = ? AND is_owner = 1 AND removed_at IS NULL')
      .bind(code)
      .first<{ id: string }>();
    memberId = row?.id ?? null;
  }

  return {
    userId,
    hasOwnerKey,
    deviceMemberId,
    accountMemberId,
    memberId,
    isOwner,
  };
}
