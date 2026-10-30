import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { ErrorBody } from '../../shared/errors';
import type { CreateGroupResponse, GroupDto, NewExpense } from '../../shared/types';
import { createApp, type Env } from '../../worker/app';
import { Browser, createTestEnv, signIn } from './helpers';

// group_live_updates: every write under /groups/:code signals the group's live pages once; refused writes and reads
// do not. The fake GROUP_LIVE binding records the group codes that were signalled.

const ROUTES = join(import.meta.dirname, '../../worker/routes');
// Every route file mounted under /groups, read from the folder so a new file is covered without editing this list.
// account.ts and myGroups.ts are outside /groups/:code; live.ts has only the GET endpoint.
const NOT_GROUP_WRITES = new Set(['account.ts', 'myGroups.ts', 'live.ts']);
const ROUTE_FILES = readdirSync(ROUTES).filter((f) => f.endsWith('.ts') && !NOT_GROUP_WRITES.has(f));

/** A 1x1 PNG: valid magic bytes for a receipt upload. */
const PNG = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='),
  (ch) => ch.charCodeAt(0),
);

function fakeLive() {
  const signals: string[] = [];
  const connects: string[] = [];
  const binding = {
    idFromName: (name: string) => name,
    get: (id: string) => ({
      fetch: async (input: string | Request) => {
        const url = typeof input === 'string' ? input : input.url;
        if (url.endsWith('/notify')) {
          signals.push(id);
          return new Response(null, { status: 204 });
        }
        connects.push(id);
        return new Response('connected', { status: 200 });
      },
    }),
  };
  return { binding: binding as unknown as DurableObjectNamespace, signals, connects };
}

const expense = (payerId: string, otherId: string, amount: number): NewExpense =>
  ({
    payerId,
    amount,
    description: 'Lunch',
    spentOn: '2026-10-10',
    splitMode: 'equal',
    participants: [{ memberId: payerId }, { memberId: otherId }],
  }) as NewExpense;

interface World {
  env: Env;
  live: ReturnType<typeof fakeLive>;
  code: string;
  ownerKey: string;
  owner: Browser;
  sam: Browser;
  ownerId: string;
  samId: string;
  jamieId: string;
  expenseId: string;
  transferId: string;
  /** Set by the prepare step of a case that needs a session or a receipt photo. */
  sessionId: string;
  attachmentId: string;
  g: string;
}

// Each test starts its own Miniflare database and makes several requests; the default 5 s is too short for that.
const SLOW_TEST_MS = 30_000;

const databases: { dispose: () => Promise<void> }[] = [];

afterEach(async () => {
  while (databases.length) await databases.pop()!.dispose();
});

/** A group created by an anonymous owner with Sam (joined on this device) and Jamie (added by name), and one expense. */
async function world(): Promise<World> {
  const db = await createTestEnv();
  databases.push(db);
  const live = fakeLive();
  const env: Env = { ...db.env, GROUP_LIVE: live.binding };

  const owner = new Browser(env);
  const created = (
    await owner.call<CreateGroupResponse>('POST', '/groups', { name: 'Trip', ownerName: 'Alex', currency: 'USD', roundTo: 1 })
  ).json;
  const code = created.code;
  const g = `/groups/${code}`;

  const sam = new Browser(env);
  const samId = (await sam.call<{ id: string }>('POST', `${g}/members`, { name: 'Sam', claim: true })).json.id;
  const jamieId = (await owner.call<{ id: string }>('POST', `${g}/members`, { name: 'Jamie' })).json.id;
  const ownerId = (await owner.call<GroupDto>('GET', g)).json.members.find((m) => m.isOwner)!.id;
  const expenseId = (await owner.call<{ id: string }>('POST', `${g}/expenses`, expense(ownerId, samId, 2000))).json.id;
  live.signals.length = 0;

  return {
    env,
    live,
    code,
    ownerKey: created.ownerKey as string,
    owner,
    sam,
    ownerId,
    samId,
    jamieId,
    expenseId,
    transferId: '',
    sessionId: '',
    attachmentId: '',
    g,
  };
}

