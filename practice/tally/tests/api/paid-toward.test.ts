import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { computeBalances } from '../../shared/settle';
import type { GroupDto } from '../../shared/types';
import { Browser, createTestEnv } from './helpers';

// paid_toward (TAL-61): once a transfer involving an expense's payer or a sharing member is recorded, the expense can
// no longer be edited or deleted. Fake data only.
let env: Awaited<ReturnType<typeof createTestEnv>>;
let owner: Browser;
let sam: Browser;
let code: string;
let ids: { alex: string; sam: string };

const getGroup = (b: Browser) => b.call<GroupDto>('GET', `/groups/${code}`).then((r) => r.json);
const balancesOf = (g: GroupDto) =>
  Object.fromEntries(computeBalances(g.members.map((m) => m.id), g.expenses, g.transfers));
const today = '2026-10-10';

beforeEach(async () => {
  env = await createTestEnv();
  owner = new Browser(env.env);
  sam = new Browser(env.env);
  ({ code } = (await owner.call('POST', '/groups', { name: 'Trip', ownerName: 'Alex', currency: 'VND' })).json);
  const samId = (await sam.call('POST', `/groups/${code}/members`, { name: 'Sam', claim: true })).json.id;
  ids = { alex: (await getGroup(owner)).members[0].id, sam: samId };
});

afterEach(async () => {
  await env.dispose();
});

describe('paid-toward expenses', () => {
  it('refuses to delete an expense after a confirmed transfer and keeps balances even', async () => {
    const added = await sam.call('POST', `/groups/${code}/expenses`, {
      payerId: ids.sam,
      amount: 300_000,
      description: 'Hotpot',
      spentOn: today,
      splitMode: 'equal',
      participants: [{ memberId: ids.alex }, { memberId: ids.sam }],
    });
    expect(added.status).toBe(201);

    const sent = await owner.call('POST', `/groups/${code}/transfers`, { fromId: ids.alex, toId: ids.sam, amount: 150_000 });
    expect(sent.status).toBe(201);
    expect((await owner.call('POST', `/groups/${code}/transfers/${sent.json.id}/confirm`)).status).toBe(200);

    const res = await owner.call('DELETE', `/groups/${code}/expenses/${added.json.id}`);
    expect(res.status).toBe(409);
    expect(res.json.code).toBe('EXPENSE_PAID_TOWARD');

    const group = await getGroup(owner);
    expect(group.expenses.map((e) => e.id)).toContain(added.json.id);
    expect(balancesOf(group)).toEqual({ [ids.alex]: 0, [ids.sam]: 0 });
  });
});
