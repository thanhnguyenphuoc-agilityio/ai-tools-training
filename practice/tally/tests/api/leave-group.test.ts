import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { GroupDto, MyGroupsResponse } from '../../shared/types';
import { Browser, createTestEnv, interleave, signIn } from './helpers';

// leave_group: a member leaves (a soft removal marked left_group); the owner deletes an alone group. Fake data only.
// Each test starts its own Miniflare database and makes several requests; the default 5 s is too short for that.
const SLOW_TEST_MS = 30_000;

let env: Awaited<ReturnType<typeof createTestEnv>>;
let owner: Browser;
let sam: Browser;
let code: string;
let ids: { alex: string; sam: string; jamie: string };

const getGroup = (b: Browser) => b.call<GroupDto>('GET', `/groups/${code}`).then((r) => r.json);
const today = '2026-10-10';

const addExpense = (b: Browser, payerId: string, amount: number, participants: string[]) =>
  b.call('POST', `/groups/${code}/expenses`, {
    payerId,
    amount,
    description: 'Utilities',
    spentOn: today,
    splitMode: 'equal',
    participants: participants.map((memberId) => ({ memberId, weight: 1 })),
  });

const remove = (b: Browser, id: string) => b.call('POST', `/groups/${code}/members/${id}/remove`, {});
const leave = (b: Browser) => b.call('POST', `/groups/${code}/leave`, {});
const deleteGroup = (b: Browser) => b.call('DELETE', `/groups/${code}`);
const countAll = async (table: string) =>
  (await env.env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{ n: number }>())?.n;