type Res = { status: number; json: any };
interface Case {
  /** Runs before the signals are counted (set-up writes also signal, and are not what is tested). */
  prepare?: (w: World) => Promise<void>;
  write: (w: World) => Promise<Res>;
}

const SIGNED_IN_ALEX = 'alex@example.com';

/** A session body with no one present, so it needs no member ids. */
const SESSION = { day: '2026-10-10', startsAt: '19:00', endsAt: '21:00', presentIds: [] };

/** Every group write, by "METHOD /groups/:code..." as it appears in worker/routes. Add a route here when it is added. */
const CASES: Record<string, Case> = {
  'PATCH /groups/:code': {
    write: (w) => w.owner.call('PATCH', w.g, { name: 'Trip 2' }),
  },
  'POST /groups/:code/owner/claim': {
    write: async (w) => {
      const alex = new Browser(w.env);
      await signIn(alex, SIGNED_IN_ALEX);
      return alex.call('POST', `${w.g}/owner/claim`, { ownerKey: w.ownerKey });
    },
  },
  'POST /groups/:code/owner/attach': {
    write: async (w) => {
      await signIn(w.owner, SIGNED_IN_ALEX);
      return w.owner.call('POST', `${w.g}/owner/attach`);
    },
  },
  'POST /groups/:code/owner/transfer': {
    prepare: async (w) => {
      await signIn(w.owner, SIGNED_IN_ALEX);
      await w.owner.call('POST', `${w.g}/owner/attach`);
      await signIn(w.sam, 'sam@example.com');
      await w.sam.call('POST', `${w.g}/link`);
    },
    write: (w) => w.owner.call('POST', `${w.g}/owner/transfer`, { memberId: w.samId }),
  },
  'POST /groups/:code/lock': {
    write: async (w) => {
      await signIn(w.owner, SIGNED_IN_ALEX);
      return w.owner.call('POST', `${w.g}/lock`);
    },
  },
  'DELETE /groups/:code/lock': {
    prepare: async (w) => {
      await signIn(w.owner, SIGNED_IN_ALEX);
      await w.owner.call('POST', `${w.g}/lock`);
    },
    write: (w) => w.owner.call('DELETE', `${w.g}/lock`),
  },
  'POST /groups/:code/link': {
    write: async (w) => {
      await signIn(w.sam, 'sam@example.com');
      return w.sam.call('POST', `${w.g}/link`);
    },
  },
  'POST /groups/:code/members': {
    write: (w) => w.owner.call('POST', `${w.g}/members`, { name: 'Riley' }),
  },
  'POST /groups/:code/members/:id/claim': {
    write: (w) => new Browser(w.env).call('POST', `${w.g}/members/${w.jamieId}/claim`),
  },
  'PATCH /groups/:code/members/:id': {
    write: (w) => w.owner.call('PATCH', `${w.g}/members/${w.jamieId}`, { name: 'Jamie Lee' }),
  },
  'POST /groups/:code/members/:id/remove': {
    write: (w) => w.owner.call('POST', `${w.g}/members/${w.jamieId}/remove`, { reason: 'Left the trip' }),
  },
  'POST /groups/:code/members/:id/release': {
    prepare: async (w) => {
      await new Browser(w.env).call('POST', `${w.g}/members/${w.jamieId}/claim`);
    },
    write: (w) => w.owner.call('POST', `${w.g}/members/${w.jamieId}/release`),
  },
  'POST /groups/:code/expenses': {
    write: (w) => w.owner.call('POST', `${w.g}/expenses`, expense(w.ownerId, w.samId, 3000)),
  },
  'PATCH /groups/:code/expenses/:id': {
    write: (w) => w.owner.call('PATCH', `${w.g}/expenses/${w.expenseId}`, expense(w.ownerId, w.samId, 2500)),
  },
  'DELETE /groups/:code/expenses/:id': {
    write: (w) => w.owner.call('DELETE', `${w.g}/expenses/${w.expenseId}`),
  },
  'POST /groups/:code/expenses/:id/hide': {
    // Hiding is allowed only for a paid-toward expense (TAL-61): a confirmed transfer between its payer and a sharer.
    prepare: async (w) => {
      const sent = await w.owner.call<{ id: string }>('POST', `${w.g}/transfers`, {
        fromId: w.ownerId,
        toId: w.samId,
        amount: 1000,
      });
      await w.owner.call('POST', `${w.g}/transfers/${sent.json.id}/confirm`);
    },
    write: (w) => w.owner.call('POST', `${w.g}/expenses/${w.expenseId}/hide`, { hidden: true }),
  },
  'POST /groups/:code/expenses/:id/attachments': {
    write: (w) => w.owner.sendBytes('POST', `${w.g}/expenses/${w.expenseId}/attachments`, PNG, 'image/png'),
  },
  'DELETE /groups/:code/expenses/:id/attachments/:aid': {
    prepare: async (w) => {
      const sent = await w.owner.sendBytes('POST', `${w.g}/expenses/${w.expenseId}/attachments`, PNG, 'image/png');
      w.attachmentId = sent.json.id;
    },
    write: (w) => w.owner.call('DELETE', `${w.g}/expenses/${w.expenseId}/attachments/${w.attachmentId}`),
  },
  'POST /groups/:code/sessions': {
    write: (w) => w.owner.call('POST', `${w.g}/sessions`, SESSION),
  },
  'PATCH /groups/:code/sessions/:id': {
    prepare: async (w) => {
      w.sessionId = (await w.owner.call<{ id: string }>('POST', `${w.g}/sessions`, SESSION)).json.id;
    },
    write: (w) => w.owner.call('PATCH', `${w.g}/sessions/${w.sessionId}`, { endsAt: '22:00' }),
  },
  'DELETE /groups/:code/sessions/:id': {
    prepare: async (w) => {
      w.sessionId = (await w.owner.call<{ id: string }>('POST', `${w.g}/sessions`, SESSION)).json.id;
    },
    write: (w) => w.owner.call('DELETE', `${w.g}/sessions/${w.sessionId}`),
  },
  'POST /groups/:code/transfers': {
    write: (w) => w.sam.call('POST', `${w.g}/transfers`, { toId: w.ownerId, amount: 500 }),
  },
  'POST /groups/:code/leave': {
    // Sam owes nothing once the shared expense is gone, so the leave is allowed.
    prepare: (w) => w.owner.call('DELETE', `${w.g}/expenses/${w.expenseId}`).then(() => undefined),
    write: (w) => w.sam.call('POST', `${w.g}/leave`, {}),
  },
  'DELETE /groups/:code': {
    // The owner is alone once Sam and Jamie are removed; the expense goes first so both removals are settled.
    prepare: async (w) => {
      await w.owner.call('DELETE', `${w.g}/expenses/${w.expenseId}`);
      await w.owner.call('POST', `${w.g}/members/${w.samId}/remove`, {});
      await w.owner.call('POST', `${w.g}/members/${w.jamieId}/remove`, {});
    },
    write: (w) => w.owner.call('DELETE', w.g),
  },
  'POST /groups/:code/transfers/:id/confirm': {
    prepare: async (w) => {
      const sent = await w.sam.call<{ id: string }>('POST', `${w.g}/transfers`, { toId: w.ownerId, amount: 500 });
      w.transferId = sent.json.id;
    },
    write: (w) => w.owner.call('POST', `${w.g}/transfers/${w.transferId}/confirm`),
  },
};

