import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ErrorBody } from '../../shared/errors';
import type { UserDto } from '../../shared/types';
import { resetGoogleKeyCache } from '../../worker/google';
import { Browser, GOOGLE_CLIENT_ID, createGoogleKey, createTestEnv, signIn } from './helpers';

let env: Awaited<ReturnType<typeof createTestEnv>>;

beforeEach(async () => {
  env = await createTestEnv();
});

afterEach(async () => {
  vi.unstubAllGlobals();
  resetGoogleKeyCache();
  await env.dispose();
});

async function nameRow(id: string) {
  return env.env.DB.prepare('SELECT name, name_custom FROM users WHERE id = ?')
    .bind(id)
    .first<{ name: string; name_custom: number }>();
}

describe('account name API (join_as_account)', () => {
  it('AN-1: PATCH name updates the name, sets name_custom = 1 and leaves the bank details unchanged', async () => {
    const b = new Browser(env.env);
    await signIn(b, 'alex@example.com');
    await b.call('PATCH', '/me', { bankBin: '970415', accountNo: '0123456789', accountName: 'ALEX BANK' });

    const res = await b.call<{ user: UserDto }>('PATCH', '/me', { name: 'Alex Kim' });
    expect(res.status).toBe(200);
    expect(res.json.user.name).toBe('Alex Kim');
    expect(res.json.user.bankBin).toBe('970415');
    expect(res.json.user.accountNo).toBe('0123456789');
    expect(res.json.user.accountName).toBe('ALEX BANK');

    const row = await nameRow(res.json.user.id);
    expect(row?.name).toBe('Alex Kim');
    expect(row?.name_custom).toBe(1);
  });

  it('AN-2: empty or spaces give 400 FIELD_REQUIRED, 41 characters give 400 FIELD_TOO_LONG, signed out gives 401 SIGN_IN_REQUIRED', async () => {
    const b = new Browser(env.env);

    const unauth = await b.call<ErrorBody>('PATCH', '/me', { name: 'Alex' });
    expect(unauth.status).toBe(401);
    expect(unauth.json.code).toBe('SIGN_IN_REQUIRED');

    await signIn(b, 'alex@example.com');

    const empty = await b.call<ErrorBody>('PATCH', '/me', { name: '' });
    expect(empty.status).toBe(400);
    expect(empty.json.code).toBe('FIELD_REQUIRED');
    expect(empty.json.params).toEqual({ field: 'name' });

    const spaces = await b.call<ErrorBody>('PATCH', '/me', { name: '   ' });
    expect(spaces.status).toBe(400);
    expect(spaces.json.code).toBe('FIELD_REQUIRED');

    const tooLong = await b.call<ErrorBody>('PATCH', '/me', { name: 'a'.repeat(41) });
    expect(tooLong.status).toBe(400);
    expect(tooLong.json.code).toBe('FIELD_TOO_LONG');
    expect(tooLong.json.params).toEqual({ field: 'name', max: 40 });

    const max = await b.call<{ user: UserDto }>('PATCH', '/me', { name: 'a'.repeat(40) });
    expect(max.status).toBe(200);
    expect(max.json.user.name).toBe('a'.repeat(40));
  });

  it('AN-3: a name with diacritics is stored and returned as typed', async () => {
    const b = new Browser(env.env);
    await signIn(b, 'dat@example.com');

    const typed = 'Đạt'; // Đạt
    const res = await b.call<{ user: UserDto }>('PATCH', '/me', { name: typed });
    expect(res.status).toBe(200);
    expect(res.json.user.name).toBe(typed);
  });

  it('AN-4: a bank-only PATCH after a custom name keeps the name and name_custom = 1', async () => {
    const b = new Browser(env.env);
    await signIn(b, 'alex@example.com');
    await b.call('PATCH', '/me', { name: 'Alex Custom' });

    const res = await b.call<{ user: UserDto }>('PATCH', '/me', { bankBin: '970415', accountNo: '0123456789' });
    expect(res.status).toBe(200);
    expect(res.json.user.name).toBe('Alex Custom');
    expect(res.json.user.accountNo).toBe('0123456789');

    const row = await nameRow(res.json.user.id);
    expect(row?.name).toBe('Alex Custom');
    expect(row?.name_custom).toBe(1);
  });

  it('AN-5: Google sign-in again keeps a custom name and refreshes the email; without a custom name the name follows the token', async () => {
    const googleKey = await createGoogleKey();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (url: string) => {
        if (url === 'https://www.googleapis.com/oauth2/v3/certs') {
          return new Response(JSON.stringify(googleKey.jwks), {
            headers: { 'Cache-Control': 'public, max-age=3600' },
          });
        }
        return new Response('Not found', { status: 404 });
      }),
    );
    const b = new Browser({ ...env.env, GOOGLE_CLIENT_ID });

    const first = await googleKey.sign({ sub: 'google-sub-jamie', email: 'jamie@example.com', name: 'Jamie One' });
    const sign1 = await b.call<{ user: UserDto }>('POST', '/auth/google', { credential: first });
    expect(sign1.status).toBe(200);
    expect(sign1.json.user.name).toBe('Jamie One');

    const second = await googleKey.sign({
      sub: 'google-sub-jamie',
      email: 'jamie-new@example.com',
      name: 'Jamie Two',
    });
    const sign2 = await b.call<{ user: UserDto }>('POST', '/auth/google', { credential: second });
    expect(sign2.json.user.name).toBe('Jamie Two');
    expect(sign2.json.user.email).toBe('jamie-new@example.com');

    await b.call('PATCH', '/me', { name: 'Jamie Custom' });

    const third = await googleKey.sign({
      sub: 'google-sub-jamie',
      email: 'jamie-refreshed@example.com',
      name: 'Jamie Three',
    });
    const sign3 = await b.call<{ user: UserDto }>('POST', '/auth/google', { credential: third });
    expect(sign3.status).toBe(200);
    expect(sign3.json.user.name).toBe('Jamie Custom');
    expect(sign3.json.user.email).toBe('jamie-refreshed@example.com');
  });

  it('AN-5b: development sign-in again keeps a custom name', async () => {
    const b = new Browser({ ...env.env, DEV_LOGIN: 'true' });
    await b.call('POST', '/auth/dev', { email: 'devuser@example.com', name: 'Dev 1' });
    const again = await b.call<{ user: UserDto }>('POST', '/auth/dev', { email: 'devuser@example.com', name: 'Dev 2' });
    expect(again.json.user.name).toBe('Dev 2');

    await b.call('PATCH', '/me', { name: 'Dev Custom' });
    const third = await b.call<{ user: UserDto }>('POST', '/auth/dev', { email: 'devuser@example.com', name: 'Dev 3' });
    expect(third.json.user.name).toBe('Dev Custom');
  });

  it('AN-6: renaming the account changes no member name, no last_activity_at and no audit row', async () => {
    const owner = new Browser(env.env);
    const created = await owner.call<{ code: string }>('POST', '/groups', { name: 'Party', ownerName: 'Alice' });
    const code = created.json.code;

    const sam = new Browser(env.env);
    await signIn(sam, 'sam@example.com');
    const joined = await sam.call<{ id: string }>('POST', `/groups/${code}/members`, {
      name: 'Sam Original',
      claim: true,
    });
    expect(joined.status).toBe(201);

    const before = await env.env.DB.prepare('SELECT last_activity_at FROM groups WHERE code = ?')
      .bind(code)
      .first<{ last_activity_at: string }>();
    const auditBefore = await env.env.DB.prepare('SELECT COUNT(*) AS c FROM audit_log WHERE group_code = ?')
      .bind(code)
      .first<{ c: number }>();

    const renamed = await sam.call<{ user: UserDto }>('PATCH', '/me', { name: 'Sam Custom' });
    expect(renamed.status).toBe(200);

    const after = await env.env.DB.prepare('SELECT last_activity_at FROM groups WHERE code = ?')
      .bind(code)
      .first<{ last_activity_at: string }>();
    const auditAfter = await env.env.DB.prepare('SELECT COUNT(*) AS c FROM audit_log WHERE group_code = ?')
      .bind(code)
      .first<{ c: number }>();
    const member = await env.env.DB.prepare('SELECT name FROM members WHERE id = ?')
      .bind(joined.json.id)
      .first<{ name: string }>();

    expect(after?.last_activity_at).toBe(before?.last_activity_at);
    expect(auditAfter?.c).toBe(auditBefore?.c);
    expect(member?.name).toBe('Sam Original');
  });
});

describe('0008_user_name_custom migration (AN-7)', () => {
  it('existing user rows get name_custom = 0', async () => {
    const { env: migrated, dispose } = await createTestEnv({
      beforeMigration: '0008_user_name_custom.sql',
      seed: async (db) => {
        await db
          .prepare('INSERT INTO users (id, google_sub, email, name, created_at) VALUES (?, ?, ?, ?, ?)')
          .bind('user-before', 'dev:old@example.com', 'old@example.com', 'Old Name', '2026-01-01T00:00:00.000Z')
          .run();
      },
    });
    try {
      const row = await migrated.DB.prepare('SELECT name_custom FROM users WHERE id = ?')
        .bind('user-before')
        .first<{ name_custom: number }>();
      expect(row?.name_custom).toBe(0);
    } finally {
      await dispose();
    }
  });
});
