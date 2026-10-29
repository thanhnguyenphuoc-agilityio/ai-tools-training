import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { expiresAt, INACTIVE_MS } from '../../shared/rules';
import type { GroupDto } from '../../shared/types';
import { purgeInactiveGroups, runDailyJobs } from '../../worker/cleanup';
import { Browser, createTestEnv } from './helpers';

describe('purge_inactive_groups API', () => {
  let testEnv: Awaited<ReturnType<typeof createTestEnv>>;
  let owner: Browser;
  let code: string;
  let ownerKey: string;

  beforeEach(async () => {
    testEnv = await createTestEnv();
    owner = new Browser(testEnv.env);
    const res = await owner.call<{ code: string; ownerKey: string }>('POST', '/groups', {
      name: 'Weekend trip',
      ownerName: 'Alex',
      roundTo: 1000,
    });
    expect(res.status).toBe(201);
    ({ code, ownerKey } = res.json);
  });

  afterEach(async () => {
    await testEnv.dispose();
  });

  const getGroup = (b: Browser) => b.call<GroupDto>('GET', `/groups/${code}`).then((r) => r.json);

  const setGroupActivity = async (targetCode: string, iso: string) => {
    await testEnv.env.DB.prepare('UPDATE groups SET last_activity_at = ? WHERE code = ?').bind(iso, targetCode).run();
  };

  const getStoredActivity = async (targetCode: string): Promise<string> => {
    const row = await testEnv.env.DB.prepare('SELECT last_activity_at FROM groups WHERE code = ?')
      .bind(targetCode)
      .first<{ last_activity_at: string }>();
    return row!.last_activity_at;
  };

  // PG-1: set last_activity_at through env.DB relative to a fixed now. Exactly 10 days: kept. 10 days + 1 minute: deleted. 9 days 23 hours: kept. Assert the return count.
  it('PG-1: purge boundaries (strictly older than 10 days deleted, 10 days exact kept)', async () => {
    const now = new Date('2026-10-20T12:00:00.000Z');
    const nowMs = now.getTime();

    // Group 1: exactly 10 days old -> kept
    await setGroupActivity(code, new Date(nowMs - INACTIVE_MS).toISOString());

    // Group 2: 10 days + 1 minute old -> deleted
    const code2 = 'old1-old2-old3';
    await testEnv.env.DB.prepare(
      'INSERT INTO groups (code, name, currency, round_to, owner_key_hash, last_activity_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    )
      .bind(
        code2,
        'Old group',
        'USD',
        1,
        'hash',
        new Date(nowMs - INACTIVE_MS - 60_000).toISOString(),
        '2026-01-01T00:00:00.000Z',
      )
      .run();

    // Group 3: 9 days 23 hours old -> kept
    const code3 = 'rec1-rec2-rec3';
    await testEnv.env.DB.prepare(
      'INSERT INTO groups (code, name, currency, round_to, owner_key_hash, last_activity_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    )
      .bind(
        code3,
        'Recent group',
        'USD',
        1,
        'hash',
        new Date(nowMs - INACTIVE_MS + 3600_000).toISOString(),
        '2026-01-01T00:00:00.000Z',
      )
      .run();

    // The deleted group has child rows: the count is groups, not cascaded rows.
    await testEnv.env.DB.batch([
      testEnv.env.DB.prepare(
        'INSERT INTO members (id, group_code, name, is_owner, created_at) VALUES (?, ?, ?, ?, ?)',
      ).bind('old-m1', code2, 'Alex', 1, '2026-01-01T00:00:00.000Z'),
      testEnv.env.DB.prepare(
        'INSERT INTO members (id, group_code, name, is_owner, created_at) VALUES (?, ?, ?, ?, ?)',
      ).bind('old-m2', code2, 'Sam', 0, '2026-01-01T00:00:00.000Z'),
      testEnv.env.DB.prepare(
        'INSERT INTO audit_log (group_code, actor, action, target, at) VALUES (?, ?, ?, ?, ?)',
      ).bind(code2, 'owner', 'group.create', null, '2026-01-01T00:00:00.000Z'),
    ]);

    const purgedCount = await purgeInactiveGroups(testEnv.env.DB, now);
    expect(purgedCount).toBe(1);

    const remaining = await testEnv.env.DB.prepare('SELECT code FROM groups ORDER BY code').all<{ code: string }>();
    const remainingCodes = remaining.results.map((r) => r.code);
    expect(remainingCodes).toContain(code);
    expect(remainingCodes).toContain(code3);
    expect(remainingCodes).not.toContain(code2);
  });

  // PG-2: child rows (members, expenses, shares, transfers, audit) gone after the purge
  it('PG-2: cascades deletion to all child rows', async () => {
    // Add a second member
    const guest = new Browser(testEnv.env);
    const joinRes = await guest.call<{ id: string }>('POST', `/groups/${code}/members`, { name: 'Sam', claim: true });
    const samId = joinRes.json.id;

    const group = await getGroup(owner);
    const alexId = group.members.find((m) => m.name === 'Alex')!.id;

    // Add an expense with shares
    const expRes = await owner.call<{ id: string }>('POST', `/groups/${code}/expenses`, {
      payerId: alexId,
      amount: 50_000,
      description: 'Dinner',
      spentOn: '2026-10-01',
      splitMode: 'equal',
      participants: [
        { memberId: alexId, weight: 1 },
        { memberId: samId, weight: 1 },
      ],
    });
    const expId = expRes.json.id;

    // Add an exact split expense
    await owner.call<{ id: string }>('POST', `/groups/${code}/expenses`, {
      payerId: alexId,
      amount: 30_000,
      description: 'Coffee',
      spentOn: '2026-10-01',
      splitMode: 'exact',
      participants: [
        { memberId: alexId, amount: 10_000 },
        { memberId: samId, amount: 20_000 },
      ],
    });

    // Add a transfer
    await guest.call<{ id: string }>('POST', `/groups/${code}/transfers`, {
      toId: alexId,
      amount: 25_000,
    });

    // Create a second active group that should NOT be purged
    const otherOwner = new Browser(testEnv.env);
    const otherRes = await otherOwner.call<{ code: string }>('POST', `/groups`, {
      name: 'Active group',
      ownerName: 'Taylor',
    });
    const otherCode = otherRes.json.code;

    // Make target group 11 days old
    const now = new Date('2026-10-25T12:00:00.000Z');
    await setGroupActivity(code, new Date(now.getTime() - 11 * 24 * 60 * 60 * 1000).toISOString());

    const purged = await purgeInactiveGroups(testEnv.env.DB, now);
    expect(purged).toBe(1);

    // Assert all tables have 0 rows for code
    const membersCount = await testEnv.env.DB.prepare('SELECT COUNT(*) as count FROM members WHERE group_code = ?')
      .bind(code)
      .first<{ count: number }>();
    expect(membersCount!.count).toBe(0);

    const expensesCount = await testEnv.env.DB.prepare('SELECT COUNT(*) as count FROM expenses WHERE group_code = ?')
      .bind(code)
      .first<{ count: number }>();
    expect(expensesCount!.count).toBe(0);

    const sharesCount = await testEnv.env.DB.prepare(
      'SELECT COUNT(*) as count FROM expense_shares WHERE expense_id = ?',
    )
      .bind(expId)
      .first<{ count: number }>();
    expect(sharesCount!.count).toBe(0);

    const transfersCount = await testEnv.env.DB.prepare('SELECT COUNT(*) as count FROM transfers WHERE group_code = ?')
      .bind(code)
      .first<{ count: number }>();
    expect(transfersCount!.count).toBe(0);

    const auditCount = await testEnv.env.DB.prepare('SELECT COUNT(*) as count FROM audit_log WHERE group_code = ?')
      .bind(code)
      .first<{ count: number }>();
    expect(auditCount!.count).toBe(0);

    // Other group is untouched
    const otherGroup = await testEnv.env.DB.prepare('SELECT code FROM groups WHERE code = ?')
      .bind(otherCode)
      .first<{ code: string }>();
    expect(otherGroup?.code).toBe(otherCode);
  });

  // PG-3: set last_activity_at to an old value, then GET as a member and as a guest. The value is unchanged.
  it('PG-3: viewing as member and as guest does not change last_activity_at', async () => {
    const oldTime = '2026-10-01T10:00:00.000Z';
    await setGroupActivity(code, oldTime);

    // GET as member (owner)
    const g1 = await getGroup(owner);
    expect(g1.lastActivityAt).toBe(oldTime);
    expect(await getStoredActivity(code)).toBe(oldTime);

    // GET as guest
    const guest = new Browser(testEnv.env);
    const g2 = await getGroup(guest);
    expect(g2.lastActivityAt).toBe(oldTime);
    expect(await getStoredActivity(code)).toBe(oldTime);
  });

  // PG-4: Each change in answer 2 (round 2) moves last_activity_at; recovery link, unchanged settings do not
  it('PG-4: each change moves last_activity_at; recovery link and unchanged settings do not', async () => {
    const oldTime = '2026-10-01T00:00:00.000Z';

    const expectActivityMoved = async (action: () => Promise<{ status?: number; json?: unknown } | void>) => {
      await setGroupActivity(code, oldTime);
      const res = await action();
      if (res && typeof res.status === 'number' && res.status >= 400) {
        throw new Error(`Action failed with status ${res.status}: ${JSON.stringify(res.json)}`);
      }
      const after = await getStoredActivity(code);
      if (!(after > oldTime)) {
        throw new Error(`Expected after (${after}) > oldTime (${oldTime}) but it was not. Res: ${JSON.stringify(res)}`);
      }
      expect(after > oldTime).toBe(true);
    };

    const expectActivityNotMoved = async (action: () => Promise<unknown>) => {
      await setGroupActivity(code, oldTime);
      await action();
      const after = await getStoredActivity(code);
      expect(after).toBe(oldTime);
    };

    const group = await getGroup(owner);
    const alexId = group.members[0].id;

    // 1. Join (claim=true)
    const guest1 = new Browser(testEnv.env);
    let samId = '';
    await expectActivityMoved(async () => {
      const res = await guest1.call<{ id: string }>('POST', `/groups/${code}/members`, { name: 'Sam', claim: true });
      samId = res.json.id;
      return res;
    });

    // 2. Add member by name (claim=false)
    let jamieId = '';
    await expectActivityMoved(async () => {
      const res = await owner.call<{ id: string }>('POST', `/groups/${code}/members`, { name: 'Jamie', claim: false });
      jamieId = res.json.id;
      return res;
    });

    // 3. Claim member
    const guest2 = new Browser(testEnv.env);
    await expectActivityMoved(async () => {
      return await guest2.call('POST', `/groups/${code}/members/${jamieId}/claim`);
    });

    // 4. Member edit (bank details / name)
    await expectActivityMoved(async () => {
      return await guest2.call('PATCH', `/groups/${code}/members/${jamieId}`, { name: 'Jamie Renamed' });
    });

    // 5. Expense add
    let expId = '';
    await expectActivityMoved(async () => {
      const res = await owner.call<{ id: string }>('POST', `/groups/${code}/expenses`, {
        payerId: alexId,
        amount: 30_000,
        description: 'Snacks',
        spentOn: '2026-10-02',
        splitMode: 'equal',
        participants: [
          { memberId: alexId, weight: 1 },
          { memberId: samId, weight: 1 },
        ],
      });
      expId = res.json.id;
      return res;
    });

    // 6. Transfer add
    let transferId = '';
    await expectActivityMoved(async () => {
      const res = await guest1.call<{ id: string }>('POST', `/groups/${code}/transfers`, {
        toId: alexId,
        amount: 20_000,
      });
      transferId = res.json.id;
      return res;
    });

    // 7. Transfer confirm
    await expectActivityMoved(async () => {
      return await owner.call('POST', `/groups/${code}/transfers/${transferId}/confirm`);
    });

    // 8. Expense delete
    await expectActivityMoved(async () => {
      return await owner.call('DELETE', `/groups/${code}/expenses/${expId}`);
    });

    // Refund Sam so balance is 0 before removal
    const refundRes = await owner.call<{ id: string }>('POST', `/groups/${code}/transfers`, {
      toId: samId,
      amount: 20_000,
    });
    await guest1.call('POST', `/groups/${code}/transfers/${refundRes.json.id}/confirm`);

    // 9. Member remove (Sam has settled balance 0 now)
    await expectActivityMoved(async () => {
      return await owner.call('POST', `/groups/${code}/members/${samId}/remove`, { reason: 'Leaving trip' });
    });

    // 10. Group settings with difference
    await expectActivityMoved(async () => {
      const res = await owner.call<{ ok: true; changed: boolean }>('PATCH', `/groups/${code}`, {
        name: 'Renamed Trip',
      });
      expect(res.json.changed).toBe(true);
      return res;
    });

    // Assert that these do NOT move last_activity_at:
    // A. PATCH with identical settings
    const auditCountBefore = await testEnv.env.DB.prepare(
      `SELECT COUNT(*) as count FROM audit_log WHERE group_code = ? AND action = 'group.update'`,
    )
      .bind(code)
      .first<{ count: number }>();

    await expectActivityNotMoved(async () => {
      const current = await getGroup(owner);
      const res = await owner.call<{ ok: true; changed: boolean }>('PATCH', `/groups/${code}`, {
        name: current.name,
        currency: current.currency,
        roundTo: current.roundTo,
      });
      expect(res.json.changed).toBe(false);
    });

    const auditCountAfter = await testEnv.env.DB.prepare(
      `SELECT COUNT(*) as count FROM audit_log WHERE group_code = ? AND action = 'group.update'`,
    )
      .bind(code)
      .first<{ count: number }>();
    expect(auditCountAfter!.count).toBe(auditCountBefore!.count);

    // B. Recovery link (owner/claim)
    const newBrowser = new Browser(testEnv.env);
    await expectActivityNotMoved(async () => {
      const res = await newBrowser.call('POST', `/groups/${code}/owner/claim`, { ownerKey });
      expect(res.status).toBe(200);
    });

    // Assert owner.claim audit row exists
    const ownerClaimAudit = await testEnv.env.DB.prepare(
      `SELECT COUNT(*) as count FROM audit_log WHERE group_code = ? AND action = 'owner.claim'`,
    )
      .bind(code)
      .first<{ count: number }>();
    expect(ownerClaimAudit!.count).toBeGreaterThan(0);
  }, 30_000);

  // PG-5 API: GET returns expiresAt === expiresAt(lastActivityAt) and equals the stored value + 10 days
  it('PG-5: GET returns expiresAt calculated from lastActivityAt', async () => {
    const fixedTime = '2026-10-10T15:30:00.000Z';
    await setGroupActivity(code, fixedTime);

    const group = await getGroup(owner);
    expect(group.lastActivityAt).toBe(fixedTime);
    expect(group.expiresAt).toBe(expiresAt(fixedTime));
    expect(group.expiresAt).toBe('2026-10-20T15:30:00.000Z');
  });

  // PG-7 API: a recovery link to a deleted group answers 404 GROUP_NOT_FOUND (the client then forgets the group)
  it('PG-7: owner/claim on a purged group answers 404 GROUP_NOT_FOUND', async () => {
    await setGroupActivity(code, '2026-10-01T00:00:00.000Z');
    await purgeInactiveGroups(testEnv.env.DB, new Date('2026-10-25T12:00:00.000Z'));

    const res = await new Browser(testEnv.env).call<{ code: string }>('POST', `/groups/${code}/owner/claim`, {
      ownerKey,
    });
    expect(res.status).toBe(404);
    expect(res.json.code).toBe('GROUP_NOT_FOUND');
  });

  // PG-8: the daily job (what the worker scheduled handler runs) triggers the purge.
  // The handler itself is a one-line call to runDailyJobs; importing worker/index here would also load the Durable
  // Object class, which needs the Workers runtime and is not available in Node.
  it('PG-8: the daily job triggers purge', async () => {
    const scheduledTime = Date.parse('2026-10-25T19:00:00.000Z');
    // Group active on 2026-10-14 (11 days before 2026-10-25)
    await setGroupActivity(code, '2026-10-14T19:00:00.000Z');

    await runDailyJobs(testEnv.env, new Date(scheduledTime));

    // Group should be deleted
    const res = await owner.call('GET', `/groups/${code}`);
    expect(res.status).toBe(404);
  });
});