const count = async (table: string, column = 'group_code') =>
  (
    await env.env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${column} = ?`)
      .bind(code)
      .first<{ n: number }>()
  )?.n;

beforeEach(async () => {
  env = await createTestEnv();
  owner = new Browser(env.env);
  sam = new Browser(env.env);
  ({ code } = (await owner.call('POST', '/groups', { name: 'Shared house', ownerName: 'Alex' })).json);
  const samId = (await sam.call('POST', `/groups/${code}/members`, { name: 'Sam', claim: true })).json.id;
  const jamieId = (await owner.call('POST', `/groups/${code}/members`, { name: 'Jamie' })).json.id;
  const alexId = (await getGroup(owner)).members.find((m) => m.isOwner)!.id;
  ids = { alex: alexId, sam: samId, jamie: jamieId };
});

afterEach(async () => {
  await env.dispose();
});

describe('leaving a group', () => {
  it('lets a member with a zero balance leave: removed, left, no reason, and logged', async () => {
    const res = await leave(sam);
    expect(res.status).toBe(200);
    expect(res.json).toEqual({ ok: true });

    const sams = (await getGroup(owner)).members.find((m) => m.id === ids.sam)!;
    expect(sams.removed).toBe(true);
    expect(sams.left).toBe(true);
    expect(sams.removedReason).toBeNull();

    const log = await env.env.DB.prepare(
      "SELECT actor, action, target FROM audit_log WHERE group_code = ? AND action = 'member.leave'",
    )
      .bind(code)
      .all<{ actor: string; action: string; target: string }>();
    expect(log.results).toEqual([{ actor: ids.sam, action: 'member.leave', target: ids.sam }]);
  });

  it('moves last_activity_at, as any change does', async () => {
    const before = await env.env.DB.prepare('SELECT last_activity_at FROM groups WHERE code = ?')
      .bind(code)
      .first<{ last_activity_at: string }>();
    await new Promise((r) => setTimeout(r, 5));
    expect((await leave(sam)).status).toBe(200);
    const after = await env.env.DB.prepare('SELECT last_activity_at FROM groups WHERE code = ?')
      .bind(code)
      .first<{ last_activity_at: string }>();
    expect(after!.last_activity_at > before!.last_activity_at).toBe(true);
  });

  it('turns the leaver device into a guest', async () => {
    expect((await leave(sam)).status).toBe(200);
    expect((await getGroup(sam)).me).toEqual({ memberId: null, isOwner: false, accountLinked: false });
    expect((await addExpense(sam, ids.sam, 10_000, [ids.sam])).status).toBe(401);
  });

  it('refuses a guest with JOIN_FIRST', async () => {
    const res = await leave(new Browser(env.env));
    expect(res.status).toBe(401);
    expect(res.json.code).toBe('JOIN_FIRST');
  });

  it('refuses the owner with CANNOT_LEAVE_OWNER and keeps the owner in the group', async () => {
    const res = await leave(owner);
    expect(res.status).toBe(409);
    expect(res.json.code).toBe('CANNOT_LEAVE_OWNER');
    expect((await getGroup(owner)).members.find((m) => m.id === ids.alex)!.removed).toBe(false);
  });

  it('refuses while the member still owes money (MEMBER_HAS_BALANCE with the balance)', async () => {
    await addExpense(owner, ids.alex, 90_000, [ids.alex, ids.sam]);
    const res = await leave(sam);
    expect(res.status).toBe(409);
    expect(res.json.code).toBe('MEMBER_HAS_BALANCE');
    expect(res.json.params).toEqual({ balance: -45_000 });
    expect((await getGroup(sam)).me.memberId).toBe(ids.sam);
  });

  it('refuses while a transfer from the member waits for confirmation', async () => {
    await owner.call('POST', `/groups/${code}/transfers`, { fromId: ids.sam, toId: ids.alex, amount: 10_000 });
    const res = await leave(sam);
    expect(res.status).toBe(409);
    expect(res.json.code).toBe('MEMBER_HAS_BALANCE');
  });

  it('leaving twice gives JOIN_FIRST, because the device no longer resolves', async () => {
    expect((await leave(sam)).status).toBe(200);
    const again = await leave(sam);
    expect(again.status).toBe(401);
    expect(again.json.code).toBe('JOIN_FIRST');
  });

  it('a removed member leaves the names of past expenses in place', async () => {
    await addExpense(owner, ids.alex, 20_000, [ids.alex, ids.sam]);
    const { json: transfer } = await owner.call('POST', `/groups/${code}/transfers`, {
      fromId: ids.sam,
      toId: ids.alex,
      amount: 10_000,
    });
    expect(transfer.id).toBeDefined();
    // Settle up first so the leave is allowed.
    await owner.call('POST', `/groups/${code}/transfers/${transfer.id}/confirm`);
    expect((await leave(sam)).status).toBe(200);
    const group = await getGroup(owner);
    expect(group.expenses[0].shares.map((s) => s.memberId)).toContain(ids.sam);
    expect(group.transfers[0].fromId).toBe(ids.sam);
  });

  it('a signed-in member who leaves drops the group from /me/groups and can join again', async () => {
    const account = new Browser(env.env);
    await signIn(account, 'sam@example.com');
    const joined = (await account.call('POST', `/groups/${code}/members`, { name: 'Sam Lee', claim: true })).json.id;
    expect((await account.call<MyGroupsResponse>('GET', '/me/groups')).json.groups.map((g) => g.code)).toContain(code);

    expect((await leave(account)).status).toBe(200);
    expect((await account.call<MyGroupsResponse>('GET', '/me/groups')).json.groups.map((g) => g.code)).not.toContain(
      code,
    );

    const rejoin = await account.call('POST', `/groups/${code}/members`, { name: 'Sam Again', claim: true });
    expect(rejoin.status).toBe(201);
    expect(rejoin.json.id).not.toBe(joined);
  });

  it('answers MEMBER_HAS_BALANCE when an expense naming the member commits right before the leave', async () => {
    const raced = sam.withEnv({
      ...env.env,
      DB: interleave(env.env.DB, /UPDATE members SET removed_at/, () =>
        addExpense(owner, ids.alex, 90_000, [ids.alex, ids.sam]),
      ),
    });
    const res = await leave(raced);
    expect(res.status).toBe(409);
    expect(res.json.code).toBe('MEMBER_HAS_BALANCE');

    const sams = (await getGroup(owner)).members.find((m) => m.id === ids.sam)!;
    expect(sams.removed).toBe(false);
    const row = await env.env.DB.prepare('SELECT left_group, removed_at FROM members WHERE id = ?')
      .bind(ids.sam)
      .first<{ left_group: number; removed_at: string | null }>();
    expect(row).toEqual({ left_group: 0, removed_at: null });
  });

  it('an owner removal still shows left false (regression for the shared helper)', async () => {
    expect((await remove(owner, ids.jamie)).status).toBe(200);
    const jamie = (await getGroup(owner)).members.find((m) => m.id === ids.jamie)!;
    expect(jamie.removed).toBe(true);
    expect(jamie.left).toBe(false);
  });
});

describe('deleting a group', () => {
  it('lets the alone owner delete the group and removes every row and photo of it', async () => {
    // Sam owes half of the expense; the transfer settles it, so Sam can leave with a zero balance.
    const { json: added } = await addExpense(owner, ids.alex, 90_000, [ids.alex, ids.sam]);
    // The photo goes on before anyone leaves: an expense with a removed member can no longer be edited.
    const up = await owner.sendBytes('POST', `/groups/${code}/expenses/${added.id}/attachments`, pngBytes(), 'image/png');
    expect(up.status, JSON.stringify(up.json)).toBe(201);
    const { json: transfer } = await owner.call('POST', `/groups/${code}/transfers`, {
      fromId: ids.sam,
      toId: ids.alex,
      amount: 45_000,
    });
    await owner.call('POST', `/groups/${code}/transfers/${transfer.id}/confirm`);
    await owner.call('POST', `/groups/${code}/sessions`, {
      day: today,
      startsAt: '19:00',
      endsAt: '21:00',
      presentIds: [ids.alex],
    });
    expect((await remove(owner, ids.jamie)).status).toBe(200);
    expect((await leave(sam)).status).toBe(200);

    expect(await env.env.RECEIPTS.list({ prefix: `${code}/` }).then((l) => l.objects.length)).toBe(1);

    const res = await deleteGroup(owner);
    expect(res.status).toBe(200);
    expect(res.json).toEqual({ ok: true });

    expect(await count('groups', 'code')).toBe(0);
    expect(await count('members')).toBe(0);
    expect(await count('expenses')).toBe(0);
    expect(await countAll('expense_shares')).toBe(0);
    expect(await countAll('attendance')).toBe(0);
    expect(await count('transfers')).toBe(0);
    expect(await count('group_sessions')).toBe(0);
    expect(await count('audit_log')).toBe(0);
    expect(await count('expense_attachments')).toBe(0);
    expect(await env.env.RECEIPTS.list({ prefix: `${code}/` }).then((l) => l.objects.length)).toBe(0);

    const after = await owner.call<{ code: string }>('GET', `/groups/${code}`);
    expect(after.status).toBe(404);
    expect(after.json.code).toBe('GROUP_NOT_FOUND');
  }, SLOW_TEST_MS);

  it('deletes a kept (locked) group too', async () => {
    await signIn(owner, 'alex@example.com');
    expect((await owner.call('POST', `/groups/${code}/lock`)).status).toBe(200);
    await remove(owner, ids.jamie);
    await leave(sam);
    expect((await deleteGroup(owner)).status).toBe(200);
    expect(await count('groups', 'code')).toBe(0);
  }, SLOW_TEST_MS);

  it('refuses an unclaimed member added by name (GROUP_HAS_MEMBERS) and keeps the group', async () => {
    const res = await deleteGroup(owner);
    expect(res.status).toBe(409);
    expect(res.json.code).toBe('GROUP_HAS_MEMBERS');
    expect(await count('groups', 'code')).toBe(1);
  });

  it('refuses a plain member with OWNER_ONLY', async () => {
    await remove(owner, ids.jamie);
    const res = await deleteGroup(sam);
    expect(res.status).toBe(403);
    expect(res.json.code).toBe('OWNER_ONLY');
  });

  it('refuses a guest with OWNER_ONLY', async () => {
    await remove(owner, ids.jamie);
    const res = await deleteGroup(new Browser(env.env));
    expect(res.status).toBe(403);
    expect(res.json.code).toBe('OWNER_ONLY');
  });

  it('answers 404 GROUP_NOT_FOUND for an unknown code', async () => {
    const res = await owner.call('DELETE', '/groups/zzzz-zzzz-zzzz');
    expect(res.status).toBe(404);
    expect(res.json.code).toBe('GROUP_NOT_FOUND');
  });

  it('refuses when a member joins between the check and the delete (interleave)', async () => {
    await remove(owner, ids.jamie);
    await leave(sam);
    const raced = owner.withEnv({
      ...env.env,
      DB: interleave(env.env.DB, /DELETE FROM groups/, () =>
        env.env.DB.prepare(
          "INSERT INTO members (id, group_code, name, created_at) VALUES ('late-member', ?, 'Riley', '2026-10-10T00:00:00.000Z')",
        )
          .bind(code)
          .run(),
      ),
    });
    const res = await deleteGroup(raced);
    expect(res.status).toBe(409);
    expect(res.json.code).toBe('GROUP_HAS_MEMBERS');
    expect(await count('groups', 'code')).toBe(1);
  });

  it('deletes when the last other member is removed between the refused statement and the count', async () => {
    await remove(owner, ids.jamie);
    const raced = owner.withEnv({
      ...env.env,
      DB: interleave(env.env.DB, /SELECT 1 AS found FROM groups/, () =>
        env.env.DB.prepare("UPDATE members SET removed_at = '2026-10-10T00:00:00.000Z' WHERE id = ?")
          .bind(ids.sam)
          .run(),
      ),
    });
    const res = await deleteGroup(raced);
    expect(res.status).toBe(200);
    expect(await count('groups', 'code')).toBe(0);
  });

  it('keeps the group and the new member when a join commits right before the second statement', async () => {
    await remove(owner, ids.jamie);
    // Sam is removed before the count (so the statement runs again), Riley joins just before that second run.
    const removeSam = () =>
      env.env.DB.prepare("UPDATE members SET removed_at = '2026-10-10T00:00:00.000Z' WHERE id = ?").bind(ids.sam).run();
    const joinRiley = () =>
      env.env.DB.prepare(
        "INSERT INTO members (id, group_code, name, created_at) VALUES ('late-member', ?, 'Riley', '2026-10-10T00:00:00.000Z')",
      )
        .bind(code)
        .run();
    const base = interleave(env.env.DB, /SELECT 1 AS found FROM groups/, removeSam);
    let deletes = 0;
    const db = new Proxy(base, {
      get(target, prop) {
        if (prop === 'prepare') {
          return (sql: string) => {
            if (/DELETE FROM groups/.test(sql) && ++deletes === 2) {
              return interleave(target, /DELETE FROM groups/, joinRiley).prepare(sql);
            }
            return target.prepare(sql);
          };
        }
        const value = Reflect.get(target, prop, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    const res = await deleteGroup(owner.withEnv({ ...env.env, DB: db }));
    expect(deletes).toBe(2);
    expect(res.status).toBe(409);
    expect(res.json.code).toBe('GROUP_HAS_MEMBERS');
    expect(await count('groups', 'code')).toBe(1);
    expect(await count('members')).toBe(4);
  });
});

describe('migration 0014_member_left', () => {
  it('a member row that existed before 0014 gets left_group 0', async () => {
    const migrated = await createTestEnv({
      beforeMigration: '0014_member_left.sql',
      seed: async (db) => {
        await db
          .prepare(
            "INSERT INTO groups (code, name, currency, round_to, owner_key_hash, last_activity_at, created_at) VALUES ('aaaa-bbbb-cccc', 'Old', 'USD', 1, 'h', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')",
          )
          .run();
        await db
          .prepare(
            "INSERT INTO members (id, group_code, name, is_owner, created_at, removed_at) VALUES ('old-member', 'aaaa-bbbb-cccc', 'Sam', 0, '2026-01-01T00:00:00.000Z', '2026-01-02T00:00:00.000Z')",
          )
          .run();
      },
    });
    try {
      const row = await migrated.env.DB.prepare('SELECT left_group FROM members WHERE id = ?')
        .bind('old-member')
        .first<{ left_group: number }>();
      expect(row?.left_group).toBe(0);
    } finally {
      await migrated.dispose();
    }
  }, SLOW_TEST_MS);
});

/** A 1x1 PNG: valid magic bytes for a receipt upload. */
function pngBytes(): Uint8Array {
  return Uint8Array.from(
    atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='),
    (ch) => ch.charCodeAt(0),
  );
}
