import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { INACTIVE_MS } from '../../shared/rules';
import type { ErrorBody } from '../../shared/errors';
import type { GroupDto, MeResponse } from '../../shared/types';
import { purgeInactiveGroups } from '../../worker/cleanup';
import { Browser, createTestEnv, signIn } from './helpers';

let env: Awaited<ReturnType<typeof createTestEnv>>;

beforeEach(async () => {
  env = await createTestEnv();
});

afterEach(async () => {
  vi.useRealTimers();
  await env.dispose();
});

describe('delete account API', () => {
  // DA-1: Delete: users row gone, all sessions gone, cookie cleared, GET /api/me returns user: null
  it('DA-1: delete removes user row, all sessions, clears cookie, GET /me returns null', async () => {
    const b = new Browser(env.env);
    const { user } = await signIn(b, 'alex@example.com');

    // Confirm user and session exist
    const userBefore = await env.env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(user.id).first();
    expect(userBefore).not.toBeNull();
    const sessionsBefore = await env.env.DB.prepare('SELECT COUNT(*) as count FROM sessions WHERE user_id = ?')
      .bind(user.id)
      .first<{ count: number }>();
    expect(sessionsBefore?.count).toBe(1);

    // Delete account
    const res = await b.call<{ ok: true }>('DELETE', '/me');
    expect(res.status).toBe(200);
    expect(res.json.ok).toBe(true);

    // Cookie is cleared in browser
    expect(b.getCookie('tally_session')).toBeUndefined();

    // User row is gone
    const userAfter = await env.env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(user.id).first();
    expect(userAfter).toBeNull();

    // Sessions are gone
    const sessionsAfter = await env.env.DB.prepare('SELECT COUNT(*) as count FROM sessions WHERE user_id = ?')
      .bind(user.id)
      .first<{ count: number }>();
    expect(sessionsAfter?.count).toBe(0);

    // GET /me returns user: null
    const meRes = await b.call<MeResponse>('GET', '/me');
    expect(meRes.status).toBe(200);
    expect(meRes.json.user).toBeNull();
  });

  // DA-2: Second session of the same account no longer resolves after the deletion
  it('DA-2: second session of the same account no longer resolves after deletion', async () => {
    const b1 = new Browser(env.env);
    const b2 = new Browser(env.env);

    await signIn(b1, 'alex@example.com');
    await signIn(b2, 'alex@example.com');

    // Confirm both have valid sessions
    const me1 = await b1.call<MeResponse>('GET', '/me');
    const me2 = await b2.call<MeResponse>('GET', '/me');
    expect(me1.json.user).not.toBeNull();
    expect(me2.json.user).not.toBeNull();

    // b1 deletes account
    const delRes = await b1.call('DELETE', '/me');
    expect(delRes.status).toBe(200);

    // b2 can no longer resolve
    const me2After = await b2.call<MeResponse>('GET', '/me');
    expect(me2After.status).toBe(200);
    expect(me2After.json.user).toBeNull();
  });

  // DA-3: Member using saved details: bankSource: null; member with group details keeps them
  it('DA-3: saved bank details cleared on members, group details stay', async () => {
    const sam = new Browser(env.env);
    const g1Res = await sam.call<{ code: string }>('POST', '/groups', { name: 'Trip 1', ownerName: 'Sam' });
    const g2Res = await sam.call<{ code: string }>('POST', '/groups', { name: 'Trip 2', ownerName: 'Sam' });
    const code1 = g1Res.json.code;
    const code2 = g2Res.json.code;

    const alex = new Browser(env.env);
    await signIn(alex, 'alex@example.com');
    await alex.call('PATCH', '/me', {
      bankBin: '970415',
      accountNo: '0123456789',
      accountName: 'ALEX',
    });

    // Alex joins g1 using saved details
    const m1Res = await alex.call<{ id: string }>('POST', `/groups/${code1}/members`, { name: 'Alex', claim: true });
    const m1Id = m1Res.json.id;

    // Alex joins g2 and overrides with group bank details
    const m2Res = await alex.call<{ id: string }>('POST', `/groups/${code2}/members`, { name: 'Alex', claim: true });
    const m2Id = m2Res.json.id;
    await alex.call('PATCH', `/groups/${code2}/members/${m2Id}`, {
      bankBin: '970422',
      accountNo: '9876543210',
      accountName: 'ALEX GRP',
    });

    // Check before deletion
    const g1Before = await sam.call<GroupDto>('GET', `/groups/${code1}`);
    const m1Before = g1Before.json.members.find((m) => m.id === m1Id);
    expect(m1Before?.bankSource).toBe('account');
    expect(m1Before?.accountNo).toBe('0123456789');

    const g2Before = await sam.call<GroupDto>('GET', `/groups/${code2}`);
    const m2Before = g2Before.json.members.find((m) => m.id === m2Id);
    expect(m2Before?.bankSource).toBe('group');
    expect(m2Before?.accountNo).toBe('9876543210');

    // Alex deletes account
    const delRes = await alex.call('DELETE', '/me');
    expect(delRes.status).toBe(200);

    // After deletion: g1 member has no bank details, bankSource is null
    const g1After = await sam.call<GroupDto>('GET', `/groups/${code1}`);
    const m1After = g1After.json.members.find((m) => m.id === m1Id);
    expect(m1After?.bankSource).toBeNull();
    expect(m1After?.bankBin).toBeNull();
    expect(m1After?.accountNo).toBeNull();
    expect(m1After?.accountName).toBeNull();

    // After deletion: g2 member keeps group details
    const g2After = await sam.call<GroupDto>('GET', `/groups/${code2}`);
    const m2After = g2After.json.members.find((m) => m.id === m2Id);
    expect(m2After?.bankSource).toBe('group');
    expect(m2After?.bankBin).toBe('970422');
    expect(m2After?.accountNo).toBe('9876543210');
    expect(m2After?.accountName).toBe('ALEX GRP');
  }, 30_000);

  // DA-4: Owned group: owner_user_id NULL, owner key still passes owner checks; linked members have user_id NULL
  it('DA-4: owned group has owner_user_id cleared, owner key works, linked members detached', async () => {
    const alex = new Browser(env.env);
    await signIn(alex, 'alex@example.com');
    const gRes = await alex.call<{ code: string; ownerKey: string }>('POST', '/groups', {
      name: 'Weekend',
      ownerName: 'Alex',
    });
    const { code } = gRes.json;

    // Check before deletion
    const rowBefore = await env.env.DB.prepare('SELECT owner_user_id FROM groups WHERE code = ?')
      .bind(code)
      .first<{ owner_user_id: string }>();
    expect(rowBefore?.owner_user_id).not.toBeNull();

    const memberBefore = await env.env.DB.prepare('SELECT user_id FROM members WHERE group_code = ? AND is_owner = 1')
      .bind(code)
      .first<{ user_id: string }>();
    expect(memberBefore?.user_id).not.toBeNull();

    // Delete account
    const delRes = await alex.call('DELETE', '/me');
    expect(delRes.status).toBe(200);

    // owner_user_id is NULL
    const rowAfter = await env.env.DB.prepare('SELECT owner_user_id FROM groups WHERE code = ?')
      .bind(code)
      .first<{ owner_user_id: string | null }>();
    expect(rowAfter?.owner_user_id).toBeNull();

    // member user_id is NULL
    const memberAfter = await env.env.DB.prepare('SELECT user_id FROM members WHERE group_code = ? AND is_owner = 1')
      .bind(code)
      .first<{ user_id: string | null }>();
    expect(memberAfter?.user_id).toBeNull();

    // Owner key still passes owner checks
    const updateRes = await alex.call('PATCH', `/groups/${code}`, { name: 'Updated Weekend' });
    expect(updateRes.status).toBe(200);
  });

  // DA-5: Kept group: locked: false, expiresAt = deletion + 10 days, audit group.unlock; purge at deletion + 10 days + 1 minute deletes it
  it('DA-5: kept group unlocks on deletion, expires in 10 days, purged afterwards', async () => {
    const deletionTime = new Date('2026-10-15T12:00:00.000Z');
    vi.useFakeTimers();
    vi.setSystemTime(deletionTime);

    const alex = new Browser(env.env);
    await signIn(alex, 'alex@example.com');
    const gRes = await alex.call<{ code: string }>('POST', '/groups', { name: 'Kept Group', ownerName: 'Alex' });
    const { code } = gRes.json;

    // Lock group
    await alex.call('POST', `/groups/${code}/lock`);
    const gLocked = await alex.call<GroupDto>('GET', `/groups/${code}`);
    expect(gLocked.json.locked).toBe(true);
    expect(gLocked.json.expiresAt).toBeNull();

    // Delete account at deletionTime
    const delRes = await alex.call('DELETE', '/me');
    expect(delRes.status).toBe(200);

    // Check group status
    const guest = new Browser(env.env);
    const gAfter = await guest.call<GroupDto>('GET', `/groups/${code}`);
    expect(gAfter.json.locked).toBe(false);
    const expectedExpiry = new Date(deletionTime.getTime() + INACTIVE_MS).toISOString();
    expect(gAfter.json.expiresAt).toBe(expectedExpiry);

    // Check audit log
    const auditRow = await env.env.DB.prepare(
      "SELECT * FROM audit_log WHERE group_code = ? AND action = 'group.unlock'",
    )
      .bind(code)
      .first<{ actor: string; action: string; details: string; at: string }>();
    expect(auditRow).not.toBeNull();
    expect(auditRow?.actor).toBe('owner');
    expect(JSON.parse(auditRow!.details)).toEqual({ reason: 'account.delete' });
    expect(auditRow?.at).toBe(deletionTime.toISOString());

    // Purge at deletion + 10 days + 1 minute deletes it
    const purgeTime = new Date(deletionTime.getTime() + INACTIVE_MS + 60_000);
    const purged = await purgeInactiveGroups(env.env.DB, purgeTime);
    expect(purged).toBe(1);

    const gPurged = await env.env.DB.prepare('SELECT code FROM groups WHERE code = ?').bind(code).first();
    expect(gPurged).toBeNull();
  });

  // DA-6: Non-kept groups: last_activity_at unchanged, no audit rows
  it('DA-6: non-kept groups have last_activity_at unchanged and no audit rows', async () => {
    const initialTime = new Date('2026-10-10T10:00:00.000Z');
    vi.useFakeTimers();
    vi.setSystemTime(initialTime);

    const alex = new Browser(env.env);
    await signIn(alex, 'alex@example.com');
    const gRes = await alex.call<{ code: string }>('POST', '/groups', { name: 'Non-kept Group', ownerName: 'Alex' });
    const { code } = gRes.json;

    const gBefore = await env.env.DB.prepare('SELECT last_activity_at FROM groups WHERE code = ?')
      .bind(code)
      .first<{ last_activity_at: string }>();
    const originalActivity = gBefore!.last_activity_at;

    // Advance time to deletion
    const deletionTime = new Date('2026-10-12T15:00:00.000Z');
    vi.setSystemTime(deletionTime);

    const delRes = await alex.call('DELETE', '/me');
    expect(delRes.status).toBe(200);

    const gAfter = await env.env.DB.prepare('SELECT last_activity_at FROM groups WHERE code = ?')
      .bind(code)
      .first<{ last_activity_at: string }>();
    expect(gAfter!.last_activity_at).toBe(originalActivity);

    const auditCount = await env.env.DB.prepare('SELECT COUNT(*) as count FROM audit_log WHERE group_code = ?')
      .bind(code)
      .first<{ count: number }>();
    expect(auditCount?.count).toBe(0);
  });

  // DA-7: DELETE /api/me without a session: 401 SIGN_IN_REQUIRED
  it('DA-7: DELETE /me without session returns 401 SIGN_IN_REQUIRED', async () => {
    const b = new Browser(env.env);
    const res = await b.call<ErrorBody>('DELETE', '/me');
    expect(res.status).toBe(401);
    expect(res.json.code).toBe('SIGN_IN_REQUIRED');
  });

  // DA-8: Sign in again with the same email (dev): new account id, no saved details, no linked groups
  it('DA-8: sign in again creates a fresh account without old details or linked groups', async () => {
    const alex = new Browser(env.env);
    const { user: user1 } = await signIn(alex, 'alex@example.com');
    await alex.call('PATCH', '/me', {
      bankBin: '970415',
      accountNo: '0123456789',
      accountName: 'ALEX',
    });
    const gRes = await alex.call<{ code: string }>('POST', '/groups', { name: 'Alex Trip', ownerName: 'Alex' });
    const code = gRes.json.code;

    // Delete account
    await alex.call('DELETE', '/me');

    // Sign in again with same email on the same device (holding owner key)
    const { user: user2 } = await signIn(alex, 'alex@example.com');

    // New user ID
    expect(user2.id).not.toBe(user1.id);

    // No saved bank details
    expect(user2.bankBin).toBeNull();
    expect(user2.accountNo).toBeNull();
    expect(user2.accountName).toBeNull();

    // Group is not linked to new user automatically, but can be linked because device holds owner key
    const g = await alex.call<GroupDto>('GET', `/groups/${code}`);
    expect(g.json.me.accountLinked).toBe(false);
    expect(g.json.canLinkAccount).toBe(true);
  });
});
