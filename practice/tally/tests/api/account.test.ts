import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ErrorBody } from '../../shared/errors';
import type { GroupDto, MeResponse } from '../../shared/types';
import { runDailyJobs } from '../../worker/cleanup';
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

describe('account and Google sign-in API', () => {
  it('GS-2: create while signed in; second browser signed in is owner without key', async () => {
    const b1 = new Browser(env.env);
    await signIn(b1, 'owner@example.com');

    const createRes = await b1.call<{ code: string }>('POST', '/groups', {
      name: 'Holiday Trip',
      ownerName: 'Alice',
    });
    expect(createRes.status).toBe(201);
    const code = createRes.json.code;

    // Second browser signs in as the same email
    const b2 = new Browser(env.env);
    await signIn(b2, 'owner@example.com');
    const groupRes = await b2.call<GroupDto>('GET', `/groups/${code}`);
    expect(groupRes.status).toBe(200);
    expect(groupRes.json.me.isOwner).toBe(true);
    // Acts as the owner member on the new device
    expect(groupRes.json.me.memberId).toBeTruthy();
  });

  it('GS-3: join and claim while signed in; second browser signed in resolves to same memberId', async () => {
    const owner = new Browser(env.env);
    const code = (await owner.call('POST', '/groups', { name: 'Trip', ownerName: 'Alice' })).json.code;

    // Browser 1 joins while signed in as Bob
    const b1 = new Browser(env.env);
    await signIn(b1, 'bob@example.com');
    const joinRes = await b1.call<{ id: string }>('POST', `/groups/${code}/members`, {
      name: 'Bob',
      claim: true,
    });
    expect(joinRes.status).toBe(201);
    const bobMemberId = joinRes.json.id;

    // Browser 2 signs in as Bob and opens group
    const b2 = new Browser(env.env);
    await signIn(b2, 'bob@example.com');
    const b2Group = await b2.call<GroupDto>('GET', `/groups/${code}`);
    expect(b2Group.json.me.memberId).toBe(bobMemberId);

    // Browser 3 claims Charlie while signed in as Charlie
    const charlieMemberId = (await owner.call('POST', `/groups/${code}/members`, { name: 'Charlie' })).json.id;

    const b3 = new Browser(env.env);
    await signIn(b3, 'charlie@example.com');
    const claimRes = await b3.call('POST', `/groups/${code}/members/${charlieMemberId}/claim`);
    expect(claimRes.status).toBe(200);

    const b4 = new Browser(env.env);
    await signIn(b4, 'charlie@example.com');
    const b4Group = await b4.call<GroupDto>('GET', `/groups/${code}`);
    expect(b4Group.json.me.memberId).toBe(charlieMemberId);
  });

  it('GS-4: link with owner key sets owner_user_id; linking group owned by another account returns 403', async () => {
    // Created as guest (not signed in)
    const guest = new Browser(env.env);
    const code = (await guest.call('POST', '/groups', { name: 'Party', ownerName: 'Alice' })).json.code;

    // Guest signs in as Alice
    await signIn(guest, 'alice@example.com');

    // Link to account
    const linkRes = await guest.call<{ ok: boolean; changed: boolean }>('POST', `/groups/${code}/link`);
    expect(linkRes.status).toBe(200);
    expect(linkRes.json.changed).toBe(true);

    const groupRow = await env.env.DB.prepare('SELECT owner_user_id FROM groups WHERE code = ?')
      .bind(code)
      .first<{ owner_user_id: string }>();
    expect(groupRow?.owner_user_id).toBeTruthy();

    // Linking again returns changed: false
    const relinkRes = await guest.call<{ ok: boolean; changed: boolean }>('POST', `/groups/${code}/link`);
    expect(relinkRes.status).toBe(200);
    expect(relinkRes.json.changed).toBe(false);

    // Another account with owner key (e.g. copied recovery key) tries to link: 403
    const intruder = new Browser(env.env);
    await signIn(intruder, 'intruder@example.com');
    const ownerCookie = guest.getCookie(`tally_owner_${code}`);
    // Intruder has owner cookie
    const intruderLink = await intruder.call<ErrorBody>(
      'POST',
      `/groups/${code}/link`,
      {},
      { cookie: `tally_owner_${code}=${ownerCookie}` },
    );
    expect(intruderLink.status).toBe(403);
    expect(intruderLink.json.code).toBe('GROUP_OWNED_BY_OTHER_ACCOUNT');
  });

  it('GS-5: account already a member cannot join, claim, or link another member (409 ACCOUNT_ALREADY_MEMBER)', async () => {
    const owner = new Browser(env.env);
    const code = (await owner.call('POST', '/groups', { name: 'Party', ownerName: 'Alice' })).json.code;

    const b1 = new Browser(env.env);
    await signIn(b1, 'sam@example.com');
    await b1.call('POST', `/groups/${code}/members`, { name: 'Sam', claim: true });

    // Try to join as another member on a clean device but signed in with same account
    const b2 = new Browser(env.env);
    await signIn(b2, 'sam@example.com');
    const secondJoin = await b2.call<ErrorBody>('POST', `/groups/${code}/members`, {
      name: 'Sam Second',
      claim: true,
    });
    expect(secondJoin.status).toBe(409);
    expect(secondJoin.json.code).toBe('ACCOUNT_ALREADY_MEMBER');

    // Try to claim another member
    const daveId = (await owner.call('POST', `/groups/${code}/members`, { name: 'Dave' })).json.id;
    const claimRes = await b2.call<ErrorBody>('POST', `/groups/${code}/members/${daveId}/claim`);
    expect(claimRes.status).toBe(409);
    expect(claimRes.json.code).toBe('ACCOUNT_ALREADY_MEMBER');

    // Linking a member linked elsewhere returns 409 MEMBER_LINKED_ELSEWHERE
    const eveBrowser = new Browser(env.env);
    await signIn(eveBrowser, 'eve@example.com');
    await eveBrowser.call('POST', `/groups/${code}/members`, { name: 'Eve', claim: true });

    // Link a member that is linked elsewhere
    const frankBrowser = new Browser(env.env);
    await signIn(frankBrowser, 'frank@example.com');
    // Device token for Eve used by Frank account
    const eveCookie = eveBrowser.getCookie(`tally_member_${code}`);
    const linkElse = await frankBrowser.call<ErrorBody>(
      'POST',
      `/groups/${code}/link`,
      {},
      { cookie: `tally_member_${code}=${eveCookie}` },
    );
    expect(linkElse.status).toBe(409);
    expect(linkElse.json.code).toBe('MEMBER_LINKED_ELSEWHERE');
  });

  it('GS-6: sign out, then GET /me returns null and owner key still gives isOwner', async () => {
    const b = new Browser(env.env);
    await signIn(b, 'user@example.com');
    const code = (await b.call('POST', '/groups', { name: 'Party', ownerName: 'Alice' })).json.code;

    const logoutRes = await b.call('POST', '/auth/logout');
    expect(logoutRes.status).toBe(200);

    const meRes = await b.call<MeResponse>('GET', '/me');
    expect(meRes.status).toBe(200);
    expect(meRes.json.user).toBeNull();

    // Owner key on device still gives isOwner
    const groupRes = await b.call<GroupDto>('GET', `/groups/${code}`);
    expect(groupRes.json.me.isOwner).toBe(true);
  });

  it('GS-7: expired session returns null and cookie is cleared', async () => {
    const b = new Browser(env.env);
    await signIn(b, 'user@example.com');

    // Set session expires_at in the past
    await env.env.DB.prepare("UPDATE sessions SET expires_at = '2020-01-01T00:00:00.000Z'").run();

    const meRes = await b.call<MeResponse>('GET', '/me');
    expect(meRes.status).toBe(200);
    expect(meRes.json.user).toBeNull();

    // Cookie is cleared
    expect(b.getCookie('tally_session')).toBeUndefined();
  });

  it('GS-8: dev sign-in 404 without DEV_LOGIN, and 404 with it from another host', async () => {
    const bNoDev = new Browser(env.env);
    const res1 = await bNoDev.call('POST', '/auth/dev', { email: 'test@example.com' });
    expect(res1.status).toBe(404);

    const bWrongHost = new Browser({ ...env.env, DEV_LOGIN: 'true' }, 'http://127.0.0.1');
    const res2 = await bWrongHost.call('POST', '/auth/dev', { email: 'test@example.com' });
    expect(res2.status).toBe(404);
  });

  it('GS-9: GET /groups/:code JSON string contains no email', async () => {
    const b = new Browser(env.env);
    await signIn(b, 'supersecret@example.com');
    const code = (await b.call('POST', '/groups', { name: 'Secret Group', ownerName: 'Alice' })).json.code;

    const guest = new Browser(env.env);
    const res = await guest.call('GET', `/groups/${code}`);
    expect(JSON.stringify(res.json)).not.toContain('supersecret@example.com');
  });

  it('GS-12: remove a linked member; account me.memberId is null; join again works', async () => {
    const owner = new Browser(env.env);
    const code = (await owner.call('POST', '/groups', { name: 'Camp', ownerName: 'Alice' })).json.code;

    const sam = new Browser(env.env);
    await signIn(sam, 'sam@example.com');
    const samId = (await sam.call('POST', `/groups/${code}/members`, { name: 'Sam', claim: true })).json.id;

    // Owner removes Sam
    const removeRes = await owner.call('POST', `/groups/${code}/members/${samId}/remove`, {
      reason: 'Left camp',
    });
    expect(removeRes.status).toBe(200);

    // Sam's account resolves to null memberId
    const samGroup = await sam.call<GroupDto>('GET', `/groups/${code}`);
    expect(samGroup.json.me.memberId).toBeNull();

    // Sam can join again as a new member
    const rejoinRes = await sam.call('POST', `/groups/${code}/members`, {
      name: 'Sam New',
      claim: true,
    });
    expect(rejoinRes.status).toBe(201);
  });

  it('GS-13: refusal codes: SIGN_IN_REQUIRED on link without session', async () => {
    const guest = new Browser(env.env);
    const code = (await guest.call('POST', '/groups', { name: 'Camp', ownerName: 'Alice' })).json.code;

    const linkRes = await guest.call<ErrorBody>('POST', `/groups/${code}/link`);
    expect(linkRes.status).toBe(401);
    expect(linkRes.json.code).toBe('SIGN_IN_REQUIRED');
  });

  it('GS-14: the daily job deletes only sessions with expires_at <= now', async () => {
    const db = env.env.DB;
    await db
      .prepare(
        "INSERT INTO users (id, google_sub, email, name, created_at) VALUES ('u1', 'sub1', 'u1@test.com', 'U1', '2026-10-01T00:00:00Z')",
      )
      .run();

    await db
      .prepare(
        "INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES ('hash1', 'u1', '2026-10-01T00:00:00Z', '2026-10-10T00:00:00.000Z')",
      )
      .run();
    await db
      .prepare(
        "INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES ('hash2', 'u1', '2026-10-01T00:00:00Z', '2026-10-20T00:00:00.000Z')",
      )
      .run();

    const result = await runDailyJobs(env.env, new Date('2026-10-15T00:00:00.000Z'));
    expect(result).toEqual({ groups: 0, sessions: 1 });

    const remaining = await db.prepare('SELECT token_hash FROM sessions').all<{ token_hash: string }>();
    expect(remaining.results.map((r) => r.token_hash)).toEqual(['hash2']);
  });

  it('GS-16: link as a non-owner member: only the member is linked (member.link); as visitor: 401 JOIN_FIRST', async () => {
    const owner = new Browser(env.env);
    const code = (await owner.call('POST', '/groups', { name: 'Outing', ownerName: 'Alice' })).json.code;

    // Visitor without joining: 401 JOIN_FIRST
    const visitor = new Browser(env.env);
    await signIn(visitor, 'visitor@example.com');
    const visitorLink = await visitor.call<ErrorBody>('POST', `/groups/${code}/link`);
    expect(visitorLink.status).toBe(401);
    expect(visitorLink.json.code).toBe('JOIN_FIRST');

    // Non-owner member joins
    const memberBrowser = new Browser(env.env);
    const joinRes = await memberBrowser.call<{ id: string }>('POST', `/groups/${code}/members`, {
      name: 'Bob',
      claim: true,
    });
    const bobMemberId = joinRes.json.id;

    // Link non-owner member
    await signIn(memberBrowser, 'bob@example.com');
    const memberLinkRes = await memberBrowser.call<{ ok: boolean; changed: boolean }>('POST', `/groups/${code}/link`);
    expect(memberLinkRes.status).toBe(200);
    expect(memberLinkRes.json.changed).toBe(true);

    // Only member was linked, group owner_user_id stays null
    const groupRow = await env.env.DB.prepare('SELECT owner_user_id FROM groups WHERE code = ?')
      .bind(code)
      .first<{ owner_user_id: string | null }>();
    expect(groupRow?.owner_user_id).toBeNull();

    const memberRow = await env.env.DB.prepare('SELECT user_id FROM members WHERE id = ?')
      .bind(bobMemberId)
      .first<{ user_id: string | null }>();
    expect(memberRow?.user_id).toBeTruthy();

    const auditRow = await env.env.DB.prepare(
      'SELECT action, target FROM audit_log WHERE group_code = ? AND action = ?',
    )
      .bind(code, 'member.link')
      .first<{ action: string; target: string | null }>();
    expect(auditRow?.action).toBe('member.link');
    expect(auditRow?.target).toBe(bobMemberId);
  });

  it('Activity: sign-in does not move last_activity_at; link moves it and writes audit', async () => {
    const owner = new Browser(env.env);
    const code = (await owner.call('POST', '/groups', { name: 'Trip', ownerName: 'Alice' })).json.code;

    // Set last_activity_at to past
    const past = '2026-10-01T00:00:00.000Z';
    await env.env.DB.prepare('UPDATE groups SET last_activity_at = ? WHERE code = ?').bind(past, code).run();

    // Sign in on guest browser
    const guest = new Browser(env.env);
    await signIn(guest, 'alice@example.com');

    // Sign in did not touch group
    const rowAfterSignIn = await env.env.DB.prepare('SELECT last_activity_at FROM groups WHERE code = ?')
      .bind(code)
      .first<{ last_activity_at: string }>();
    expect(rowAfterSignIn?.last_activity_at).toBe(past);

    // Link moves activity and writes group.link audit
    const ownerCookie = owner.getCookie(`tally_owner_${code}`);
    const linkRes = await guest.call(
      'POST',
      `/groups/${code}/link`,
      {},
      { cookie: `tally_owner_${code}=${ownerCookie}` },
    );
    expect(linkRes.status).toBe(200);

    const rowAfterLink = await env.env.DB.prepare('SELECT last_activity_at FROM groups WHERE code = ?')
      .bind(code)
      .first<{ last_activity_at: string }>();
    expect(rowAfterLink?.last_activity_at).not.toBe(past);

    const auditRow = await env.env.DB.prepare('SELECT action FROM audit_log WHERE group_code = ? AND action = ?')
      .bind(code, 'group.link')
      .first<{ action: string }>();
    expect(auditRow?.action).toBe('group.link');
  });

  describe('POST /auth/google', () => {
    // Google is replaced by a throwaway key pair; its JWKS answers the one fetch the Worker makes.
    async function withGoogle() {
      const google = await createGoogleKey();
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => new Response(JSON.stringify(google.jwks), { headers: { 'cache-control': 'max-age=3600' } })),
      );
      return google;
    }
    const googleEnv = () => ({ ...env.env, GOOGLE_CLIENT_ID });

    it('answers 404 NOT_FOUND when no Google client id is configured', async () => {
      const b = new Browser(env.env);
      const res = await b.call<ErrorBody>('POST', '/auth/google', { credential: 'x.y.z' });
      expect(res.status).toBe(404);
      expect(res.json.code).toBe('NOT_FOUND');
    });

    it('GS-13: a rejected token answers 401 INVALID_GOOGLE_TOKEN, opens no session and creates no user', async () => {
      const google = await withGoogle();
      const b = new Browser(googleEnv());
      for (const credential of [
        'not-a-jwt',
        await google.sign({ aud: 'another-client' }),
        await google.sign({ email_verified: false }),
        await google.sign({ exp: Math.floor(Date.now() / 1000) - 1000 }),
      ]) {
        const res = await b.call<ErrorBody>('POST', '/auth/google', { credential });
        expect(res.status).toBe(401);
        expect(res.json.code).toBe('INVALID_GOOGLE_TOKEN');
      }
      expect(b.getCookie('tally_session')).toBeUndefined();
      const users = await env.env.DB.prepare('SELECT COUNT(*) AS n FROM users').first<{ n: number }>();
      expect(users?.n).toBe(0);
    });

    it('a valid token creates the user and a 30-day session; a second sign-in reuses the user', async () => {
      const google = await withGoogle();
      const b = new Browser(googleEnv());
      const first = await b.call<{ user: { id: string; email: string; name: string } }>('POST', '/auth/google', {
        credential: await google.sign({ sub: 'google-sub-9', email: 'sam@example.com', name: 'Sam' }),
      });
      expect(first.status).toBe(200);
      expect(first.json.user).toMatchObject({ email: 'sam@example.com', name: 'Sam' });
      expect(b.getCookie('tally_session')).toBeTruthy();

      const me = await b.call<MeResponse>('GET', '/me');
      expect(me.json.user?.email).toBe('sam@example.com');

      // The session lasts 30 days from sign-in.
      const session = await env.env.DB.prepare('SELECT created_at, expires_at FROM sessions').first<{
        created_at: string;
        expires_at: string;
      }>();
      const days = (Date.parse(session!.expires_at) - Date.parse(session!.created_at)) / 86_400_000;
      expect(Math.abs(days - 30)).toBeLessThan(0.01);

      const second = new Browser(googleEnv());
      const again = await second.call<{ user: { id: string; name: string } }>('POST', '/auth/google', {
        credential: await google.sign({ sub: 'google-sub-9', email: 'sam@example.com', name: 'Samuel' }),
      });
      expect(again.json.user.id).toBe(first.json.user.id);
      expect(again.json.user.name).toBe('Samuel');
      const users = await env.env.DB.prepare('SELECT COUNT(*) AS n FROM users').first<{ n: number }>();
      expect(users?.n).toBe(1);
    });

    it('two simultaneous first sign-ins of one Google account end with one user', async () => {
      const google = await withGoogle();
      const credential = await google.sign({ sub: 'google-sub-race' });
      const results = await Promise.all(
        [1, 2].map(() =>
          new Browser(googleEnv()).call<{ user: { id: string } }>('POST', '/auth/google', { credential }),
        ),
      );
      expect(results.map((r) => r.status)).toEqual([200, 200]);
      expect(results[0].json.user.id).toBe(results[1].json.user.id);
    });
  });

  describe('linking', () => {
    const linkRows = (code: string) =>
      env.env.DB.prepare(
        'SELECT g.owner_user_id AS owner, m.user_id AS member FROM groups g JOIN members m ON m.group_code = g.code WHERE g.code = ? AND m.is_owner = 1',
      )
        .bind(code)
        .first<{ owner: string | null; member: string | null }>();

    it('GS-5: an owner whose account is already another member of the group cannot link; nothing changes', async () => {
      const guest = new Browser(env.env);
      const code = (await guest.call('POST', '/groups', { name: 'Trip', ownerName: 'Alice' })).json.code;

      // The account joins the group as Sam on another device
      const sam = new Browser(env.env);
      await signIn(sam, 'sam@example.com');
      await sam.call('POST', `/groups/${code}/members`, { name: 'Sam', claim: true });

      // The same account, on the owner's device, tries to link the owner key
      await signIn(guest, 'sam@example.com');
      const res = await guest.call<ErrorBody>('POST', `/groups/${code}/link`);
      expect(res.status).toBe(409);
      expect(res.json.code).toBe('ACCOUNT_ALREADY_MEMBER');
      expect(await linkRows(code)).toEqual({ owner: null, member: null });
    });

    it('GS-4: a refused link changes neither groups.owner_user_id nor members.user_id', async () => {
      const guest = new Browser(env.env);
      const code = (await guest.call('POST', '/groups', { name: 'Party', ownerName: 'Alice' })).json.code;
      await signIn(guest, 'alice@example.com');
      await guest.call('POST', `/groups/${code}/link`);
      const before = await linkRows(code);
      expect(before?.owner).toBeTruthy();
      expect(before?.member).toBe(before?.owner);

      const intruder = new Browser(env.env);
      await signIn(intruder, 'intruder@example.com');
      const res = await intruder.call<ErrorBody>(
        'POST',
        `/groups/${code}/link`,
        {},
        { cookie: `tally_owner_${code}=${guest.getCookie(`tally_owner_${code}`)}` },
      );
      expect(res.status).toBe(403);
      expect(await linkRows(code)).toEqual(before);
    });

    it('a half-linked group (member linked to another account) is refused whole, leaving the group unlinked', async () => {
      const guest = new Browser(env.env);
      const code = (await guest.call('POST', '/groups', { name: 'Party', ownerName: 'Alice' })).json.code;
      await signIn(guest, 'alice@example.com');
      // Another account holds the owner member but the group itself is unlinked
      await env.env.DB.prepare(
        "INSERT INTO users (id, google_sub, email, name, created_at) VALUES ('u-other', 'sub-other', 'o@example.com', 'O', '2026-10-01T00:00:00Z')",
      ).run();
      await env.env.DB.prepare('UPDATE members SET user_id = ? WHERE group_code = ? AND is_owner = 1')
        .bind('u-other', code)
        .run();

      const res = await guest.call<ErrorBody>('POST', `/groups/${code}/link`);
      expect(res.status).toBe(409);
      expect(res.json.code).toBe('MEMBER_LINKED_ELSEWHERE');
      expect(await linkRows(code)).toEqual({ owner: null, member: 'u-other' });
    });

    it('linking an owner sets both the group and the owner member, and audits group.link with the owner member', async () => {
      const guest = new Browser(env.env);
      const code = (await guest.call('POST', '/groups', { name: 'Party', ownerName: 'Alice' })).json.code;
      await signIn(guest, 'alice@example.com');
      await guest.call('POST', `/groups/${code}/link`);

      const owner = await env.env.DB.prepare('SELECT id FROM members WHERE group_code = ? AND is_owner = 1')
        .bind(code)
        .first<{ id: string }>();
      const rows = await linkRows(code);
      expect(rows?.member).toBeTruthy();
      expect(rows?.owner).toBe(rows?.member);

      const audit = await env.env.DB.prepare('SELECT target FROM audit_log WHERE group_code = ? AND action = ?')
        .bind(code, 'group.link')
        .first<{ target: string | null }>();
      expect(audit?.target).toBe(owner?.id);
    });

    it('linking a member audits member.link with the member id', async () => {
      const owner = new Browser(env.env);
      const code = (await owner.call('POST', '/groups', { name: 'Trip', ownerName: 'Alice' })).json.code;
      const joiner = new Browser(env.env);
      const memberId = (await joiner.call('POST', `/groups/${code}/members`, { name: 'Bob', claim: true })).json.id;

      await signIn(joiner, 'bob@example.com');
      const res = await joiner.call<{ changed: boolean }>('POST', `/groups/${code}/link`);
      expect(res.status).toBe(200);
      expect(res.json.changed).toBe(true);

      const member = await env.env.DB.prepare('SELECT user_id FROM members WHERE id = ?')
        .bind(memberId)
        .first<{ user_id: string | null }>();
      expect(member?.user_id).toBeTruthy();
      const audit = await env.env.DB.prepare('SELECT target FROM audit_log WHERE group_code = ? AND action = ?')
        .bind(code, 'member.link')
        .first<{ target: string | null }>();
      expect(audit?.target).toBe(memberId);
    });

    it('canLinkAccount is true only when there is something to link', async () => {
      const guest = new Browser(env.env);
      const code = (await guest.call('POST', '/groups', { name: 'Trip', ownerName: 'Alice' })).json.code;
      const can = async (b: Browser, cookie?: string) =>
        (await b.call<GroupDto>('GET', `/groups/${code}`, undefined, cookie ? { cookie } : {})).json.canLinkAccount;

      // Not signed in: nothing to link with
      expect(await can(guest)).toBe(false);

      // Signed in with the owner key, group not linked yet
      await signIn(guest, 'alice@example.com');
      expect(await can(guest)).toBe(true);

      // After linking there is nothing left
      await guest.call('POST', `/groups/${code}/link`);
      expect(await can(guest)).toBe(false);

      // Another account holding a copy of the owner key: the group is taken, the button is not offered
      const intruder = new Browser(env.env);
      await signIn(intruder, 'intruder@example.com');
      expect(await can(intruder, `tally_owner_${code}=${guest.getCookie(`tally_owner_${code}`)}`)).toBe(false);

      // A member whose name is linked to another account is not offered it either
      const bob = new Browser(env.env);
      await signIn(bob, 'bob@example.com');
      await bob.call('POST', `/groups/${code}/members`, { name: 'Bob', claim: true });
      const carol = new Browser(env.env);
      await signIn(carol, 'carol@example.com');
      expect(await can(carol, `tally_member_${code}=${bob.getCookie(`tally_member_${code}`)}`)).toBe(false);

      // A member who joined as a guest can link their own name once signed in
      const dave = new Browser(env.env);
      await dave.call('POST', `/groups/${code}/members`, { name: 'Dave', claim: true });
      expect(await can(dave)).toBe(false);
      await signIn(dave, 'dave@example.com');
      expect(await can(dave)).toBe(true);
    }, 30_000);

    it('two simultaneous joins from one account end in one member and one 409, never a 500', async () => {
      const owner = new Browser(env.env);
      const code = (await owner.call('POST', '/groups', { name: 'Trip', ownerName: 'Alice' })).json.code;
      const first = new Browser(env.env);
      const second = new Browser(env.env);
      await signIn(first, 'sam@example.com');
      await signIn(second, 'sam@example.com');

      const results = await Promise.all([
        first.call<ErrorBody>('POST', `/groups/${code}/members`, { name: 'Sam', claim: true }),
        second.call<ErrorBody>('POST', `/groups/${code}/members`, { name: 'Sammy', claim: true }),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
      const refused = results.find((r) => r.status === 409)!;
      expect(refused.json.code).toBe('ACCOUNT_ALREADY_MEMBER');
    });
  });
});
