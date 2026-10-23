import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { GroupDto } from '../../shared/types';
import { Browser, createTestEnv } from './helpers';

let env: Awaited<ReturnType<typeof createTestEnv>>;
let owner: Browser;

beforeEach(async () => {
  env = await createTestEnv();
  owner = new Browser(env.env);
});

afterEach(async () => {
  await env.dispose();
});

const create = (body: Record<string, unknown>) => owner.call('POST', '/groups', { name: 'Trip', ownerName: 'Alex', ...body });
const getGroup = (code: string) => owner.call<GroupDto>('GET', `/groups/${code}`).then((r) => r.json);

describe('group currency', () => {
  it('defaults to VND with exact rounding', async () => {
    const { code } = (await create({})).json;
    const group = await getGroup(code);
    expect(group.currency).toBe('VND');
    expect(group.roundTo).toBe(1);
  });

  it('accepts a supported currency and one of its rounding options', async () => {
    const { code } = (await create({ currency: 'USD', roundTo: 100 })).json;
    const group = await getGroup(code);
    expect(group).toMatchObject({ currency: 'USD', roundTo: 100 });
  });

  it('rejects unknown currencies and rounding that does not fit the currency', async () => {
    const bad = await create({ currency: 'XYZ' });
    expect(bad.status).toBe(400);
    expect(bad.json.code).toBe('INVALID_CURRENCY');
    const rounding = await create({ currency: 'USD', roundTo: 1000 });
    expect(rounding.status).toBe(400);
    expect(rounding.json.code).toBe('INVALID_ROUNDING');
  });

  it('splits in minor units (cents) for two-digit currencies', async () => {
    const { code } = (await create({ currency: 'USD', roundTo: 100 })).json;
    const group = await getGroup(code);
    const sam = (await owner.call('POST', `/groups/${code}/members`, { name: 'Sam' })).json.id;
    const res = await owner.call('POST', `/groups/${code}/expenses`, {
      payerId: group.me.memberId,
      amount: 10_050, // $100.50
      description: 'Dinner',
      spentOn: '2026-10-10',
      participants: [{ memberId: group.me.memberId }, { memberId: sam }],
    });
    expect(res.status).toBe(201);
    const shares = Object.fromEntries((await getGroup(code)).expenses[0].shares.map((s) => [s.memberId, s.amount]));
    // The payer keeps the 50 cents that do not round to a whole dollar.
    expect(shares).toEqual({ [group.me.memberId!]: 5_050, [sam]: 5_000 });
  });

  it('lets the owner change currency only while the group has no expenses', async () => {
    const { code } = (await create({ currency: 'VND', roundTo: 1000 })).json;
    const toUsd = await owner.call('PATCH', `/groups/${code}`, { currency: 'USD' });
    expect(toUsd.status).toBe(200);
    // 1000 is not a USD rounding option, so it falls back to exact.
    expect(await getGroup(code)).toMatchObject({ currency: 'USD', roundTo: 1 });

    const group = await getGroup(code);
    expect(group.currencyLocked).toBe(false);
    const added = await owner.call('POST', `/groups/${code}/expenses`, {
      payerId: group.me.memberId,
      amount: 500,
      description: 'Snacks',
      spentOn: '2026-10-10',
      participants: [{ memberId: group.me.memberId }],
    });
    // A deleted expense still locks the currency, and the DTO says so (the UI disables the select).
    await owner.call('DELETE', `/groups/${code}/expenses/${added.json.id}`);
    expect((await getGroup(code)).currencyLocked).toBe(true);
    const locked = await owner.call('PATCH', `/groups/${code}`, { currency: 'EUR' });
    expect(locked.status).toBe(409);
    expect(locked.json.code).toBe('CURRENCY_LOCKED');
    // Other settings still change.
    expect((await owner.call('PATCH', `/groups/${code}`, { roundTo: 100 })).status).toBe(200);
  });

  it('does not let members change the currency', async () => {
    const { code } = (await create({})).json;
    const guest = new Browser(env.env);
    await guest.call('POST', `/groups/${code}/members`, { name: 'Sam', claim: true });
    const res = await guest.call('PATCH', `/groups/${code}`, { currency: 'USD' });
    expect(res.status).toBe(403);
    expect(res.json.code).toBe('OWNER_ONLY');
  });
});
