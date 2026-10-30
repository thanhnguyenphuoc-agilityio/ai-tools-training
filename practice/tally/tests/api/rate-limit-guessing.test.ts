import { Miniflare } from 'miniflare';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ErrorBody } from '../../shared/errors';
import type { CreateGroupResponse, GroupDto } from '../../shared/types';
import type { Env } from '../../worker/app';
import { Browser, createTestEnv } from './helpers';

// rate_limit_guessing: failed group lookups and owner key attempts are throttled per client through the
// GUESS_LIMITER binding (Miniflare's emulation of the Workers Rate Limiting binding, same shape as wrangler.jsonc).

const LIMIT = 3;
const MISSING = '/groups/2222-2222-2222';

let base: Awaited<ReturnType<typeof createTestEnv>>;
let limiterMf: Miniflare;
let env: Env;

beforeEach(async () => {
  base = await createTestEnv();
  limiterMf = new Miniflare({
    modules: true,
    script: 'export default {}',
    ratelimits: { GUESS_LIMITER: { namespace_id: '1001', simple: { limit: LIMIT, period: 60 } } },
  });
  const { GUESS_LIMITER } = await limiterMf.getBindings<{ GUESS_LIMITER: RateLimit }>();
  env = { ...base.env, GUESS_LIMITER };
});

afterEach(async () => {
  await limiterMf.dispose();
  await base.dispose();
});

const from = (ip: string) => ({ 'cf-connecting-ip': ip });

async function createGroup(browser: Browser) {
  const res = await browser.call<CreateGroupResponse>('POST', '/groups', {
    name: 'Trip',
    ownerName: 'Alex',
    currency: 'USD',
    roundTo: 1,
  });
  expect(res.status).toBe(201);
  return res.json;
}

describe('rate_limit_guessing API', () => {
  it('RL-1: unknown group codes answer 404 up to the limit, then 429 TOO_MANY_ATTEMPTS', async () => {
    const guesser = new Browser(env);
    for (let i = 0; i < LIMIT; i++) {
      const res = await guesser.call<ErrorBody>('GET', MISSING, undefined, from('192.0.2.1'));
      expect(res.status).toBe(404);
      expect(res.json.code).toBe('GROUP_NOT_FOUND');
    }
    const over = await guesser.call<ErrorBody>('GET', MISSING, undefined, from('192.0.2.1'));
    expect(over.status).toBe(429);
    expect(over.json.code).toBe('TOO_MANY_ATTEMPTS');
  });

  it('RL-2: malformed codes and other routes that load a group count too', async () => {
    const guesser = new Browser(env);
    await guesser.call('GET', '/groups/not-a-code', undefined, from('192.0.2.2'));
    await guesser.call('POST', `${MISSING}/expenses`, {}, from('192.0.2.2'));
    await guesser.call('GET', `${MISSING}/live`, undefined, from('192.0.2.2'));
    const over = await guesser.call<ErrorBody>('POST', `${MISSING}/members`, { name: 'Sam' }, from('192.0.2.2'));
    expect(over.status).toBe(429);
  });

  it('RL-3: another client is not affected, and viewing an existing group never counts', async () => {
    const owner = new Browser(env);
    const { code } = await createGroup(owner);
    for (let i = 0; i < LIMIT + 3; i++) {
      const res = await owner.call<GroupDto>('GET', `/groups/${code}`, undefined, from('192.0.2.3'));
      expect(res.status).toBe(200);
    }
    const guesser = new Browser(env);
    for (let i = 0; i <= LIMIT; i++) await guesser.call('GET', MISSING, undefined, from('192.0.2.4'));
    const other = await new Browser(env).call<ErrorBody>('GET', MISSING, undefined, from('192.0.2.5'));
    expect(other.status).toBe(404);
    const stillOk = await owner.call('GET', `/groups/${code}`, undefined, from('192.0.2.4'));
    expect(stillOk.status).toBe(200);
  }, 20_000);

  it('RL-4: wrong owner keys answer 403 up to the limit, then 429; the right key works for another client', async () => {
    const owner = new Browser(env);
    const { code, ownerKey } = await createGroup(owner);
    const guesser = new Browser(env);
    for (let i = 0; i < LIMIT; i++) {
      const res = await guesser.call<ErrorBody>(
        'POST',
        `/groups/${code}/owner/claim`,
        { ownerKey: `wrong-${i}` },
        from('192.0.2.6'),
      );
      expect(res.json.code).toBe('WRONG_OWNER_KEY');
    }
    const over = await guesser.call<ErrorBody>(
      'POST',
      `/groups/${code}/owner/claim`,
      { ownerKey: 'wrong-again' },
      from('192.0.2.6'),
    );
    expect(over.status).toBe(429);
    expect(over.json.code).toBe('TOO_MANY_ATTEMPTS');

    const rightful = await new Browser(env).call('POST', `/groups/${code}/owner/claim`, { ownerKey }, from('192.0.2.7'));
    expect(rightful.status).toBe(200);
  });

  it('RL-5: owner key failures and lookup failures are counted separately', async () => {
    const owner = new Browser(env);
    const { code } = await createGroup(owner);
    const guesser = new Browser(env);
    for (let i = 0; i <= LIMIT; i++) await guesser.call('GET', MISSING, undefined, from('192.0.2.8'));
    const claim = await guesser.call<ErrorBody>(
      'POST',
      `/groups/${code}/owner/claim`,
      { ownerKey: 'wrong' },
      from('192.0.2.8'),
    );
    expect(claim.json.code).toBe('WRONG_OWNER_KEY');
  });

  it('RL-6: without the binding nothing is limited', async () => {
    const guesser = new Browser(base.env);
    for (let i = 0; i < LIMIT + 3; i++) {
      const res = await guesser.call('GET', MISSING, undefined, from('192.0.2.9'));
      expect(res.status).toBe(404);
    }
  });

  it('RL-7: every API answer sends Referrer-Policy: same-origin', async () => {
    const res = await new Browser(env).fetchRaw('/health');
    expect(res.headers.get('referrer-policy')).toBe('same-origin');
    const missing = await new Browser(env).fetchRaw(MISSING);
    expect(missing.headers.get('referrer-policy')).toBe('same-origin');
  });
});
