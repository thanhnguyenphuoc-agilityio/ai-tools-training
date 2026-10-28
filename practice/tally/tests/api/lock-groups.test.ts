import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { expiresAt, INACTIVE_MS } from '../../shared/rules';
import type { ErrorBody } from '../../shared/errors';
import type { CreateGroupResponse, GroupDto } from '../../shared/types';
import { purgeInactiveGroups } from '../../worker/cleanup';
import { Browser, createTestEnv, signIn } from './helpers';

describe('lock_groups API', () => {
  let env: Awaited<ReturnType<typeof createTestEnv>>;

  beforeEach(async () => {
    env = await createTestEnv();
  });

  afterEach(async () => {
    await env.dispose();
  });

  // Helper to create a group
  async function createGroup(browser: Browser, name = 'Weekend Trip', ownerName = 'Alex') {
    const res = await browser.call<CreateGroupResponse>('POST', '/groups', {
      name,
      ownerName,
      currency: 'USD',
      roundTo: 1,
    });
    expect(res.status).toBe(201);
    return res.json;
  }

  // LG-1: lock, then purgeInactiveGroups at last activity + 10 days + 1 minute and + 30 days keeps it; an unlocked group at the same time is deleted
  it('LG-1: locked group survives purges at 10 days + 1 minute and at 30 days', async () => {
    const owner = new Browser(env.env);
    await signIn(owner, 'owner@example.com');

    const g1 = await createGroup(owner, 'Kept Group');
    const g2 = await createGroup(owner, 'Unlocked Group');

    // Lock g1
    const lockRes = await owner.call<{ ok: true; changed: boolean }>('POST', `/groups/${g1.code}/lock`);
    expect(lockRes.status).toBe(200);
    expect(lockRes.json.changed).toBe(true);

    const now = new Date('2026-10-25T12:00:00.000Z');
    const nowMs = now.getTime();

    // Set last_activity_at to 10 days + 1 minute old
    const old10d = new Date(nowMs - INACTIVE_MS - 60_000).toISOString();
    await env.env.DB.prepare('UPDATE groups SET last_activity_at = ? WHERE code IN (?, ?)')
      .bind(old10d, g1.code, g2.code)
      .run();

    let purged = await purgeInactiveGroups(env.env.DB, now);
    expect(purged).toBe(1);

    // g1 still exists, g2 deleted
    let remaining = await env.env.DB.prepare('SELECT code FROM groups').all<{ code: string }>();
    let codes = remaining.results.map((r) => r.code);
    expect(codes).toContain(g1.code);
    expect(codes).not.toContain(g2.code);

    // Set g1 to 30 days old and run purge again with new now
    const now30 = new Date('2026-11-15T12:00:00.000Z');
    const old30d = new Date(now30.getTime() - 30 * 24 * 3600_000).toISOString();
    await env.env.DB.prepare('UPDATE groups SET last_activity_at = ? WHERE code = ?')
      .bind(old30d, g1.code)
      .run();

    purged = await purgeInactiveGroups(env.env.DB, now30);
    expect(purged).toBe(0);

    remaining = await env.env.DB.prepare('SELECT code FROM groups').all<{ code: string }>();
    codes = remaining.results.map((r) => r.code);
    expect(codes).toContain(g1.code);
  }, 30_000);

  // LG-2: lock 10 groups of one account, 11th gives 409 LOCK_LIMIT_REACHED with params.max === 10, unlock one, lock succeeds
  it('LG-2: limits account to 10 locked groups, unlocking allows another', async () => {
    const owner = new Browser(env.env);
    await signIn(owner, 'collector@example.com');

    const codes: string[] = [];
    for (let i = 1; i <= 10; i++) {
      const g = await createGroup(owner, `Group ${i}`);
      codes.push(g.code);
      const res = await owner.call<{ ok: true; changed: boolean }>('POST', `/groups/${g.code}/lock`);
      expect(res.status).toBe(200);
      expect(res.json.changed).toBe(true);
    }

    // 11th group
    const g11 = await createGroup(owner, 'Group 11');
    const res11 = await owner.call<ErrorBody>('POST', `/groups/${g11.code}/lock`);
    expect(res11.status).toBe(409);
    expect(res11.json.code).toBe('LOCK_LIMIT_REACHED');
    expect(res11.json.params?.max).toBe(10);

    // Unlock group 1
    const unlockRes = await owner.call<{ ok: true; changed: boolean }>('DELETE', `/groups/${codes[0]}/lock`);
    expect(unlockRes.status).toBe(200);
    expect(unlockRes.json.changed).toBe(true);

    // Now locking 11th group succeeds
    const retry11 = await owner.call<{ ok: true; changed: boolean }>('POST', `/groups/${g11.code}/lock`);
    expect(retry11.status).toBe(200);
    expect(retry11.json.changed).toBe(true);
  }, 30_000);

  // LG-3: owner key without session: 401 SIGN_IN_REQUIRED
  it('LG-3: lock without an account session returns 401 SIGN_IN_REQUIRED', async () => {
    const owner = new Browser(env.env);
    const g = await createGroup(owner);

    const lockRes = await owner.call<ErrorBody>('POST', `/groups/${g.code}/lock`);
    expect(lockRes.status).toBe(401);
    expect(lockRes.json.code).toBe('SIGN_IN_REQUIRED');

    const unlockRes = await owner.call<ErrorBody>('DELETE', `/groups/${g.code}/lock`);
    expect(unlockRes.status).toBe(401);
    expect(unlockRes.json.code).toBe('SIGN_IN_REQUIRED');
  });

  // LG-4: group owned by account A, owner key used by signed-in B: 403 GROUP_OWNED_BY_OTHER_ACCOUNT
  it('LG-4: lock a group owned by another account returns 403 GROUP_OWNED_BY_OTHER_ACCOUNT', async () => {
    const ownerA = new Browser(env.env);
    await signIn(ownerA, 'a@example.com');
    const g = await createGroup(ownerA);

    // Browser B signs in as B, but claims owner with ownerKey of group A
    const browserB = new Browser(env.env);
    await signIn(browserB, 'b@example.com');
    const claimRes = await browserB.call('POST', `/groups/${g.code}/owner/claim`, { ownerKey: g.ownerKey });
    expect(claimRes.status).toBe(200);

    // Try to lock as B
    const lockRes = await browserB.call<ErrorBody>('POST', `/groups/${g.code}/lock`);
    expect(lockRes.status).toBe(403);
    expect(lockRes.json.code).toBe('GROUP_OWNED_BY_OTHER_ACCOUNT');

    // Try to unlock as B
    const unlockRes = await browserB.call<ErrorBody>('DELETE', `/groups/${g.code}/lock`);
    expect(unlockRes.status).toBe(403);
    expect(unlockRes.json.code).toBe('GROUP_OWNED_BY_OTHER_ACCOUNT');
  });

  // LG-5: unlock at a known time: expiresAt = unlock + 10 days, last_activity_at updated
  it('LG-5: unlock updates last_activity_at and sets expiresAt to unlock + 10 days', async () => {
    const owner = new Browser(env.env);
    await signIn(owner, 'owner@example.com');
    const g = await createGroup(owner);

    // Lock group
    await owner.call('POST', `/groups/${g.code}/lock`);

    // Old activity
    const oldTime = '2026-10-01T00:00:00.000Z';
    await env.env.DB.prepare('UPDATE groups SET last_activity_at = ? WHERE code = ?')
      .bind(oldTime, g.code)
      .run();

    // Unlock
    const unlockRes = await owner.call<{ ok: true; changed: boolean }>('DELETE', `/groups/${g.code}/lock`);
    expect(unlockRes.status).toBe(200);
    expect(unlockRes.json.changed).toBe(true);

    const getRes = await owner.call<GroupDto>('GET', `/groups/${g.code}`);
    expect(getRes.status).toBe(200);
    expect(getRes.json.locked).toBe(false);
    expect(getRes.json.lastActivityAt > oldTime).toBe(true);
    expect(getRes.json.expiresAt).toBe(expiresAt(getRes.json.lastActivityAt));
  });

  // LG-8: lock twice, unlock twice: changed false on repeats, audit has exactly one group.lock and one group.unlock
  it('LG-8: repeat lock/unlock returns changed: false and writes exactly one audit row each', async () => {
    const owner = new Browser(env.env);
    await signIn(owner, 'owner@example.com');
    const g = await createGroup(owner);

    // Lock 1
    const l1 = await owner.call<{ ok: true; changed: boolean }>('POST', `/groups/${g.code}/lock`);
    expect(l1.json.changed).toBe(true);

    // Lock 2
    const l2 = await owner.call<{ ok: true; changed: boolean }>('POST', `/groups/${g.code}/lock`);
    expect(l2.json.changed).toBe(false);

    // Unlock 1
    const u1 = await owner.call<{ ok: true; changed: boolean }>('DELETE', `/groups/${g.code}/lock`);
    expect(u1.json.changed).toBe(true);

    // Unlock 2
    const u2 = await owner.call<{ ok: true; changed: boolean }>('DELETE', `/groups/${g.code}/lock`);
    expect(u2.json.changed).toBe(false);

    // Check audit log
    const locks = await env.env.DB.prepare(
      "SELECT COUNT(*) as count FROM audit_log WHERE group_code = ? AND action = 'group.lock'",
    )
      .bind(g.code)
      .first<{ count: number }>();
    expect(locks!.count).toBe(1);

    const unlocks = await env.env.DB.prepare(
      "SELECT COUNT(*) as count FROM audit_log WHERE group_code = ? AND action = 'group.unlock'",
    )
      .bind(g.code)
      .first<{ count: number }>();
    expect(unlocks!.count).toBe(1);
  });

  // LG-9: locked group accepts an expense; DTO locked: true, expiresAt: null
  it('LG-9: locked group accepts an expense; DTO locked: true, expiresAt: null', async () => {
    const owner = new Browser(env.env);
    await signIn(owner, 'owner@example.com');
    const g = await createGroup(owner);

    await owner.call('POST', `/groups/${g.code}/lock`);

    const gBefore = await owner.call<GroupDto>('GET', `/groups/${g.code}`);
    expect(gBefore.json.locked).toBe(true);
    expect(gBefore.json.expiresAt).toBeNull();

    const alexId = gBefore.json.members[0].id;
    const expRes = await owner.call('POST', `/groups/${g.code}/expenses`, {
      payerId: alexId,
      amount: 50_000,
      description: 'Groceries',
      spentOn: '2026-10-02',
      splitMode: 'equal',
      participants: [{ memberId: alexId, weight: 1 }],
    });
    expect(expRes.status).toBe(201);

    const gAfter = await owner.call<GroupDto>('GET', `/groups/${g.code}`);
    expect(gAfter.json.locked).toBe(true);
    expect(gAfter.json.expiresAt).toBeNull();
    expect(gAfter.json.expenses).toHaveLength(1);
  });

  // LG-10: lock on a group without account links group and owner member
  it('LG-10: locking unlinked group links group and owner member to account', async () => {
    const owner = new Browser(env.env);
    // Create group anonymously
    const g = await createGroup(owner);

    // Check initially unlinked
    const initial = await owner.call<GroupDto>('GET', `/groups/${g.code}`);
    expect(initial.json.canLinkAccount).toBe(false); // not signed in

    // Now sign in on this owner device
    const { user } = await signIn(owner, 'newowner@example.com');

    const signedInDto = await owner.call<GroupDto>('GET', `/groups/${g.code}`);
    expect(signedInDto.json.canLinkAccount).toBe(true);

    // Lock the group
    const lockRes = await owner.call<{ ok: true; changed: boolean }>('POST', `/groups/${g.code}/lock`);
    expect(lockRes.status).toBe(200);
    expect(lockRes.json.changed).toBe(true);

    // Verify database links
    const groupRow = await env.env.DB.prepare('SELECT owner_user_id, locked_at FROM groups WHERE code = ?')
      .bind(g.code)
      .first<{ owner_user_id: string | null; locked_at: string | null }>();
    expect(groupRow?.owner_user_id).toBe(user.id);
    expect(groupRow?.locked_at).not.toBeNull();

    const ownerMember = await env.env.DB.prepare('SELECT user_id FROM members WHERE group_code = ? AND is_owner = 1')
      .bind(g.code)
      .first<{ user_id: string | null }>();
    expect(ownerMember?.user_id).toBe(user.id);

    // DTO reflects linked and locked state
    const afterLock = await owner.call<GroupDto>('GET', `/groups/${g.code}`);
    expect(afterLock.json.canLinkAccount).toBe(false);
    expect(afterLock.json.locked).toBe(true);

    // Audit log has group.link then group.lock
    const auditRows = await env.env.DB.prepare(
      "SELECT action FROM audit_log WHERE group_code = ? AND action IN ('group.link', 'group.lock') ORDER BY id",
    )
      .bind(g.code)
      .all<{ action: string }>();
    expect(auditRows.results.map((r) => r.action)).toEqual(['group.link', 'group.lock']);
  });

  // A link made before the limit check stays when the lock is refused (plan step 4).
  it('LG-12: a lock refused at the limit still links an unlinked group', async () => {
    const owner = new Browser(env.env);
    await signIn(owner, 'full@example.com');

    for (let i = 1; i <= 10; i++) {
      const kept = await createGroup(owner, `Kept ${i}`);
      const res = await owner.call<{ ok: true; changed: boolean }>('POST', `/groups/${kept.code}/lock`);
      expect(res.status).toBe(200);
    }

    const extra = new Browser(env.env);
    const unlinked = await createGroup(extra, 'Unlinked');
    const { user } = await signIn(extra, 'full@example.com');

    const refused = await extra.call<ErrorBody>('POST', `/groups/${unlinked.code}/lock`);
    expect(refused.status).toBe(409);
    expect(refused.json.code).toBe('LOCK_LIMIT_REACHED');

    const groupRow = await env.env.DB.prepare('SELECT owner_user_id, locked_at FROM groups WHERE code = ?')
      .bind(unlinked.code)
      .first<{ owner_user_id: string | null; locked_at: string | null }>();
    expect(groupRow?.owner_user_id).toBe(user.id);
    expect(groupRow?.locked_at).toBeNull();

    const ownerMember = await env.env.DB.prepare('SELECT user_id FROM members WHERE group_code = ? AND is_owner = 1')
      .bind(unlinked.code)
      .first<{ user_id: string | null }>();
    expect(ownerMember?.user_id).toBe(user.id);

    const links = await env.env.DB.prepare(
      "SELECT COUNT(*) as count FROM audit_log WHERE group_code = ? AND action = 'group.link'",
    )
      .bind(unlinked.code)
      .first<{ count: number }>();
    expect(links!.count).toBe(1);

    const after = await extra.call<GroupDto>('GET', `/groups/${unlinked.code}`);
    expect(after.json.canLinkAccount).toBe(false);
    expect(after.json.locked).toBe(false);
  }, 30_000);

  // LG-11: check order: guest signed out and member signed in both get 403 OWNER_ONLY; ACCOUNT_ALREADY_MEMBER
  it('LG-11: non-owner gets 403 OWNER_ONLY; account already a member gets 409 ACCOUNT_ALREADY_MEMBER', async () => {
    const owner = new Browser(env.env);
    const g = await createGroup(owner);

    // Guest signed out gets 403 OWNER_ONLY
    const guest = new Browser(env.env);
    const guestLock = await guest.call<ErrorBody>('POST', `/groups/${g.code}/lock`);
    expect(guestLock.status).toBe(403);
    expect(guestLock.json.code).toBe('OWNER_ONLY');

    // Member signed in gets 403 OWNER_ONLY
    const member = new Browser(env.env);
    await signIn(member, 'member@example.com');
    await member.call('POST', `/groups/${g.code}/members`, { name: 'Sam', claim: true });
    const memberLock = await member.call<ErrorBody>('POST', `/groups/${g.code}/lock`);
    expect(memberLock.status).toBe(403);
    expect(memberLock.json.code).toBe('OWNER_ONLY');

    // Group created anonymously; user C has already joined as a regular member Sam.
    // Now anonymous owner signs in as user C and tries to lock -> ACCOUNT_ALREADY_MEMBER
    const ownerKeyBrowser = new Browser(env.env);
    const anonGroup = await createGroup(ownerKeyBrowser);

    // Member joins while signed in as user C
    const userCBrowser = new Browser(env.env);
    await signIn(userCBrowser, 'userc@example.com');
    await userCBrowser.call('POST', `/groups/${anonGroup.code}/members`, { name: 'Charlie', claim: true });

    // Now ownerKeyBrowser signs in as user C
    await signIn(ownerKeyBrowser, 'userc@example.com');
    const conflictLock = await ownerKeyBrowser.call<ErrorBody>('POST', `/groups/${anonGroup.code}/lock`);
    expect(conflictLock.status).toBe(409);
    expect(conflictLock.json.code).toBe('ACCOUNT_ALREADY_MEMBER');
  });
});
