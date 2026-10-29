import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ErrorBody } from '../../shared/errors';
import type { GroupDto, MyGroupsResponse } from '../../shared/types';
import { Browser, createTestEnv, signIn } from './helpers';

let env: Awaited<ReturnType<typeof createTestEnv>>;

beforeEach(async () => {
  env = await createTestEnv();
});

afterEach(async () => {
  await env.dispose();
});

const auditCount = async (code: string, action: string) => {
  const row = await env.env.DB.prepare('SELECT COUNT(*) AS n FROM audit_log WHERE group_code = ? AND action = ?')
    .bind(code, action)
    .first<{ n: number }>();
  return row?.n ?? 0;
};

const storedEmail = async (id: string) => {
  const row = await env.env.DB.prepare('SELECT invite_email FROM members WHERE id = ?')
    .bind(id)
    .first<{ invite_email: string | null }>();
  return row?.invite_email ?? null;
};

/** Owner Alex creates a group and adds Sam by name with an invite email. */
async function setupInvite(email = 'sam@example.com') {
  const owner = new Browser(env.env);
  const code = (await owner.call<{ code: string }>('POST', '/groups', { name: 'Trip', ownerName: 'Alex' })).json.code;
  const added = await owner.call<{ id: string }>('POST', `/groups/${code}/members`, {
    name: 'Sam',
    claim: false,
    inviteEmail: email,
  });
  return { owner, code, samId: added.json.id };
}

