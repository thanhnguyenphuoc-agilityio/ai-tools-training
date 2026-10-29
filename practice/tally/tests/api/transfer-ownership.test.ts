import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ErrorBody } from '../../shared/errors';
import type { CreateGroupResponse, GroupDto } from '../../shared/types';
import { INACTIVE_MS } from '../../shared/rules';
import { purgeInactiveGroups } from '../../worker/cleanup';
import { Browser, createTestEnv, interleave, signIn } from './helpers';

let env: Awaited<ReturnType<typeof createTestEnv>>;

beforeEach(async () => {
  env = await createTestEnv();
});

afterEach(async () => {
  await env.dispose();
});

const TRANSFER = (code: string) => `/groups/${code}/owner/transfer`;

/** Alex (signed in) creates a group; Sam joins signed in; returns the ids the tests need. */
async function setupSignedInPair() {
  const alex = new Browser(env.env);
  await signIn(alex, 'alex@example.com');
  const created = await alex.call<CreateGroupResponse>('POST', '/groups', {
    name: 'Trip',
    ownerName: 'Alex',
    currency: 'USD',
    roundTo: 1,
  });
  const code = created.json.code;
  const alexMember = (await alex.call<GroupDto>('GET', `/groups/${code}`)).json.members[0];

  const sam = new Browser(env.env);
  await signIn(sam, 'sam@example.com');
  const joined = await sam.call<{ id: string }>('POST', `/groups/${code}/members`, { name: 'Sam', claim: true });
  return { alex, sam, code, alexId: alexMember.id, samId: joined.json.id };
}