/** The "METHOD /groups/:code..." keys of the group write routes, read from the route files. */
function routeKeys(): string[] {
  const keys = new Set<string>();
  for (const file of ROUTE_FILES) {
    const source = readFileSync(join(ROUTES, file), 'utf8');
    for (const match of source.matchAll(/\.(post|patch|delete)\(\s*'([^']*)'/g)) {
      const path = match[2];
      if (path === '/') continue; // POST /groups creates a group; it is not a write to an open group.
      keys.add(`${match[1].toUpperCase()} /groups${path.replace(/^\//, '/')}`);
    }
  }
  return [...keys].sort();
}

describe('live updates: every group write signals its group once', () => {
  it('the case list covers every group write route (a new route fails here until it is listed)', () => {
    expect(Object.keys(CASES).sort()).toEqual(routeKeys());
  });

  for (const [key, testCase] of Object.entries(CASES)) {
    it(`${key} signals its group once after a successful write`, async () => {
      const w = await world();
      if (testCase.prepare) await testCase.prepare(w);
      w.live.signals.length = 0;

      const res = await testCase.write(w);
      expect(res.status).toBeLessThan(300);
      expect(w.live.signals).toEqual([w.code]);
    }, SLOW_TEST_MS);
  }
});

describe('live updates: what does not signal', () => {
  it('a refused write (403 OWNER_ONLY) does not signal', async () => {
    const w = await world();
    w.live.signals.length = 0;
    const res = await w.sam.call<ErrorBody>('PATCH', w.g, { name: 'Nope' });
    expect(res.status).toBe(403);
    expect(w.live.signals).toEqual([]);
  }, SLOW_TEST_MS);

  it('a refused expense (400 PAYER_NOT_IN_GROUP) does not signal', async () => {
    const w = await world();
    w.live.signals.length = 0;
    const res = await w.owner.call<ErrorBody>('POST', `${w.g}/expenses`, expense('nobody', w.samId, 1000));
    expect(res.status).toBe(400);
    expect(res.json.code).toBe('PAYER_NOT_IN_GROUP');
    expect(w.live.signals).toEqual([]);
  }, SLOW_TEST_MS);

  it('a plain GET of the group does not signal', async () => {

    const w = await world();
    w.live.signals.length = 0;
    const res = await w.owner.call<GroupDto>('GET', w.g);
    expect(res.status).toBe(200);
    expect(w.live.signals).toEqual([]);
  }, SLOW_TEST_MS);

  it('creating a group does not signal', async () => {
    const w = await world();
    w.live.signals.length = 0;
    const res = await new Browser(w.env).call<CreateGroupResponse>('POST', '/groups', {
      name: 'Other',
      ownerName: 'Jamie',
      currency: 'USD',
      roundTo: 1,
    });
    expect(res.status).toBe(201);
    expect(w.live.signals).toEqual([]);
  }, SLOW_TEST_MS);
});