describe('member_email_invite API (MEI)', () => {
  it('MEI-1: add with an email gives 201 and invited true; the email never appears in any response', async () => {
    const owner = new Browser(env.env);
    const code = (await owner.call<{ code: string }>('POST', '/groups', { name: 'Trip', ownerName: 'Alex' })).json.code;
    const added = await owner.call<{ id: string }>('POST', `/groups/${code}/members`, {
      name: 'Sam',
      claim: false,
      inviteEmail: 'Sam@Example.com',
    });
    expect(added.status).toBe(201);
    const samId = added.json.id;

    const res = await owner.call<GroupDto>('GET', `/groups/${code}`);
    expect(res.status).toBe(200);
    const sam = res.json.members.find((m) => m.id === samId);
    expect(sam?.invited).toBe(true);
    expect(await storedEmail(samId)).toBe('sam@example.com');

    // No response body of the owner, and no error params, contains the email.
    expect(JSON.stringify(res.json)).not.toContain('sam@example.com');
    const guestGet = await new Browser(env.env).call('GET', `/groups/${code}`);
    expect(JSON.stringify(guestGet.json)).not.toContain('sam@example.com');
  });

  it('MEI-2: invalid emails give 400 INVALID_EMAIL and the value never appears in the error', async () => {
    const owner = new Browser(env.env);
    const code = (await owner.call<{ code: string }>('POST', '/groups', { name: 'Trip', ownerName: 'Alex' })).json.code;

    const bad = ['not-an-email', 'a b@example.com', 'two@@example.com', '@example.com', 'sam@', 12];
    for (const [i, inviteEmail] of bad.entries()) {
      const res = await owner.call<ErrorBody>('POST', `/groups/${code}/members`, {
        name: `Bad ${i}`,
        claim: false,
        inviteEmail,
      });
      expect(res.status).toBe(400);
      expect(res.json.code).toBe('INVALID_EMAIL');
      expect(JSON.stringify(res.json)).not.toContain('example.com');
    }

    // 255 characters is too long
    const long = `${'a'.repeat(246)}@example.com`;
    const tooLong = await owner.call<ErrorBody>('POST', `/groups/${code}/members`, {
      name: 'Long',
      claim: false,
      inviteEmail: long,
    });
    expect(tooLong.json.code).toBe('INVALID_EMAIL');
  });

  it('MEI-3: owner sets an email on an unclaimed member (member.update); spaces-only or empty clears it', async () => {
    const owner = new Browser(env.env);
    const code = (await owner.call<{ code: string }>('POST', '/groups', { name: 'Trip', ownerName: 'Alex' })).json.code;
    const jamie = (await owner.call<{ id: string }>('POST', `/groups/${code}/members`, { name: 'Jamie', claim: false }))
      .json.id;

    const before = await auditCount(code, 'member.update');
    const set = await owner.call('PATCH', `/groups/${code}/members/${jamie}`, { inviteEmail: 'jamie@example.com' });
    expect(set.status).toBe(200);
    expect(await auditCount(code, 'member.update')).toBe(before + 1);
    expect(await storedEmail(jamie)).toBe('jamie@example.com');

    const cleared = await owner.call('PATCH', `/groups/${code}/members/${jamie}`, { inviteEmail: '   ' });
    expect(cleared.status).toBe(200);
    expect(await storedEmail(jamie)).toBeNull();
  });

  it('MEI-4: a non-owner member gets 403 OWNER_ONLY; a claimed member gets 409 MEMBER_ALREADY_CLAIMED', async () => {
    const { owner, code, samId } = await setupInvite();
    const jamieBrowser = new Browser(env.env);
    await jamieBrowser.call('POST', `/groups/${code}/members`, { name: 'Jamie', claim: true });

    // A joined device that is not the owner cannot set the email of Sam
    const denied = await jamieBrowser.call<ErrorBody>('PATCH', `/groups/${code}/members/${samId}`, {
      inviteEmail: 'other@example.com',
    });
    expect(denied.status).toBe(403);
    expect(denied.json.code).toBe('OWNER_ONLY');

    // Owner cannot change the email once the member is claimed
    const claim = await new Browser(env.env).call('POST', `/groups/${code}/members/${samId}/claim`);
    expect(claim.status).toBe(200);
    const claimed = await owner.call<ErrorBody>('PATCH', `/groups/${code}/members/${samId}`, {
      inviteEmail: 'other@example.com',
    });
    expect(claimed.status).toBe(409);
    expect(claimed.json.code).toBe('MEMBER_ALREADY_CLAIMED');
  });

  it('MEI-5: Sam signs in with an uppercase variant of the email; GET links him and records member.link', async () => {
    const { code, samId } = await setupInvite('sam@example.com');
    await env.env.DB.prepare('UPDATE groups SET last_activity_at = ? WHERE code = ?')
      .bind('2026-01-01T00:00:00.000Z', code)
      .run();

    const sam = new Browser(env.env);
    await signIn(sam, 'SAM@EXAMPLE.COM');
    const res = await sam.call<GroupDto>('GET', `/groups/${code}`);

    expect(res.json.me.memberId).toBe(samId);
    expect(res.json.members.find((m) => m.id === samId)?.invited).toBe(false);
    expect(await storedEmail(samId)).toBeNull();
    expect(await auditCount(code, 'member.link')).toBe(1);
    const row = await env.env.DB.prepare('SELECT last_activity_at FROM groups WHERE code = ?')
      .bind(code)
      .first<{ last_activity_at: string }>();
    expect((row?.last_activity_at ?? '') > '2026-01-01T00:00:00.000Z').toBe(true);

    const groups = await sam.call<MyGroupsResponse>('GET', '/me/groups');
    expect(groups.json.groups.map((g) => g.code)).toContain(code);
  });

  it('MEI-6: a second GET writes nothing; signed-out visitor sees no change', async () => {
    const { code, samId } = await setupInvite();
    const sam = new Browser(env.env);
    await signIn(sam, 'sam@example.com');
    await sam.call('GET', `/groups/${code}`);
    expect(await auditCount(code, 'member.link')).toBe(1);

    await sam.call('GET', `/groups/${code}`);
    expect(await auditCount(code, 'member.link')).toBe(1);

    const guest = new Browser(env.env);
    const res = await guest.call<GroupDto>('GET', `/groups/${code}`);
    expect(res.json.me.memberId).toBeNull();
    expect(await storedEmail(samId)).toBeNull();
    expect(await auditCount(code, 'member.link')).toBe(1);
  });

  it('MEI-7: claimed on another device, or account already another member: nothing written, no error', async () => {
    // Claimed elsewhere (the claim clears the email, so the match must be made before the claim)
    const first = await setupInvite('sam@example.com');
    const deviceSam = new Browser(env.env);
    await deviceSam.call('POST', `/groups/${first.code}/members/${first.samId}/claim`);
    // The claim cleared the email, so a later sign-in with the same email has nothing to match.
    const later = new Browser(env.env);
    await signIn(later, 'sam@example.com');
    const laterRes = await later.call<GroupDto>('GET', `/groups/${first.code}`);
    expect(laterRes.status).toBe(200);
    expect(laterRes.json.me.memberId).toBeNull();
    expect(await auditCount(first.code, 'member.link')).toBe(0);

    // Account already has another member in the group
    const second = await setupInvite('sam@example.com');
    const other = new Browser(env.env);
    await signIn(other, 'sam@example.com');
    await other.call('POST', `/groups/${second.code}/members`, { name: 'Jamie', claim: true });
    const beforeCount = await auditCount(second.code, 'member.link');
    const res = await other.call<GroupDto>('GET', `/groups/${second.code}`);
    expect(res.status).toBe(200);
    expect(await storedEmail(second.samId)).toBe('sam@example.com');
    expect(await auditCount(second.code, 'member.link')).toBe(beforeCount);
  });

  it('MEI-8: removal, claim and device account link clear the email', async () => {
    // Removal (owner removes an unclaimed invited member with no balance)
    const removal = await setupInvite('sam@example.com');
    const removed = await removal.owner.call('POST', `/groups/${removal.code}/members/${removal.samId}/remove`, {
      reason: 'left',
    });
    expect(removed.status).toBe(200);
    expect(await storedEmail(removal.samId)).toBeNull();

    // Claim clears the email
    const claim = await setupInvite('lee@example.com');
    await new Browser(env.env).call('POST', `/groups/${claim.code}/members/${claim.samId}/claim`);
    expect(await storedEmail(claim.samId)).toBeNull();

    // Device account link: a device member (joined by name, then claimed) links to its account
    const deviceOwner = new Browser(env.env);
    const code = (await deviceOwner.call<{ code: string }>('POST', '/groups', { name: 'Trip', ownerName: 'Alex' })).json
      .code;
    const device = new Browser(env.env);
    const deviceMember = (
      await device.call<{ id: string }>('POST', `/groups/${code}/members`, { name: 'Lee', claim: true })
    ).json.id;
    await env.env.DB.prepare('UPDATE members SET invite_email = ? WHERE id = ?')
      .bind('lee@example.com', deviceMember)
      .run();
    await signIn(device, 'lee@example.com');
    const link = await device.call('POST', `/groups/${code}/link`);
    expect(link.status).toBe(200);
    expect(await storedEmail(deviceMember)).toBeNull();
  });

  it('MEI-9: two unclaimed members with the same email: the oldest is linked', async () => {
    const owner = new Browser(env.env);
    const code = (await owner.call<{ code: string }>('POST', '/groups', { name: 'Trip', ownerName: 'Alex' })).json.code;
    const older = (
      await owner.call<{ id: string }>('POST', `/groups/${code}/members`, {
        name: 'Sam',
        claim: false,
        inviteEmail: 'sam@example.com',
      })
    ).json.id;
    const newer = (
      await owner.call<{ id: string }>('POST', `/groups/${code}/members`, {
        name: 'Samuel',
        claim: false,
        inviteEmail: 'sam@example.com',
      })
    ).json.id;

    const sam = new Browser(env.env);
    await signIn(sam, 'sam@example.com');
    const res = await sam.call<GroupDto>('GET', `/groups/${code}`);
    expect(res.json.me.memberId).toBe(older);
    expect(await storedEmail(newer)).toBe('sam@example.com');
  });

  it('MEI-10: editing an invited member bank details without inviteEmail keeps the stored email', async () => {
    const { owner, code, samId } = await setupInvite('sam@example.com');
    const res = await owner.call('PATCH', `/groups/${code}/members/${samId}`, {
      bankBin: '970415',
      accountNo: '0123456789',
      accountName: 'SAM',
    });
    expect(res.status).toBe(200);
    expect(await storedEmail(samId)).toBe('sam@example.com');
  });

  it('MEI-12: migration 0009 keeps a pre-existing member row and leaves its invite_email NULL', async () => {
    const before = await createTestEnv({
      beforeMigration: '0009_member_invite_email.sql',
      seed: async (db) => {
        await db
          .prepare(
            "INSERT INTO groups (code, name, currency, round_to, owner_key_hash, last_activity_at, created_at) VALUES ('mig1-aaaa-bbbb', 'Old', 'VND', 1, 'h', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')",
          )
          .run();
        await db
          .prepare(
            "INSERT INTO members (id, group_code, name, created_at) VALUES ('old-member', 'mig1-aaaa-bbbb', 'Kim', '2026-01-01T00:00:00.000Z')",
          )
          .run();
      },
    });
    try {
      const row = await before.env.DB.prepare("SELECT name, invite_email FROM members WHERE id = 'old-member'").first<{
        name: string;
        invite_email: string | null;
      }>();
      expect(row?.name).toBe('Kim');
      expect(row?.invite_email).toBeNull();
    } finally {
      await before.dispose();
    }
  });

  it('MEI-11: a member name with a diacritic is kept and the case-insensitive email match still links', async () => {
    const owner = new Browser(env.env);
    const code = (await owner.call<{ code: string }>('POST', '/groups', { name: 'Trip', ownerName: 'Alex' })).json.code;
    const name = 'Ren\u00e9';
    const id = (
      await owner.call<{ id: string }>('POST', `/groups/${code}/members`, {
        name,
        claim: false,
        inviteEmail: 'Rene@Example.com',
      })
    ).json.id;

    const rene = new Browser(env.env);
    await signIn(rene, 'rene@example.COM');
    const res = await rene.call<GroupDto>('GET', `/groups/${code}`);
    expect(res.json.me.memberId).toBe(id);
    expect(res.json.members.find((m) => m.id === id)?.name).toBe(name);
  });
});
