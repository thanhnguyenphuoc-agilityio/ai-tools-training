import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ErrorBody } from '../../shared/errors';
import type { CreateGroupResponse, GroupDto } from '../../shared/types';
import { Browser, createTestEnv, signIn } from './helpers';

let env: Awaited<ReturnType<typeof createTestEnv>>;

beforeEach(async () => {
  env = await createTestEnv();
});

afterEach(async () => {
  await env.dispose();
});

const ownerRow = (code: string) =>
  env.env.DB.prepare('SELECT owner_user_id, owner_key_hash, last_activity_at FROM groups WHERE code = ?')
    .bind(code)
    .first<{ owner_user_id: string | null; owner_key_hash: string; last_activity_at: string }>();

const auditCount = (code: string) =>
  env.env.DB.prepare('SELECT COUNT(*) AS n FROM audit_log WHERE group_code = ?')
    .bind(code)
    .first<{ n: number }>()
    .then((r) => r?.n ?? 0);

async function createAnonymousGroup(name = 'Guest Group') {
  const guest = new Browser(env.env);
  const res = await guest.call<CreateGroupResponse>('POST', '/groups', {
    name,
    ownerName: 'Alex',
    currency: 'USD',
    roundTo: 1,
  });
  expect(res.status).toBe(201);
  return { guest, code: res.json.code, ownerKey: res.json.ownerKey! };
}