describe('live updates: the invite auto-link GET signals', () => {
  it('a signed-in invited account that is linked on GET signals once; the next GET does not', async () => {
    const w = await world();
    await w.owner.call('POST', `${w.g}/members`, { name: 'Riley', inviteEmail: 'riley@example.com' });
    const riley = new Browser(w.env);
    await signIn(riley, 'riley@example.com');
    w.live.signals.length = 0;

    const first = await riley.call<GroupDto>('GET', w.g);
    expect(first.json.me.accountLinked).toBe(true);
    expect(w.live.signals).toEqual([w.code]);

    w.live.signals.length = 0;
    await riley.call('GET', w.g);
    expect(w.live.signals).toEqual([]);
  }, SLOW_TEST_MS);
});

describe('live updates: account routes signal the groups that show the account', () => {
  it('PATCH /me signals the groups it owns and the groups where a member is linked to it, and no other group', async () => {
    const w = await world();
    const alex = new Browser(w.env);
    await signIn(alex, SIGNED_IN_ALEX);
    const owned = (await alex.call<CreateGroupResponse>('POST', '/groups', { name: 'Mine', ownerName: 'Alex', currency: 'USD', roundTo: 1 })).json.code;
    const joined = await w.owner.call<{ id: string }>('POST', `/groups/${w.code}/members`, { name: 'Taylor' });
    expect(joined.status).toBe(201);
    // Alex (signed in) claims Taylor's row: the group now shows Alex's account.
    const claimed = await alex.call('POST', `/groups/${w.code}/members/${joined.json.id}/claim`);
    expect(claimed.status).toBe(200);
    w.live.signals.length = 0;

    const res = await alex.call('PATCH', '/me', { name: 'Alexandra' });
    expect(res.status).toBe(200);
    expect([...w.live.signals].sort()).toEqual([owned, w.code].sort());
  }, SLOW_TEST_MS);

  it('DELETE /me signals the affected groups once each', async () => {
    const w = await world();
    const alex = new Browser(w.env);
    await signIn(alex, SIGNED_IN_ALEX);
    const owned = (await alex.call<CreateGroupResponse>('POST', '/groups', { name: 'Mine', ownerName: 'Alex', currency: 'USD', roundTo: 1 })).json.code;
    w.live.signals.length = 0;

    const res = await alex.call('DELETE', '/me');
    expect(res.status).toBe(200);
    expect(w.live.signals).toEqual([owned]);
  }, SLOW_TEST_MS);
});

