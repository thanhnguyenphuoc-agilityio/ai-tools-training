import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ErrorBody } from '../../shared/errors';
import type { GroupDto, MeResponse, UserDto } from '../../shared/types';
import { Browser, createTestEnv, signIn } from './helpers';

let env: Awaited<ReturnType<typeof createTestEnv>>;

beforeEach(async () => {
  env = await createTestEnv();
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await env.dispose();
});

describe('saved bank details API', () => {
  it('SB-1: save valid; then unknown bank 400 UNKNOWN_BANK, account 12 400 INVALID_ACCOUNT_NO; GET /me returns bank fields', async () => {
    const b = new Browser(env.env);
    await signIn(b, 'alex@example.com');

    // Save valid bank details
    const patchRes = await b.call<{ user: UserDto }>('PATCH', '/me', {
      bankBin: '970415',
      accountNo: '0123456789',
      accountName: 'ALEX',
    });
    expect(patchRes.status).toBe(200);
    expect(patchRes.json.user.bankBin).toBe('970415');
    expect(patchRes.json.user.accountNo).toBe('0123456789');
    expect(patchRes.json.user.accountName).toBe('ALEX');

    // GET /me returns the bank fields
    const meRes = await b.call<MeResponse>('GET', '/me');
    expect(meRes.status).toBe(200);
    expect(meRes.json.user?.bankBin).toBe('970415');
    expect(meRes.json.user?.accountNo).toBe('0123456789');
    expect(meRes.json.user?.accountName).toBe('ALEX');

    // Unknown bank returns 400 UNKNOWN_BANK
    const badBankRes = await b.call<ErrorBody>('PATCH', '/me', {
      bankBin: '999999',
      accountNo: '0123456789',
    });
    expect(badBankRes.status).toBe(400);
    expect(badBankRes.json.code).toBe('UNKNOWN_BANK');

    // Short account number returns 400 INVALID_ACCOUNT_NO
    const badAccRes = await b.call<ErrorBody>('PATCH', '/me', {
      bankBin: '970415',
      accountNo: '12',
    });
    expect(badAccRes.status).toBe(400);
    expect(badAccRes.json.code).toBe('INVALID_ACCOUNT_NO');
  });

  it('SB-2: linked member without group account shows saved details to guest with bankSource account', async () => {
    const owner = new Browser(env.env);
    const code = (await owner.call('POST', '/groups', { name: 'Trip', ownerName: 'Alice' })).json.code;

    // Bob signs in and saves bank details
    const bob = new Browser(env.env);
    await signIn(bob, 'bob@example.com');
    await bob.call('PATCH', '/me', {
      bankBin: '970415',
      accountNo: '0123456789',
      accountName: 'BOB',
    });

    // Bob joins group while signed in
    const joinRes = await bob.call<{ id: string }>('POST', `/groups/${code}/members`, {
      name: 'Bob',
      claim: true,
    });
    expect(joinRes.status).toBe(201);
    const bobId = joinRes.json.id;

    // Guest opens group
    const guest = new Browser(env.env);
    const groupRes = await guest.call<GroupDto>('GET', `/groups/${code}`);
    expect(groupRes.status).toBe(200);

    const bobMember = groupRes.json.members.find((m) => m.id === bobId);
    expect(bobMember).toBeDefined();
    expect(bobMember?.bankBin).toBe('970415');
    expect(bobMember?.accountNo).toBe('0123456789');
    expect(bobMember?.accountName).toBe('BOB');
    expect(bobMember?.bankSource).toBe('account');
  });

  it('SB-3: group account takes precedence over the saved details with bankSource group', async () => {
    const owner = new Browser(env.env);
    const code = (await owner.call('POST', '/groups', { name: 'Trip', ownerName: 'Alice' })).json.code;

    // Bob signs in, saves bank details, joins group
    const bob = new Browser(env.env);
    await signIn(bob, 'bob@example.com');
    await bob.call('PATCH', '/me', {
      bankBin: '970415',
      accountNo: '0123456789',
      accountName: 'BOB ACCOUNT',
    });
    const joinRes = await bob.call<{ id: string }>('POST', `/groups/${code}/members`, {
      name: 'Bob',
      claim: true,
    });
    const bobId = joinRes.json.id;

    // Bob enters group-specific bank details
    const groupPatchRes = await bob.call('PATCH', `/groups/${code}/members/${bobId}`, {
      bankBin: '970436',
      accountNo: '9876543210',
      accountName: 'BOB GROUP',
    });
    expect(groupPatchRes.status).toBe(200);

    // Guest opens group: group account wins
    const guest = new Browser(env.env);
    const groupRes = await guest.call<GroupDto>('GET', `/groups/${code}`);
    const bobMember = groupRes.json.members.find((m) => m.id === bobId);
    expect(bobMember?.bankBin).toBe('970436');
    expect(bobMember?.accountNo).toBe('9876543210');
    expect(bobMember?.accountName).toBe('BOB GROUP');
    expect(bobMember?.bankSource).toBe('group');
  });

  it('SB-4: change and clear saved details: two groups follow; cleared gives bankSource null', async () => {
    const owner = new Browser(env.env);
    const code1 = (await owner.call('POST', '/groups', { name: 'Trip 1', ownerName: 'Alice' })).json.code;
    const code2 = (await owner.call('POST', '/groups', { name: 'Trip 2', ownerName: 'Alice' })).json.code;

    // Bob signs in, joins both groups without group account
    const bob = new Browser(env.env);
    await signIn(bob, 'bob@example.com');
    await bob.call('PATCH', '/me', {
      bankBin: '970415',
      accountNo: '0123456789',
      accountName: 'BOB',
    });
    const join1 = await bob.call<{ id: string }>('POST', `/groups/${code1}/members`, { name: 'Bob', claim: true });
    const join2 = await bob.call<{ id: string }>('POST', `/groups/${code2}/members`, { name: 'Bob', claim: true });

    // Change saved details
    await bob.call('PATCH', '/me', {
      bankBin: '970436',
      accountNo: '9876543210',
      accountName: 'BOB NEW',
    });

    const guest = new Browser(env.env);
    const res1 = await guest.call<GroupDto>('GET', `/groups/${code1}`);
    const res2 = await guest.call<GroupDto>('GET', `/groups/${code2}`);
    const m1 = res1.json.members.find((m) => m.id === join1.json.id);
    const m2 = res2.json.members.find((m) => m.id === join2.json.id);
    expect(m1?.bankBin).toBe('970436');
    expect(m1?.accountNo).toBe('9876543210');
    expect(m1?.bankSource).toBe('account');
    expect(m2?.bankBin).toBe('970436');
    expect(m2?.accountNo).toBe('9876543210');
    expect(m2?.bankSource).toBe('account');

    // Clear saved details
    await bob.call('PATCH', '/me', { bankBin: '', accountNo: '', accountName: '' });

    const res1Cleared = await guest.call<GroupDto>('GET', `/groups/${code1}`);
    const res2Cleared = await guest.call<GroupDto>('GET', `/groups/${code2}`);
    const m1Cleared = res1Cleared.json.members.find((m) => m.id === join1.json.id);
    const m2Cleared = res2Cleared.json.members.find((m) => m.id === join2.json.id);
    expect(m1Cleared?.bankBin).toBeNull();
    expect(m1Cleared?.accountNo).toBeNull();
    expect(m1Cleared?.accountName).toBeNull();
    expect(m1Cleared?.bankSource).toBeNull();
    expect(m2Cleared?.bankBin).toBeNull();
    expect(m2Cleared?.accountNo).toBeNull();
    expect(m2Cleared?.accountName).toBeNull();
    expect(m2Cleared?.bankSource).toBeNull();
  });

  it('SB-5: removed member has nulls from both sources', async () => {
    const owner = new Browser(env.env);
    const code = (await owner.call('POST', '/groups', { name: 'Trip', ownerName: 'Alice' })).json.code;

    const bob = new Browser(env.env);
    await signIn(bob, 'bob@example.com');
    await bob.call('PATCH', '/me', {
      bankBin: '970415',
      accountNo: '0123456789',
      accountName: 'BOB',
    });
    const joinRes = await bob.call<{ id: string }>('POST', `/groups/${code}/members`, { name: 'Bob', claim: true });
    const bobId = joinRes.json.id;

    // Owner removes Bob
    const removeRes = await owner.call('POST', `/groups/${code}/members/${bobId}/remove`, { reason: 'Moved away' });
    expect(removeRes.status).toBe(200);

    // Guest opens group: Bob is removed and has nulls for all bank fields
    const guest = new Browser(env.env);
    const groupRes = await guest.call<GroupDto>('GET', `/groups/${code}`);
    const bobMember = groupRes.json.members.find((m) => m.id === bobId);
    expect(bobMember?.removed).toBe(true);
    expect(bobMember?.bankBin).toBeNull();
    expect(bobMember?.accountNo).toBeNull();
    expect(bobMember?.accountName).toBeNull();
    expect(bobMember?.bankSource).toBeNull();
  });

  it('SB-5: removed member with group details also shows nothing', async () => {
    const owner = new Browser(env.env);
    const code = (await owner.call('POST', '/groups', { name: 'Trip', ownerName: 'Alice' })).json.code;

    const bob = new Browser(env.env);
    await signIn(bob, 'bob@example.com');
    await bob.call('PATCH', '/me', {
      bankBin: '970415',
      accountNo: '0123456789',
      accountName: 'BOB',
    });
    const joinRes = await bob.call<{ id: string }>('POST', `/groups/${code}/members`, { name: 'Bob', claim: true });
    const bobId = joinRes.json.id;

    const groupBank = await bob.call('PATCH', `/groups/${code}/members/${bobId}`, {
      bankBin: '970436',
      accountNo: '9876543210',
      accountName: 'BOB GROUP',
    });
    expect(groupBank.status).toBe(200);

    expect((await owner.call('POST', `/groups/${code}/members/${bobId}/remove`, { reason: 'Moved away' })).status).toBe(
      200,
    );

    const guest = new Browser(env.env);
    const groupRes = await guest.call<GroupDto>('GET', `/groups/${code}`);
    const bobMember = groupRes.json.members.find((m) => m.id === bobId);
    expect(bobMember?.removed).toBe(true);
    expect(bobMember?.bankBin).toBeNull();
    expect(bobMember?.accountNo).toBeNull();
    expect(bobMember?.accountName).toBeNull();
    expect(bobMember?.bankSource).toBeNull();
  });

  it('SB-7 API: PATCH /me without session returns 401 SIGN_IN_REQUIRED', async () => {
    const guest = new Browser(env.env);
    const res = await guest.call<ErrorBody>('PATCH', '/me', {
      bankBin: '970415',
      accountNo: '0123456789',
    });
    expect(res.status).toBe(401);
    expect(res.json.code).toBe('SIGN_IN_REQUIRED');
  });

  it('SB-8: bankSource values (group, account, null)', async () => {
    const owner = new Browser(env.env);
    const code = (await owner.call('POST', '/groups', { name: 'Trip', ownerName: 'Alice' })).json.code;

    // Member 1: group details
    const m1Join = await owner.call<{ id: string }>('POST', `/groups/${code}/members`, { name: 'Sam' });
    await owner.call('PATCH', `/groups/${code}/members/${m1Join.json.id}`, {
      bankBin: '970415',
      accountNo: '0123456789',
      accountName: 'SAM',
    });

    // Member 2: account details
    const bob = new Browser(env.env);
    await signIn(bob, 'bob@example.com');
    await bob.call('PATCH', '/me', { bankBin: '970436', accountNo: '9876543210', accountName: 'BOB' });
    const m2Join = await bob.call<{ id: string }>('POST', `/groups/${code}/members`, { name: 'Bob', claim: true });

    // Member 3: no details
    const m3Join = await owner.call<{ id: string }>('POST', `/groups/${code}/members`, { name: 'Charlie' });

    const guest = new Browser(env.env);
    const groupRes = await guest.call<GroupDto>('GET', `/groups/${code}`);
    const sam = groupRes.json.members.find((m) => m.id === m1Join.json.id);
    const bobMember = groupRes.json.members.find((m) => m.id === m2Join.json.id);
    const charlie = groupRes.json.members.find((m) => m.id === m3Join.json.id);

    expect(sam?.bankSource).toBe('group');
    expect(bobMember?.bankSource).toBe('account');
    expect(charlie?.bankSource).toBeNull();
  });

  it('SB-10: changing saved details leaves last_activity_at of groups unchanged; no audit rows', async () => {
    const owner = new Browser(env.env);
    const code1 = (await owner.call('POST', '/groups', { name: 'Trip 1', ownerName: 'Alice' })).json.code;
    const code2 = (await owner.call('POST', '/groups', { name: 'Trip 2', ownerName: 'Alice' })).json.code;

    const bob = new Browser(env.env);
    await signIn(bob, 'bob@example.com');
    await bob.call('POST', `/groups/${code1}/members`, { name: 'Bob', claim: true });
    await bob.call('POST', `/groups/${code2}/members`, { name: 'Bob', claim: true });

    const g1Before = await env.env.DB.prepare('SELECT last_activity_at FROM groups WHERE code = ?')
      .bind(code1)
      .first<{ last_activity_at: string }>();
    const g2Before = await env.env.DB.prepare('SELECT last_activity_at FROM groups WHERE code = ?')
      .bind(code2)
      .first<{ last_activity_at: string }>();
    const auditCountBefore = (
      await env.env.DB.prepare('SELECT COUNT(*) as count FROM audit_log').first<{ count: number }>()
    )?.count;

    // Bob updates saved bank details
    await bob.call('PATCH', '/me', { bankBin: '970415', accountNo: '0123456789', accountName: 'BOB' });
    // Bob clears saved bank details
    await bob.call('PATCH', '/me', { bankBin: '', accountNo: '', accountName: '' });

    const g1After = await env.env.DB.prepare('SELECT last_activity_at FROM groups WHERE code = ?')
      .bind(code1)
      .first<{ last_activity_at: string }>();
    const g2After = await env.env.DB.prepare('SELECT last_activity_at FROM groups WHERE code = ?')
      .bind(code2)
      .first<{ last_activity_at: string }>();
    const auditCountAfter = (
      await env.env.DB.prepare('SELECT COUNT(*) as count FROM audit_log').first<{ count: number }>()
    )?.count;

    expect(g1After?.last_activity_at).toBe(g1Before?.last_activity_at);
    expect(g2After?.last_activity_at).toBe(g2Before?.last_activity_at);
    expect(auditCountAfter).toBe(auditCountBefore);
  });

  it('SB-11: clearing the group details makes the saved details apply again', async () => {
    const owner = new Browser(env.env);
    const code = (await owner.call('POST', '/groups', { name: 'Trip', ownerName: 'Alice' })).json.code;

    const bob = new Browser(env.env);
    await signIn(bob, 'bob@example.com');
    await bob.call('PATCH', '/me', {
      bankBin: '970415',
      accountNo: '0123456789',
      accountName: 'BOB',
    });
    const joinRes = await bob.call<{ id: string }>('POST', `/groups/${code}/members`, { name: 'Bob', claim: true });
    const bobId = joinRes.json.id;

    const groupBank = await bob.call('PATCH', `/groups/${code}/members/${bobId}`, {
      bankBin: '970436',
      accountNo: '9876543210',
      accountName: 'BOB GROUP',
    });
    expect(groupBank.status).toBe(200);

    const cleared = await bob.call('PATCH', `/groups/${code}/members/${bobId}`, {
      bankBin: '',
      accountNo: '',
      accountName: '',
    });
    expect(cleared.status).toBe(200);

    const guest = new Browser(env.env);
    const groupRes = await guest.call<GroupDto>('GET', `/groups/${code}`);
    const bobMember = groupRes.json.members.find((m) => m.id === bobId);
    expect(bobMember?.bankBin).toBe('970415');
    expect(bobMember?.accountNo).toBe('0123456789');
    expect(bobMember?.accountName).toBe('BOB');
    expect(bobMember?.bankSource).toBe('account');
  });

  it('accountLinked: true for account member, false for device-only member', async () => {
    const owner = new Browser(env.env);
    await signIn(owner, 'owner@example.com');
    const code = (await owner.call('POST', '/groups', { name: 'Trip', ownerName: 'Alice' })).json.code;

    // Owner is linked to account
    const ownerGroup = await owner.call<GroupDto>('GET', `/groups/${code}`);
    expect(ownerGroup.json.me.accountLinked).toBe(true);

    // Guest joins as device-only member
    const guest = new Browser(env.env);
    await guest.call('POST', `/groups/${code}/members`, { name: 'Bob', claim: true });
    const guestGroup = await guest.call<GroupDto>('GET', `/groups/${code}`);
    expect(guestGroup.json.me.accountLinked).toBe(false);
  });
});
