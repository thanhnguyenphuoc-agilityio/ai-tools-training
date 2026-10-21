import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MAX_AMOUNT } from '../../shared/money';
import { computeBalances } from '../../shared/settle';
import type { GroupDto } from '../../shared/types';
import { Browser, createTestEnv } from './helpers';

let env: Awaited<ReturnType<typeof createTestEnv>>;
let owner: Browser;
let code: string;
let ids: { alex: string; sam: string; jamie: string };

const getGroup = () => owner.call<GroupDto>('GET', `/groups/${code}`).then((r) => r.json);
const addExpense = (body: Record<string, unknown>) => owner.call('POST', `/groups/${code}/expenses`, body);
const today = '2026-10-10';

beforeEach(async () => {
  env = await createTestEnv();
  owner = new Browser(env.env);
  ({ code } = (await owner.call('POST', '/groups', { name: 'Dinner out', ownerName: 'Alex', currency: 'VND' })).json);
  const samId = (await owner.call('POST', `/groups/${code}/members`, { name: 'Sam' })).json.id;
  const jamieId = (await owner.call('POST', `/groups/${code}/members`, { name: 'Jamie' })).json.id;
  ids = { alex: (await getGroup()).members[0].id, sam: samId, jamie: jamieId };
});

afterEach(async () => {
  await env.dispose();
});

const exact = (parts: Record<string, unknown>[], total = 250_500) => ({
  payerId: ids.alex,
  amount: total,
  description: 'Restaurant bill',
  spentOn: today,
  splitMode: 'exact',
  participants: parts,
});

// The API does not promise an order for shares, so they are compared by member.
const sharesOf = (expense: GroupDto['expenses'][number]) =>
  Object.fromEntries(expense.shares.map((s) => [s.memberId, s.amount]));
const balancesOf = (group: GroupDto) =>
  Object.fromEntries(computeBalances(group.members.map((m) => m.id), group.expenses, group.transfers));

describe('exact-amount split', () => {
  it('stores the typed amounts as they are, a zero part included, without the group rounding', async () => {
    expect((await owner.call('PATCH', `/groups/${code}`, { roundTo: 1000 })).status).toBe(200);
    const res = await addExpense(
      exact([
        { memberId: ids.alex, amount: 120_500 },
        { memberId: ids.sam, amount: 130_000 },
        { memberId: ids.jamie, amount: 0 },
      ]),
    );
    expect(res.status).toBe(201);

    const group = await getGroup();
    const [expense] = group.expenses;
    expect(expense.splitMode).toBe('exact');
    expect(sharesOf(expense)).toEqual({ [ids.alex]: 120_500, [ids.sam]: 130_000, [ids.jamie]: 0 });
    expect(expense.shares).toHaveLength(3);
    expect(balancesOf(group)).toEqual({ [ids.alex]: 130_000, [ids.sam]: -130_000, [ids.jamie]: 0 });
  });

  it('accepts a payer who does not take part', async () => {
    const res = await addExpense(
      exact([
        { memberId: ids.sam, amount: 100_500 },
        { memberId: ids.jamie, amount: 150_000 },
      ]),
    );
    expect(res.status).toBe(201);

    const group = await getGroup();
    expect(sharesOf(group.expenses[0])).toEqual({ [ids.sam]: 100_500, [ids.jamie]: 150_000 });
    expect(balancesOf(group)).toEqual({ [ids.alex]: 250_500, [ids.sam]: -100_500, [ids.jamie]: -150_000 });
  });

  it.each([
    ['less than the amount', 130_000 - 1],
    ['more than the amount', 130_000 + 1],
  ])('rejects parts that add up to %s', async (_, samAmount) => {
    const res = await addExpense(
      exact([
        { memberId: ids.alex, amount: 120_500 },
        { memberId: ids.sam, amount: samAmount },
      ]),
    );
    expect(res.status).toBe(400);
    expect(res.json.code).toBe('SPLIT_SUM_MISMATCH');
  });

  it.each([
    ['negative', -500],
    ['not an integer', 0.5],
    ['a string', '500'],
    ['missing', undefined],
    ['above the maximum', MAX_AMOUNT + 1],
  ])('rejects a participant amount that is %s', async (_, bad) => {
    const res = await addExpense(
      exact(
        [
          { memberId: ids.alex, amount: 1000 },
          { memberId: ids.sam, amount: bad },
        ],
        1000,
      ),
    );
    expect(res.status).toBe(400);
    expect(res.json.code).toBe('INVALID_SHARE_AMOUNT');
  });

  it('rejects unknown and duplicate members', async () => {
    const unknown = await addExpense(exact([{ memberId: 'nobody', amount: 250_500 }]));
    expect(unknown.status).toBe(400);
    expect(unknown.json.code).toBe('PARTICIPANT_NOT_IN_GROUP');

    const duplicate = await addExpense(
      exact([
        { memberId: ids.sam, amount: 125_000 },
        { memberId: ids.sam, amount: 125_500 },
      ]),
    );
    expect(duplicate.status).toBe(400);
    expect(duplicate.json.code).toBe('DUPLICATE_PARTICIPANT');
  });

  it('saves nothing when a request is rejected', async () => {
    await addExpense(exact([{ memberId: ids.alex, amount: 1 }]));
    expect((await getGroup()).expenses).toEqual([]);
  });

  it('does not read amounts in the other split modes', async () => {
    const res = await addExpense({
      ...exact([
        { memberId: ids.alex, amount: 1 },
        { memberId: ids.sam, amount: 2 },
      ]),
      amount: 300_000,
      splitMode: 'equal',
    });
    expect(res.status).toBe(201);
    expect(sharesOf((await getGroup()).expenses[0])).toEqual({ [ids.alex]: 150_000, [ids.sam]: 150_000 });
  });
});