describe('live updates: the optional binding and the live endpoint', () => {
  it('without the GROUP_LIVE binding the writes still succeed', async () => {
    const db = await createTestEnv();
    databases.push(db);
    const owner = new Browser(db.env);
    const created = (await owner.call<CreateGroupResponse>('POST', '/groups', { name: 'Solo', ownerName: 'Alex', currency: 'USD', roundTo: 1 })).json;
    const res = await owner.call('PATCH', `/groups/${created.code}`, { name: 'Solo 2' });
    expect(res.status).toBe(200);
  }, SLOW_TEST_MS);

  it('GET /live without an upgrade answers 404 NOT_FOUND', async () => {
    const w = await world();
    const res = await createApp().request(`http://localhost/api/groups/${w.code}/live`, {}, w.env);
    expect(res.status).toBe(404);
    expect(((await res.json()) as ErrorBody).code).toBe('NOT_FOUND');
  }, SLOW_TEST_MS);

  it('GET /live for an unknown code answers 404 GROUP_NOT_FOUND', async () => {
    const w = await world();
    const res = await createApp().request(
      'http://localhost/api/groups/aaaa-bbbb-cccc/live',
      { headers: { Upgrade: 'websocket' } },
      w.env,
    );
    expect(res.status).toBe(404);
    expect(((await res.json()) as ErrorBody).code).toBe('GROUP_NOT_FOUND');
  }, SLOW_TEST_MS);

  it('GET /live with an upgrade is forwarded to the group object and writes nothing', async () => {
    const w = await world();
    const res = await createApp().request(
      `http://localhost/api/groups/${w.code}/live`,
      { headers: { Upgrade: 'websocket' } },
      w.env,
    );
    expect(res.status).toBe(200);
    expect(w.live.connects).toEqual([w.code]);
    expect(w.live.signals).toEqual([]);
  }, SLOW_TEST_MS);

  it('GET /live with an upgrade but without the binding answers 404 NOT_FOUND', async () => {
    const db = await createTestEnv();
    databases.push(db);
    const owner = new Browser(db.env);
    const created = (await owner.call<CreateGroupResponse>('POST', '/groups', { name: 'Solo', ownerName: 'Alex', currency: 'USD', roundTo: 1 })).json;
    const res = await createApp().request(
      `http://localhost/api/groups/${created.code}/live`,
      { headers: { Upgrade: 'websocket' } },
      db.env,
    );
    expect(res.status).toBe(404);
    expect(((await res.json()) as ErrorBody).code).toBe('NOT_FOUND');
  }, SLOW_TEST_MS);
});