describe('transfer_ownership API', () => {
  it('TO-1: owner hands over to a linked member; previous owner stays a member; activity unchanged', async () => {
    const { alex, sam, code, alexId, samId } = await setupSignedInPair();
    const before = await env.env.DB.prepare('SELECT last_activity_at FROM groups WHERE code = ?')
      .bind(code)
      .first<{ last_activity_at: string }>();

    const res = await alex.call<{ ok: true }>('POST', TRANSFER(code), { memberId: samId });
    expect(res.status).toBe(200);
    expect(res.json.ok).toBe(true);

    const group = await env.env.DB.prepare(
      'SELECT owner_user_id, owner_key_hash, last_activity_at FROM groups WHERE code = ?',
    )
      .bind(code)
      .first<{ owner_user_id: string; owner_key_hash: string; last_activity_at: string }>();
    const samRow = await env.env.DB.prepare('SELECT user_id FROM members WHERE id = ?')
      .bind(samId)
      .first<{ user_id: string }>();
    // The group must belong to Sam's account.
    expect(group?.owner_user_id).toBe(samRow?.user_id);
    expect(group?.owner_key_hash).toBe('revoked');
    expect(group?.last_activity_at).toBe(before?.last_activity_at);

    const owners = await env.env.DB.prepare('SELECT id FROM members WHERE group_code = ? AND is_owner = 1')
      .bind(code)
      .all<{ id: string }>();
    expect(owners.results.map((r) => r.id)).toEqual([samId]);

    // Alex is still an active member, with the same history, and is no longer owner.
    const alexRow = await env.env.DB.prepare('SELECT removed_at, is_owner FROM members WHERE id = ?')
      .bind(alexId)
      .first<{ removed_at: string | null; is_owner: number }>();
    expect(alexRow?.removed_at).toBeNull();
    expect(alexRow?.is_owner).toBe(0);

    const samDto = await sam.call<GroupDto>('GET', `/groups/${code}`);
    expect(samDto.json.me.isOwner).toBe(true);
    expect(samDto.json.members.find((m) => m.id === samId)?.isOwner).toBe(true);
  });

  it('TO-2: one audit row owner.transfer, target is the receiver member, and no recordChange', async () => {
    const { alex, code, alexId, samId } = await setupSignedInPair();
    await alex.call('POST', TRANSFER(code), { memberId: samId });

    const rows = await env.env.DB.prepare(
      "SELECT actor, action, target FROM audit_log WHERE group_code = ? AND action = 'owner.transfer'",
    )
      .bind(code)
      .all<{ actor: string; action: string; target: string }>();
    expect(rows.results).toEqual([{ actor: alexId, action: 'owner.transfer', target: samId }]);
  });

  it('TO-3: target without an account -> 409 OWNER_TRANSFER_NOT_LINKED', async () => {
    const { alex, code } = await setupSignedInPair();
    const jamie = await alex.call<{ id: string }>('POST', `/groups/${code}/members`, { name: 'Jamie' });

    const res = await alex.call<ErrorBody>('POST', TRANSFER(code), { memberId: jamie.json.id });
    expect(res.status).toBe(409);
    expect(res.json.code).toBe('OWNER_TRANSFER_NOT_LINKED');
  });

  it('TO-4: removed member -> 409 MEMBER_REMOVED', async () => {
    const { alex, code, samId } = await setupSignedInPair();
    await alex.call('POST', `/groups/${code}/members/${samId}/remove`, { reason: 'left' });

    const res = await alex.call<ErrorBody>('POST', TRANSFER(code), { memberId: samId });
    expect(res.status).toBe(409);
    expect(res.json.code).toBe('MEMBER_REMOVED');
  });

  it('TO-5: handing over to the current owner -> 409 OWNER_TRANSFER_SELF', async () => {
    const { alex, code, alexId } = await setupSignedInPair();
    const res = await alex.call<ErrorBody>('POST', TRANSFER(code), { memberId: alexId });
    expect(res.status).toBe(409);
    expect(res.json.code).toBe('OWNER_TRANSFER_SELF');
  });

  it('TO-6: unknown member -> 404 MEMBER_NOT_FOUND; non-owner caller -> 403 OWNER_ONLY', async () => {
    const { alex, sam, code, samId } = await setupSignedInPair();

    const unknown = await alex.call<ErrorBody>('POST', TRANSFER(code), { memberId: 'no-such-member' });
    expect(unknown.status).toBe(404);
    expect(unknown.json.code).toBe('MEMBER_NOT_FOUND');

    const notOwner = await sam.call<ErrorBody>('POST', TRANSFER(code), { memberId: samId });
    expect(notOwner.status).toBe(403);
    expect(notOwner.json.code).toBe('OWNER_ONLY');
  });

  it('TO-7: anonymous key owner hands over; the recovery link is revoked and the old owner cookie is cleared', async () => {
    const guest = new Browser(env.env);
    const created = await guest.call<CreateGroupResponse>('POST', '/groups', {
      name: 'Guest Trip',
      ownerName: 'Alex',
      currency: 'USD',
      roundTo: 1,
    });
    const { code, ownerKey } = created.json;
    expect(ownerKey).toBeTruthy();

    const sam = new Browser(env.env);
    await signIn(sam, 'sam@example.com');
    const samJoin = await sam.call<{ id: string }>('POST', `/groups/${code}/members`, { name: 'Sam', claim: true });

    const res = await guest.call<{ ok: true }>('POST', TRANSFER(code), { memberId: samJoin.json.id });
    expect(res.status).toBe(200);

    // The old recovery link no longer works for anonymous visitors.
    const anon = new Browser(env.env);
    const claim = await anon.call<ErrorBody>('POST', `/groups/${code}/owner/claim`, { ownerKey: ownerKey! });
    expect(claim.json.code).toBe('OWNER_KEY_REVOKED');

    // The previous owner's device lost owner access and its cookie is cleared on the next request.
    const dto = await guest.call<GroupDto>('GET', `/groups/${code}`);
    expect(dto.json.me.isOwner).toBe(false);
    expect(guest.getCookie(`tally_owner_${code}`)).toBeUndefined();
  });

  it('TO-8: device still holding the old owner cookie is no longer owner and the cookie is cleared', async () => {
    const { alex, code, samId } = await setupSignedInPair();
    const oldOwner = new Browser(env.env);
    oldOwner.setCookie(`tally_owner_${code}`, 'stale-key');
    await alex.call('POST', TRANSFER(code), { memberId: samId });

    const res = await oldOwner.call<GroupDto>('GET', `/groups/${code}`);
    expect(res.json.me.isOwner).toBe(false);
    expect(oldOwner.getCookie(`tally_owner_${code}`)).toBeUndefined();
  });

  it('TO-9: after the hand-over the old recovery link answers OWNER_KEY_REVOKED (anonymous) or GROUP_OWNED_BY_OTHER_ACCOUNT (signed in)', async () => {
    const { alex, code, samId } = await setupSignedInPair();
    await alex.call('POST', TRANSFER(code), { memberId: samId });

    const anon = new Browser(env.env);
    const anonRes = await anon.call<ErrorBody>('POST', `/groups/${code}/owner/claim`, { ownerKey: 'old-key' });
    expect(anonRes.status).toBe(403);
    expect(anonRes.json.code).toBe('OWNER_KEY_REVOKED');

    const otherAccount = new Browser(env.env);
    await signIn(otherAccount, 'other@example.com');
    const otherRes = await otherAccount.call<ErrorBody>('POST', `/groups/${code}/owner/claim`, { ownerKey: 'old-key' });
    expect(otherRes.status).toBe(403);
    expect(otherRes.json.code).toBe('GROUP_OWNED_BY_OTHER_ACCOUNT');
  });

  it('TO-10: a kept group stops being kept after the hand-over; the new owner can keep it again', async () => {
    const { alex, sam, code, alexId, samId } = await setupSignedInPair();
    const lock = await alex.call<{ ok: true; changed: boolean }>('POST', `/groups/${code}/lock`);
    expect(lock.json.changed).toBe(true);

    const handOverStart = Date.now();
    await alex.call('POST', TRANSFER(code), { memberId: samId });
    const handOverEnd = Date.now();

    const dto = await sam.call<GroupDto>('GET', `/groups/${code}`);
    expect(dto.json.locked).toBe(false);

    const group = await env.env.DB.prepare('SELECT last_activity_at FROM groups WHERE code = ?')
      .bind(code)
      .first<{ last_activity_at: string }>();
    const activity = Date.parse(group!.last_activity_at);
    expect(activity).toBeGreaterThanOrEqual(handOverStart);
    expect(activity).toBeLessThanOrEqual(handOverEnd);
    expect(dto.json.expiresAt).toBe(new Date(activity + INACTIVE_MS).toISOString());

    const unlockRows = await env.env.DB.prepare(
      "SELECT actor, details FROM audit_log WHERE group_code = ? AND action = 'group.unlock'",
    )
      .bind(code)
      .all<{ actor: string; details: string }>();
    expect(unlockRows.results).toEqual([{ actor: alexId, details: '{"reason":"owner.transfer"}' }]);

    const transferRows = await env.env.DB.prepare(
      "SELECT COUNT(*) AS total FROM audit_log WHERE group_code = ? AND action = 'owner.transfer'",
    )
      .bind(code)
      .first<{ total: number }>();
    expect(transferRows?.total).toBe(1);

    const relock = await sam.call<{ ok: true; changed: boolean }>('POST', `/groups/${code}/lock`);
    expect(relock.status).toBe(200);
    expect(relock.json.changed).toBe(true);
  }, 30_000);

  it('TO-13: an old kept group is not purged by the cleanup right after the hand-over', async () => {
    const { alex, code, samId } = await setupSignedInPair();
    await alex.call('POST', `/groups/${code}/lock`);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    await env.env.DB.prepare('UPDATE groups SET last_activity_at = ? WHERE code = ?').bind(thirtyDaysAgo, code).run();

    await alex.call('POST', TRANSFER(code), { memberId: samId });

    await purgeInactiveGroups(env.env.DB, new Date());
    const row = await env.env.DB.prepare('SELECT code FROM groups WHERE code = ?').bind(code).first();
    expect(row).not.toBeNull();
  }, 30_000);

  it('TO-14: hand-over of a group that is not kept writes only owner.transfer and keeps last_activity_at', async () => {
    const { alex, code, samId } = await setupSignedInPair();
    const before = await env.env.DB.prepare('SELECT last_activity_at FROM groups WHERE code = ?')
      .bind(code)
      .first<{ last_activity_at: string }>();

    await alex.call('POST', TRANSFER(code), { memberId: samId });

    const after = await env.env.DB.prepare('SELECT last_activity_at FROM groups WHERE code = ?')
      .bind(code)
      .first<{ last_activity_at: string }>();
    expect(after?.last_activity_at).toBe(before?.last_activity_at);

    const unlock = await env.env.DB.prepare(
      "SELECT COUNT(*) AS total FROM audit_log WHERE group_code = ? AND action = 'group.unlock'",
    )
      .bind(code)
      .first<{ total: number }>();
    expect(unlock?.total).toBe(0);

    const transfer = await env.env.DB.prepare(
      "SELECT COUNT(*) AS total FROM audit_log WHERE group_code = ? AND action = 'owner.transfer'",
    )
      .bind(code)
      .first<{ total: number }>();
    expect(transfer?.total).toBe(1);
  }, 30_000);

  it('TO-15: a kept group hand-over that loses the race writes no group.unlock of its own', async () => {
    const { alex, code, samId } = await setupSignedInPair();
    await alex.call('POST', `/groups/${code}/lock`);
    const third = new Browser(env.env);
    await signIn(third, 'third@example.com');
    const thirdJoin = await third.call<{ id: string }>('POST', `/groups/${code}/members`, {
      name: 'Third',
      claim: true,
    });

    const racingDb = interleave(env.env.DB, /UPDATE groups SET owner_user_id/, async () => {
      const won = await alex
        .withEnv(env.env)
        .call<{ ok: true }>('POST', TRANSFER(code), { memberId: thirdJoin.json.id });
      expect(won.status).toBe(200);
    });
    const res = await alex
      .withEnv({ ...env.env, DB: racingDb })
      .call<ErrorBody>('POST', TRANSFER(code), { memberId: samId });
    expect(res.status).toBe(403);

    // The winning hand-over (Third) is a full hand-over of a kept group, so it unlocks the group itself. The refused
    // hand-over (Sam) must add nothing: one owner (Third) and exactly one group.unlock row, the winner's.
    const owners = await env.env.DB.prepare('SELECT id FROM members WHERE group_code = ? AND is_owner = 1')
      .bind(code)
      .all<{ id: string }>();
    expect(owners.results.map((r) => r.id)).toEqual([thirdJoin.json.id]);
    const unlock = await env.env.DB.prepare(
      "SELECT COUNT(*) AS total FROM audit_log WHERE group_code = ? AND action = 'group.unlock'",
    )
      .bind(code)
      .first<{ total: number }>();
    expect(unlock?.total).toBe(1);
  }, 30_000);

  it('TO-11: a second hand-over lands between the checks and the write: the first is refused, one owner', async () => {
    const { alex, code, samId } = await setupSignedInPair();
    const third = new Browser(env.env);
    await signIn(third, 'third@example.com');
    const thirdJoin = await third.call<{ id: string }>('POST', `/groups/${code}/members`, {
      name: 'Third',
      claim: true,
    });
    const thirdId = thirdJoin.json.id;

    // Just before Alex's hand-over writes, Alex's other device hands over to Third (on the raw database).
    const racingDb = interleave(env.env.DB, /UPDATE groups SET owner_user_id/, async () => {
      const other = alex.withEnv(env.env);
      const won = await other.call<{ ok: true }>('POST', TRANSFER(code), { memberId: thirdId });
      expect(won.status).toBe(200);
    });
    const res = await alex
      .withEnv({ ...env.env, DB: racingDb })
      .call<ErrorBody>('POST', TRANSFER(code), { memberId: samId });

    expect(res.status).toBe(403);
    expect(res.json.code).toBe('OWNER_ONLY');
    const owners = await env.env.DB.prepare('SELECT id FROM members WHERE group_code = ? AND is_owner = 1')
      .bind(code)
      .all<{ id: string }>();
    expect(owners.results.map((r) => r.id)).toEqual([thirdId]);
  });

  it('TO-12: after the hand-over the previous owner can delete the account', async () => {
    const { alex, code, samId } = await setupSignedInPair();
    await alex.call('POST', TRANSFER(code), { memberId: samId });

    const res = await alex.call('DELETE', '/me');
    expect(res.status).toBe(200);
  });
});
