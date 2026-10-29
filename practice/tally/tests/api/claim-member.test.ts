import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ErrorBody } from '../../shared/errors';
import type { GroupDto, MyGroupsResponse } from '../../shared/types';
import { Browser, createTestEnv, interleave, signIn } from './helpers';

let env: Awaited<ReturnType<typeof createTestEnv>>;
let owner: Browser;
let code: string;
let ids: { alex: string; jamie: string };
let wrong: Browser;

const getGroup = (b: Browser) => b.call<GroupDto>('GET', `/groups/${code}`).then((r) => r.json);
const release = (b: Browser, id: string) => b.call<ErrorBody & { ok?: boolean }>('POST', `/groups/${code}/members/${id}/release`);
const today = '2026-10-10';

const auditRows = (action: string) =>
  env.env.DB.prepare('SELECT actor, target FROM audit_log WHERE group_code = ? AND action = ?')
    .bind(code, action)
    .all<{ actor: string; target: string }>()
    .then((r) => r.results);

const memberRow = (id: string) =>
  env.env.DB.prepare('SELECT token_hash, user_id, invite_email FROM members WHERE id = ?')
    .bind(id)
    .first<{ token_hash: string | null; user_id: string | null; invite_email: string | null }>();

beforeEach(async () => {
  env = await createTestEnv();
  owner = new Browser(env.env);
  ({ code } = (await owner.call<{ code: string }>('POST', '/groups', { name: 'Shared house', ownerName: 'Alex' })).json);
  ids = {
    jamie: (await owner.call<{ id: string }>('POST', `/groups/${code}/members`, { name: 'Jamie' })).json.id,
    alex: (await getGroup(owner)).members.find((m) => m.isOwner)!.id,
  };
  // A device claims the name by mistake.
  wrong = new Browser(env.env);
  await wrong.call('POST', `/groups/${code}/members/${ids.jamie}/claim`);
});

afterEach(async () => {
  await env.dispose();
});

describe('owner releases a wrongly claimed name', () => {
  it('answers 200, and the device becomes a guest for that member', async () => {
    const res = await release(owner, ids.jamie);
    expect(res.status).toBe(200);
    expect(res.json.ok).toBe(true);
    expect((await getGroup(wrong)).me.memberId).toBeNull();
    expect((await getGroup(owner)).members.find((m) => m.id === ids.jamie)!.claimed).toBe(false);
  });

  it('lets the real person claim the released name', async () => {
    await release(owner, ids.jamie);
    const real = new Browser(env.env);
    expect((await real.call('POST', `/groups/${code}/members/${ids.jamie}/claim`)).status).toBe(200);
  });

  it('keeps the expenses of the released member with their author and shares', async () => {
    const res = await wrong.call<{ id: string }>('POST', `/groups/${code}/expenses`, {
      payerId: ids.jamie,
      amount: 90_000,
      description: 'Utilities',
      spentOn: today,
      splitMode: 'equal',
      participants: [ids.alex, ids.jamie].map((memberId) => ({ memberId, weight: 1 })),
    });
    expect(res.status).toBe(201);

    await release(owner, ids.jamie);
    const expense = (await getGroup(owner)).expenses[0];
    expect(expense.createdBy).toBe(ids.jamie);
    expect(expense.shares.map((s) => s.memberId)).toContain(ids.jamie);
  });

  it('records member.release with the owner member as actor and moves last_activity_at', async () => {
    await env.env.DB.prepare("UPDATE groups SET last_activity_at = '2000-01-01T00:00:00.000Z' WHERE code = ?")
      .bind(code)
      .run();
    await release(owner, ids.jamie);

    expect(await auditRows('member.release')).toEqual([{ actor: ids.alex, target: ids.jamie }]);
    const group = await env.env.DB.prepare('SELECT last_activity_at FROM groups WHERE code = ?')
      .bind(code)
      .first<{ last_activity_at: string }>();
    expect(group!.last_activity_at).not.toBe('2000-01-01T00:00:00.000Z');
  });
});

