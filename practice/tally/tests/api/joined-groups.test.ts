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

describe('joined groups list API (JG-1 to JG-6)', () => {
  it('JG-1: create, join, claim and link while signed in: all four groups listed with isOwner correct', async () => {
    const user = new Browser(env.env);
    await signIn(user, 'user@example.com');

    // 1. Create while signed in (owner)
    const g1 = (await user.call<{ code: string }>('POST', '/groups', { name: 'Group 1', ownerName: 'Alice' })).json;

    // 2. Join while signed in (member)
    const other = new Browser(env.env);
    const g2 = (await other.call<{ code: string }>('POST', '/groups', { name: 'Group 2', ownerName: 'Bob' })).json;
    await user.call('POST', `/groups/${g2.code}/members`, { name: 'AliceMember', claim: true });

    // 3. Claim existing member while signed in
    const g3 = (await other.call<{ code: string }>('POST', '/groups', { name: 'Group 3', ownerName: 'Bob' })).json;
    const m3 = (await other.call<{ id: string }>('POST', `/groups/${g3.code}/members`, { name: 'Charlie' })).json;
    await user.call('POST', `/groups/${g3.code}/members/${m3.id}/claim`);

    // 4. Link while signed in (owner)
    const g4Owner = new Browser(env.env);
    const g4 = (await g4Owner.call<{ code: string }>('POST', '/groups', { name: 'Group 4', ownerName: 'David' })).json;
    await signIn(g4Owner, 'user@example.com');
    const linkRes = await g4Owner.call('POST', `/groups/${g4.code}/link`);
    expect(linkRes.status).toBe(200);

    const res = await user.call<MyGroupsResponse>('GET', '/me/groups');
    expect(res.status).toBe(200);

    const codes = res.json.groups.map((g) => g.code);
    expect(codes).toContain(g1.code);
    expect(codes).toContain(g2.code);
    expect(codes).toContain(g3.code);
    expect(codes).toContain(g4.code);

    const groupMap = new Map(res.json.groups.map((g) => [g.code, g]));
    expect(groupMap.get(g1.code)?.isOwner).toBe(true);
    expect(groupMap.get(g2.code)?.isOwner).toBe(false);
    expect(groupMap.get(g3.code)?.isOwner).toBe(false);
    expect(groupMap.get(g4.code)?.isOwner).toBe(true);
  });

  it('JG-2: guest view while signed in: group not listed', async () => {
    const user = new Browser(env.env);
    await signIn(user, 'user@example.com');

    const other = new Browser(env.env);
    const g = (await other.call<{ code: string }>('POST', '/groups', { name: 'Guest Group', ownerName: 'Bob' })).json;

    // View as guest
    const viewRes = await user.call<GroupDto>('GET', `/groups/${g.code}`);
    expect(viewRes.status).toBe(200);

    const res = await user.call<MyGroupsResponse>('GET', '/me/groups');
    expect(res.status).toBe(200);
    const codes = res.json.groups.map((item) => item.code);
    expect(codes).not.toContain(g.code);
  });

  it('JG-3: removed member: group no longer listed', async () => {
    const user = new Browser(env.env);
    await signIn(user, 'user@example.com');

    const owner = new Browser(env.env);
    const gA = (await owner.call<{ code: string }>('POST', '/groups', { name: 'Group A', ownerName: 'Owner' })).json;
    const joinARes = await user.call<{ id: string }>('POST', `/groups/${gA.code}/members`, {
      name: 'Alice',
      claim: true,
    });
    const memberAId = joinARes.json.id;

    // Listed initially
    let listRes = await user.call<MyGroupsResponse>('GET', '/me/groups');
    expect(listRes.json.groups.map((g) => g.code)).toContain(gA.code);

    // Owner removes Alice
    const removeRes = await owner.call('POST', `/groups/${gA.code}/members/${memberAId}/remove`, { reason: 'Left' });
    expect(removeRes.status).toBe(200);

    listRes = await user.call<MyGroupsResponse>('GET', '/me/groups');
    expect(listRes.json.groups.map((g) => g.code)).not.toContain(gA.code);
  });

  it('JG-4: order follows last_activity_at after a new expense in an older group', async () => {
    const user = new Browser(env.env);
    await signIn(user, 'user@example.com');

    const gA = (await user.call<{ code: string }>('POST', '/groups', { name: 'Group A', ownerName: 'Alice' })).json;
    // Small delay so timestamps differ
    await new Promise((resolve) => setTimeout(resolve, 20));
    const gB = (await user.call<{ code: string }>('POST', '/groups', { name: 'Group B', ownerName: 'Alice' })).json;

    let res = await user.call<MyGroupsResponse>('GET', '/me/groups');
    expect(res.json.groups[0].code).toBe(gB.code);
    expect(res.json.groups[1].code).toBe(gA.code);

    // Get owner member id in Group A
    const groupADto = (await user.call<GroupDto>('GET', `/groups/${gA.code}`)).json;
    const ownerMemberId = groupADto.members[0].id;

    await new Promise((resolve) => setTimeout(resolve, 20));
    // Add expense in Group A
    const expenseRes = await user.call('POST', `/groups/${gA.code}/expenses`, {
      payerId: ownerMemberId,
      amount: 50_000,
      description: 'Snacks',
      spentOn: '2026-10-22',
      splitMode: 'equal',
      participants: [{ memberId: ownerMemberId }],
    });
    expect(expenseRes.status).toBe(201);

    res = await user.call<MyGroupsResponse>('GET', '/me/groups');
    expect(res.json.groups[0].code).toBe(gA.code);
    expect(res.json.groups[1].code).toBe(gB.code);
  });

  it('JG-5: GET /api/me/groups without a session: 401 SIGN_IN_REQUIRED', async () => {
    const anon = new Browser(env.env);
    const res = await anon.call<ErrorBody>('GET', '/me/groups');
    expect(res.status).toBe(401);
    expect(res.json.code).toBe('SIGN_IN_REQUIRED');
  });

  it("JG-6: response has only code, name, currency, isOwner, lastActivityAt; another account's groups absent", async () => {
    const user1 = new Browser(env.env);
    await signIn(user1, 'user1@example.com');
    const g1 = (await user1.call<{ code: string }>('POST', '/groups', { name: 'User 1 Group', ownerName: 'Alice' })).json;

    const user2 = new Browser(env.env);
    await signIn(user2, 'user2@example.com');
    const g2 = (await user2.call<{ code: string }>('POST', '/groups', { name: 'User 2 Group', ownerName: 'Bob' })).json;

    const res1 = await user1.call<MyGroupsResponse>('GET', '/me/groups');
    expect(res1.status).toBe(200);
    expect(res1.json.groups).toHaveLength(1);
    expect(res1.json.groups.map((g) => g.code)).not.toContain(g2.code);

    const group = res1.json.groups[0];
    expect(group.code).toBe(g1.code);
    expect(group.name).toBe('User 1 Group');
    expect(group.currency).toBe('VND');
    expect(group.isOwner).toBe(true);
    expect(typeof group.lastActivityAt).toBe('string');
    expect(Object.keys(group).sort()).toEqual(['code', 'currency', 'isOwner', 'lastActivityAt', 'name']);
  });
});
