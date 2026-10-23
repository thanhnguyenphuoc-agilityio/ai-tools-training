// Who is calling. Every identity source is resolved here and nowhere else, so
// adding one (e.g. a Google account session, see docs/design.md) is one change.
import type { Context } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import type { AppEnv } from './http';

const ONE_YEAR = 60 * 60 * 24 * 365;

/** 32 random bytes, base64url. Used for owner keys and device tokens. */
export function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
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

export interface Identity {
  /** The member this browser acts as, if any. */
  memberId: string | null;
  isOwner: boolean;
}

export async function resolveIdentity(
  c: Context<AppEnv>,
  code: string,
  group: { owner_key_hash: string },
): Promise<Identity> {
  const db = c.env.DB;

  const ownerKey = getCookie(c, ownerCookieName(code));
  const isOwner = !!ownerKey && (await sha256Hex(ownerKey)) === group.owner_key_hash;

  let memberId: string | null = null;
  const memberCookie = getCookie(c, memberCookieName(code));
  if (memberCookie) {
    const [id, token] = memberCookie.split('.');
    const row = await db
      .prepare('SELECT id, token_hash FROM members WHERE id = ? AND group_code = ? AND removed_at IS NULL')
      .bind(id, code)
      .first<{ id: string; token_hash: string | null }>();
    if (row?.token_hash && token && (await sha256Hex(token)) === row.token_hash) memberId = row.id;
  }

  // An owner who recovered access on a new device acts as the owner member.
  if (!memberId && isOwner) {
    const row = await db
      .prepare('SELECT id FROM members WHERE group_code = ? AND is_owner = 1')
      .bind(code)
      .first<{ id: string }>();
    memberId = row?.id ?? null;
  }
  return { memberId, isOwner };
}