describe('owner releases an account-linked member', () => {
  it('clears user_id and invite_email, so the account stops being the member', async () => {
    const added = await owner.call<{ id: string }>('POST', `/groups/${code}/members`, {
      name: 'Sam',
      claim: false,
      inviteEmail: 'sam@example.com',
    });
    const samAccount = new Browser(env.env);
    await signIn(samAccount, 'sam@example.com');
    expect((await getGroup(samAccount)).me.memberId).toBe(added.json.id);

    expect((await release(owner, added.json.id)).status).toBe(200);
    const row = await memberRow(added.json.id);
    expect(row).toEqual({ token_hash: null, user_id: null, invite_email: null });
    expect((await getGroup(samAccount)).me.memberId).toBeNull();

    const groups = await samAccount.call<MyGroupsResponse>('GET', '/me/groups');
    expect(groups.json.groups.map((g) => g.code)).not.toContain(code);
  });
});

describe('release refusals', () => {
  it('refuses an invited but unclaimed member and keeps the invite email', async () => {
    const added = await owner.call<{ id: string }>('POST', `/groups/${code}/members`, {
      name: 'Sam',
      claim: false,
      inviteEmail: 'sam@example.com',
    });
    const res = await release(owner, added.json.id);
    expect(res.status).toBe(409);
    expect(res.json.code).toBe('MEMBER_NOT_CLAIMED');
    expect((await memberRow(added.json.id))!.invite_email).toBe('sam@example.com');
  });

  it('refuses a plain member and a guest with OWNER_ONLY', async () => {
    const plain = new Browser(env.env);
    await plain.call('POST', `/groups/${code}/members`, { name: 'Sam', claim: true });
    for (const b of [plain, new Browser(env.env)]) {
      const res = await release(b, ids.jamie);
      expect(res.status).toBe(403);
      expect(res.json.code).toBe('OWNER_ONLY');
    }
    expect((await getGroup(owner)).members.find((m) => m.id === ids.jamie)!.claimed).toBe(true);
  });

  it('refuses the owner member with CANNOT_RELEASE_OWNER', async () => {
    const res = await release(owner, ids.alex);
    expect(res.status).toBe(409);
    expect(res.json.code).toBe('CANNOT_RELEASE_OWNER');
  });

  it('refuses a removed member with MEMBER_REMOVED', async () => {
    expect((await owner.call('POST', `/groups/${code}/members/${ids.jamie}/remove`, {})).status).toBe(200);
    const res = await release(owner, ids.jamie);
    expect(res.status).toBe(409);
    expect(res.json.code).toBe('MEMBER_REMOVED');
  });

  it('answers 404 MEMBER_NOT_FOUND for an unknown member', async () => {
    const res = await release(owner, '00000000-0000-4000-8000-000000000000');
    expect(res.status).toBe(404);
    expect(res.json.code).toBe('MEMBER_NOT_FOUND');
  });

  it('lets only one of two simultaneous releases win', async () => {
    const plain = owner.withEnv(env.env);
    const raced = owner.withEnv({
      ...env.env,
      DB: interleave(env.env.DB, /UPDATE members SET token_hash = NULL/, async () => {
        await release(plain, ids.jamie);
      }),
    });
    const res = await release(raced, ids.jamie);
    expect(res.status).toBe(409);
    expect(res.json.code).toBe('MEMBER_NOT_CLAIMED');
    expect(await auditRows('member.release')).toHaveLength(1);
  });
});

describe('claim refusals already on develop (regression)', () => {
  it('refuses a device that already joined as another member, and keeps its identity', async () => {
    const casey = (await owner.call<{ id: string }>('POST', `/groups/${code}/members`, { name: 'Casey' })).json.id;
    const sam = new Browser(env.env);
    await sam.call('POST', `/groups/${code}/members`, { name: 'Sam', claim: true });

    const res = await sam.call<ErrorBody>('POST', `/groups/${code}/members/${casey}/claim`);
    expect(res.status).toBe(409);
    expect(res.json.code).toBe('ALREADY_MEMBER');
    expect((await getGroup(owner)).members.find((m) => m.id === casey)!.claimed).toBe(false);
  });

  it('audits a claim with the claimed member as actor', async () => {
    expect(await auditRows('member.claim')).toEqual([{ actor: ids.jamie, target: ids.jamie }]);
  });
});