describe('owner_link_binds_account API', () => {
  it('OL-1: create while signed in gives ownerKey null, the sentinel hash and no owner cookie', async () => {
    const b = new Browser(env.env);
    await signIn(b, 'alice@example.com');

    const res = await b.call<CreateGroupResponse>('POST', '/groups', {
      name: 'Account Group',
      ownerName: 'Alice',
      currency: 'USD',
      roundTo: 1,
    });
    expect(res.status).toBe(201);
    expect(res.json.ownerKey).toBeNull();

    const code = res.json.code;
    expect(b.getCookie(`tally_owner_${code}`)).toBeUndefined();

    const row = await ownerRow(code);
    expect(row?.owner_user_id).toBeTruthy();
    expect(row?.owner_key_hash).toBe('revoked');

    const dto = await b.call<GroupDto>('GET', `/groups/${code}`);
    expect(dto.status).toBe(200);
    expect(dto.json.ownedByAccount).toBe(true);
    expect(dto.json.me.isOwner).toBe(true);
    expect(dto.json.canLinkAccount).toBe(false);
  });

  it('OL-2: claim while signed in attaches the group, revokes the key and clears the owner cookie', async () => {
    const { code, ownerKey } = await createAnonymousGroup();

    const alice = new Browser(env.env);
    await signIn(alice, 'alice@example.com');
    const claim = await alice.call<{ ok: true; attached: boolean }>('POST', `/groups/${code}/owner/claim`, { ownerKey });
    expect(claim.status).toBe(200);
    expect(claim.json.attached).toBe(true);
    expect(alice.getCookie(`tally_owner_${code}`)).toBeUndefined();

    const row = await ownerRow(code);
    expect(row?.owner_user_id).toBeTruthy();
    expect(row?.owner_key_hash).toBe('revoked');

    // The same account claiming again attaches nothing more.
    const again = await alice.call<{ ok: true; attached: boolean }>('POST', `/groups/${code}/owner/claim`, { ownerKey });
    expect(again.status).toBe(200);
    expect(again.json.attached).toBe(false);

    // Another account gets GROUP_OWNED_BY_OTHER_ACCOUNT, an anonymous visitor gets OWNER_KEY_REVOKED.
    const bob = new Browser(env.env);
    await signIn(bob, 'bob@example.com');
    const other = await bob.call<ErrorBody>('POST', `/groups/${code}/owner/claim`, { ownerKey });
    expect(other.status).toBe(403);
    expect(other.json.code).toBe('GROUP_OWNED_BY_OTHER_ACCOUNT');

    const anon = new Browser(env.env);
    const revoked = await anon.call<ErrorBody>('POST', `/groups/${code}/owner/claim`, { ownerKey });
    expect(revoked.status).toBe(403);
    expect(revoked.json.code).toBe('OWNER_KEY_REVOKED');
  });

  it('OL-3: claim of a group owned by another account answers GROUP_OWNED_BY_OTHER_ACCOUNT', async () => {
    const { code, ownerKey } = await createAnonymousGroup('Shared Group');

    const alice = new Browser(env.env);
    await signIn(alice, 'alice@example.com');
    expect((await alice.call('POST', `/groups/${code}/owner/claim`, { ownerKey })).status).toBe(200);

    const bob = new Browser(env.env);
    await signIn(bob, 'bob@example.com');
    const claim = await bob.call<ErrorBody>('POST', `/groups/${code}/owner/claim`, { ownerKey });
    expect(claim.status).toBe(403);
    expect(claim.json.code).toBe('GROUP_OWNED_BY_OTHER_ACCOUNT');
  });

  it('OL-4: attach endpoint attaches the device owner cookie group after sign-in, once', async () => {
    const { guest, code } = await createAnonymousGroup('Auto-attach Group');
    expect(guest.getCookie(`tally_owner_${code}`)).toBeTruthy();

    await signIn(guest, 'sam@example.com');
    const attach = await guest.call<{ ok: true; attached: boolean }>('POST', `/groups/${code}/owner/attach`);
    expect(attach.status).toBe(200);
    expect(attach.json.attached).toBe(true);
    expect(guest.getCookie(`tally_owner_${code}`)).toBeUndefined();

    const row = await ownerRow(code);
    expect(row?.owner_user_id).toBeTruthy();
    expect(row?.owner_key_hash).toBe('revoked');

    const again = await guest.call<{ ok: true; attached: boolean }>('POST', `/groups/${code}/owner/attach`);
    expect(again.status).toBe(200);
    expect(again.json.attached).toBe(false);
  });

  it('OL-4b: attach without a sign-in answers 401 SIGN_IN_REQUIRED and writes nothing', async () => {
    const { guest, code } = await createAnonymousGroup('Anonymous Attach');
    const before = await ownerRow(code);

    const res = await guest.call<ErrorBody>('POST', `/groups/${code}/owner/attach`);
    expect(res.status).toBe(401);
    expect(res.json.code).toBe('SIGN_IN_REQUIRED');
    expect(await ownerRow(code)).toEqual(before);
  });

  it('OL-5: account deletion is refused with ACCOUNT_OWNS_SHARED_GROUP while a non-owner member is active', async () => {
    const owner = new Browser(env.env);
    await signIn(owner, 'owner@example.com');
    const created = await owner.call<CreateGroupResponse>('POST', '/groups', {
      name: 'Shared Family Group',
      ownerName: 'Owner',
      currency: 'USD',
      roundTo: 1,
    });
    const code = created.json.code;

    const member = new Browser(env.env);
    await member.call('POST', `/groups/${code}/members`, { name: 'Member 1', claim: true });

    const refused = await owner.call<ErrorBody>('DELETE', '/me');
    expect(refused.status).toBe(409);
    expect(refused.json.code).toBe('ACCOUNT_OWNS_SHARED_GROUP');
    expect(refused.json.params).toEqual({ count: 1 });

    // Once the other member is removed the owner is solo and the deletion goes through.
    const dto = await owner.call<GroupDto>('GET', `/groups/${code}`);
    const m1 = dto.json.members.find((m) => m.name === 'Member 1')!;
    await owner.call('POST', `/groups/${code}/members/${m1.id}/remove`, { reason: 'Done' });

    const deleted = await owner.call<{ ok: true }>('DELETE', '/me');
    expect(deleted.status).toBe(200);
  });

  it('OL-6: a device holding an old owner cookie loses owner access; the cookie is cleared and nothing is written', async () => {
    const { guest, code, ownerKey } = await createAnonymousGroup('Shared Device Group');
    const ownerCookie = guest.getCookie(`tally_owner_${code}`)!;
    expect(ownerCookie).toBeTruthy();

    const claimant = new Browser(env.env);
    await signIn(claimant, 'alex@example.com');
    const claim = await claimant.call<{ attached: boolean }>('POST', `/groups/${code}/owner/claim`, { ownerKey });
    expect(claim.json.attached).toBe(true);

    const before = await ownerRow(code);
    const auditsBefore = await auditCount(code);

    // The other device still sends the cookie it held before the key was revoked.
    const other = new Browser(env.env);
    other.setCookie(`tally_owner_${code}`, ownerCookie);
    const view = await other.call<GroupDto>('GET', `/groups/${code}`);
    expect(view.status).toBe(200);
    expect(view.json.me.isOwner).toBe(false);
    expect(other.getCookie(`tally_owner_${code}`)).toBeUndefined();

    const after = await ownerRow(code);
    expect(after?.last_activity_at).toBe(before?.last_activity_at);
    expect(await auditCount(code)).toBe(auditsBefore);
  });

  it('OL-7: attach skips silently for a device without the owner key or for a group owned by another account', async () => {
    const { guest, code, ownerKey } = await createAnonymousGroup('Someone Else Group');

    // A signed-in device that never held the owner key changes nothing.
    const noKey = new Browser(env.env);
    await signIn(noKey, 'sam@example.com');
    const before = await ownerRow(code);
    const skipped = await noKey.call<{ ok: true; attached: boolean }>('POST', `/groups/${code}/owner/attach`);
    expect(skipped.status).toBe(200);
    expect(skipped.json.attached).toBe(false);
    expect(await ownerRow(code)).toEqual(before);

    // Once another account owns the group, the device that still holds the old key is skipped too.
    const alex = new Browser(env.env);
    await signIn(alex, 'alex@example.com');
    expect((await alex.call('POST', `/groups/${code}/owner/claim`, { ownerKey })).status).toBe(200);

    const held = new Browser(env.env);
    held.setCookie(`tally_owner_${code}`, guest.getCookie(`tally_owner_${code}`)!);
    await signIn(held, 'sam@example.com');
    const owned = await held.call<{ ok: true; attached: boolean }>('POST', `/groups/${code}/owner/attach`);
    expect(owned.status).toBe(200);
    expect(owned.json.attached).toBe(false);

    const accountRow = await env.env.DB.prepare('SELECT id FROM users WHERE email = ?')
      .bind('alex@example.com')
      .first<{ id: string }>();
    expect((await ownerRow(code))?.owner_user_id).toBe(accountRow?.id);
  });

  it('OL-7b: a signed-in member opening the recovery link gets owner access on the device without attaching', async () => {
    const { guest, code, ownerKey } = await createAnonymousGroup('Recovery Member Group');

    // The phone account joins the group as a member, so the account is already another member of it.
    const phone = new Browser(env.env);
    await signIn(phone, 'sam@example.com');
    const joined = await phone.call('POST', `/groups/${code}/members`, { name: 'Sam', claim: true });
    expect(joined.status).toBe(201);

    const before = await ownerRow(code);
    const auditBefore = await auditCount(code);

    const claim = await phone.call<{ ok: true; attached: boolean }>('POST', `/groups/${code}/owner/claim`, { ownerKey });
    expect(claim.status).toBe(200);
    expect(claim.json.attached).toBe(false);
    expect(phone.getCookie(`tally_owner_${code}`)).toBeTruthy();

    const dto = await phone.call<GroupDto>('GET', `/groups/${code}`);
    expect(dto.status).toBe(200);
    expect(dto.json.me.isOwner).toBe(true);

    // The group is not attached and the owner key stays valid; the claim does not move last_activity_at.
    const after = await ownerRow(code);
    expect(after?.owner_user_id).toBeNull();
    expect(after?.owner_key_hash).not.toBe('revoked');
    expect(after?.last_activity_at).toBe(before?.last_activity_at);

    // Exactly one new audit entry, the owner claim.
    expect(await auditCount(code)).toBe(auditBefore + 1);
    const claims = await env.env.DB.prepare('SELECT COUNT(*) AS n FROM audit_log WHERE group_code = ? AND action = ?')
      .bind(code, 'owner.claim')
      .first<{ n: number }>();
    expect(claims?.n).toBe(1);

    // The laptop that created the group keeps owner access too.
    const laptop = await guest.call<GroupDto>('GET', `/groups/${code}`);
    expect(laptop.json.me.isOwner).toBe(true);
  });

  it('OL-8: deleting the account of a solo owned group leaves the group without an owner and the key revoked', async () => {
    const alex = new Browser(env.env);
    await signIn(alex, 'alex@example.com');
    const created = await alex.call<CreateGroupResponse>('POST', '/groups', {
      name: 'Solo Group',
      ownerName: 'Alex',
      currency: 'USD',
      roundTo: 1,
    });
    const code = created.json.code;

    const deleted = await alex.call<{ ok: true }>('DELETE', '/me');
    expect(deleted.status).toBe(200);

    const row = await ownerRow(code);
    expect(row?.owner_user_id).toBeNull();
    expect(row?.owner_key_hash).toBe('revoked');

    const member = await env.env.DB.prepare('SELECT user_id FROM members WHERE group_code = ? AND is_owner = 1')
      .bind(code)
      .first<{ user_id: string | null }>();
    expect(member?.user_id).toBeNull();
  });

  it('OL-9: migration 0007_owner_key_revoke revokes the key of existing account-owned groups only', async () => {
    const migrated = await createTestEnv({
      beforeMigration: '0007_owner_key_revoke.sql',
      seed: async (db) => {
        await db
          .prepare('INSERT INTO users (id, google_sub, email, name, created_at) VALUES (?, ?, ?, ?, ?)')
          .bind('u1', 'sub-1', 'u1@example.com', 'U1', '2026-10-01T00:00:00.000Z')
          .run();
        // One group linked to an account, one anonymous group that keeps its key.
        await db
          .prepare(
            'INSERT INTO groups (code, name, currency, round_to, owner_user_id, owner_key_hash, created_at, last_activity_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          )
          .bind('linked1', 'Linked', 'USD', 1, 'u1', 'oldhash123', '2026-10-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z')
          .run();
        await db
          .prepare(
            'INSERT INTO groups (code, name, currency, round_to, owner_user_id, owner_key_hash, created_at, last_activity_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          )
          .bind('guest1', 'Guest', 'USD', 1, null, 'guesthash456', '2026-10-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z')
          .run();
      },
    });

    try {
      const linked = await migrated.env.DB.prepare('SELECT owner_key_hash FROM groups WHERE code = ?')
        .bind('linked1')
        .first<{ owner_key_hash: string }>();
      const guest = await migrated.env.DB.prepare('SELECT owner_key_hash FROM groups WHERE code = ?')
        .bind('guest1')
        .first<{ owner_key_hash: string }>();
      expect(linked?.owner_key_hash).toBe('revoked');
      expect(guest?.owner_key_hash).toBe('guesthash456');
    } finally {
      await migrated.dispose();
    }
  });
});
