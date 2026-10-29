import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { computeBalances } from '../../shared/settle';
import type { GroupDto } from '../../shared/types';
import { purgeInactiveGroups } from '../../worker/cleanup';
import { Browser, createTestEnv } from './helpers';

// attendance_split: sessions, their attendance, and the sessionId of an expense. Fake data only (synthetic names).
let env: Awaited<ReturnType<typeof createTestEnv>>;
let owner: Browser;
let sam: Browser;
let jamie: Browser;
let code: string;
let ids: { alex: string; sam: string; jamie: string };

const getGroup = (b: Browser) => b.call<GroupDto>('GET', `/groups/${code}`).then((r) => r.json);
const day = '2026-10-20';

const session = (presentIds: string[], extra: Record<string, unknown> = {}) => ({
  day,
  startsAt: '21:00',
  endsAt: '00:30',
  note: 'Practice',
  presentIds,
  ...extra,
});

const expense = (sessionId: string | null | undefined, payerId: string, participants: string[], extra = {}) => ({
  payerId,
  amount: 90_000,
  description: 'Court hire',
  spentOn: day,
  splitMode: 'equal' as const,
  participants: participants.map((memberId) => ({ memberId, weight: 1 })),
  ...(sessionId === undefined ? {} : { sessionId }),
  ...extra,
});

const balancesOf = (g: GroupDto) =>
  Object.fromEntries(computeBalances(g.members.map((m) => m.id), g.expenses, g.transfers));

const auditRows = async (action: string) =>
  (
    await env.env.DB.prepare('SELECT actor, target, details FROM audit_log WHERE group_code = ? AND action = ?')
      .bind(code, action)
      .all<{ actor: string; target: string; details: string | null }>()
  ).results;

beforeEach(async () => {
  env = await createTestEnv();
  owner = new Browser(env.env);
  sam = new Browser(env.env);
  jamie = new Browser(env.env);
  ({ code } = (await owner.call('POST', '/groups', { name: 'Weekly sport', ownerName: 'Alex' })).json);
  const samId = (await sam.call('POST', `/groups/${code}/members`, { name: 'Sam', claim: true })).json.id;
  const jamieId = (await owner.call('POST', `/groups/${code}/members`, { name: 'Jamie' })).json.id;
  await jamie.call('POST', `/groups/${code}/members/${jamieId}/claim`);
  ids = { alex: (await getGroup(owner)).members.find((m) => m.isOwner)!.id, sam: samId, jamie: jamieId };
});

afterEach(async () => {
  await env.dispose();
});

describe('sessions API', () => {
  it('the owner creates a session with attendance; a member gets 403 OWNER_ONLY', async () => {
    const created = await owner.call<{ id: string }>('POST', `/groups/${code}/sessions`, session([ids.sam, ids.jamie]));
    expect(created.status).toBe(201);

    const denied = await sam.call('POST', `/groups/${code}/sessions`, session([ids.sam]));
    expect(denied.status).toBe(403);
    expect(denied.json.code).toBe('OWNER_ONLY');

    const g = await getGroup(owner);
    expect(g.sessions).toHaveLength(1);
    expect([...g.sessions[0].presentIds].sort()).toEqual([ids.sam, ids.jamie].sort());
    expect(g.sessions[0].endsAt).toBe('00:30');
    expect(await auditRows('session.add')).toHaveLength(1);
  });

  it('rejects equal or malformed times with INVALID_SESSION_TIME', async () => {
    const equal = await owner.call('POST', `/groups/${code}/sessions`, session([], { startsAt: '09:00', endsAt: '09:00' }));
    expect(equal.status).toBe(400);
    expect(equal.json.code).toBe('INVALID_SESSION_TIME');

    const badFormat = await owner.call('POST', `/groups/${code}/sessions`, session([], { startsAt: '24:00' }));
    expect(badFormat.json.code).toBe('INVALID_SESSION_TIME');

    const nonString = await owner.call('POST', `/groups/${code}/sessions`, session([], { startsAt: 900 }));
    expect(nonString.json.code).toBe('INVALID_SESSION_TIME');
  });

  it('a removed member cannot be newly marked present: 400 PARTICIPANT_NOT_IN_GROUP', async () => {
    expect((await owner.call('POST', `/groups/${code}/members/${ids.jamie}/remove`, {})).status).toBe(200);
    const res = await owner.call('POST', `/groups/${code}/sessions`, session([ids.sam, ids.jamie]));
    expect(res.status).toBe(400);
    expect(res.json.code).toBe('PARTICIPANT_NOT_IN_GROUP');
  });

  it('a non-string present id is refused; duplicates are counted once', async () => {
    const bad = await owner.call('POST', `/groups/${code}/sessions`, session([42 as unknown as string]));
    expect(bad.json.code).toBe('PARTICIPANT_NOT_IN_GROUP');

    const dup = await owner.call<{ id: string }>('POST', `/groups/${code}/sessions`, session([ids.sam, ids.sam]));
    expect(dup.status).toBe(201);
    expect((await getGroup(owner)).sessions[0].presentIds).toEqual([ids.sam]);
  });

  it('GET returns sessions sorted by day (newest first), then start time', async () => {
    await owner.call('POST', `/groups/${code}/sessions`, session([ids.sam], { day: '2026-10-19', startsAt: '19:00', endsAt: '20:00' }));
    await owner.call('POST', `/groups/${code}/sessions`, session([ids.sam], { day: '2026-10-20', startsAt: '19:00', endsAt: '20:00' }));
    await owner.call('POST', `/groups/${code}/sessions`, session([ids.sam], { day: '2026-10-20', startsAt: '21:00', endsAt: '00:30' }));
    const order = (await getGroup(owner)).sessions.map((s) => `${s.day} ${s.startsAt}`);
    expect(order).toEqual(['2026-10-20 21:00', '2026-10-20 19:00', '2026-10-19 19:00']);
  });

  it('a PATCH that repeats the stored values answers changed: false and records nothing', async () => {
    const { id } = (await owner.call<{ id: string }>('POST', `/groups/${code}/sessions`, session([ids.sam]))).json;
    const before = (await auditRows('session.update')).length;

    const same = await owner.call('PATCH', `/groups/${code}/sessions/${id}`, {
      day,
      startsAt: '21:00',
      endsAt: '00:30',
      note: 'Practice',
      presentIds: [ids.sam],
    });
    expect(same.json).toEqual({ ok: true, changed: false });
    expect((await auditRows('session.update')).length).toBe(before);
  });

  it('a real PATCH answers changed: true and records session.update with the previous values', async () => {
    const { id } = (await owner.call<{ id: string }>('POST', `/groups/${code}/sessions`, session([ids.sam]))).json;
    const res = await owner.call('PATCH', `/groups/${code}/sessions/${id}`, { note: 'Practice (indoor)' });
    expect(res.json).toEqual({ ok: true, changed: true });
    const rows = await auditRows('session.update');
    expect(rows).toHaveLength(1);
    expect(JSON.parse(rows[0].details!).previous.note).toBe('Practice');
  });

  it('a PATCH of an unknown session answers 404 SESSION_NOT_FOUND', async () => {
    const res = await owner.call('PATCH', `/groups/${code}/sessions/missing`, { note: 'x' });
    expect(res.status).toBe(404);
    expect(res.json.code).toBe('SESSION_NOT_FOUND');
  });

  it('editing a past session keeps a removed member who was present, but cannot add one', async () => {
    const { id } = (await owner.call<{ id: string }>('POST', `/groups/${code}/sessions`, session([ids.sam, ids.jamie]))).json;
    const casey = (await owner.call('POST', `/groups/${code}/members`, { name: 'Casey' })).json.id;
    expect((await owner.call('POST', `/groups/${code}/members/${ids.jamie}/remove`, {})).status).toBe(200);
    expect((await owner.call('POST', `/groups/${code}/members/${casey}/remove`, {})).status).toBe(200);

    // Only the note changes; the form sends only active members, so Jamie is not in presentIds.
    const patch = await owner.call('PATCH', `/groups/${code}/sessions/${id}`, {
      note: 'Practice (indoor)',
      presentIds: [ids.sam],
    });
    expect(patch.status).toBe(200);
    let s = (await getGroup(owner)).sessions[0];
    expect([...s.presentIds].sort()).toEqual([ids.sam, ids.jamie].sort());

    // A removed member who was never present cannot be added.
    const add = await owner.call('PATCH', `/groups/${code}/sessions/${id}`, { presentIds: [ids.sam, casey] });
    expect(add.status).toBe(400);
    expect(add.json.code).toBe('PARTICIPANT_NOT_IN_GROUP');
    s = (await getGroup(owner)).sessions[0];
    expect([...s.presentIds].sort()).toEqual([ids.sam, ids.jamie].sort());
  }, 30_000);

  it('DELETE of a session with a live cost: 409 SESSION_HAS_EXPENSES; after deleting the cost: 200', async () => {
    const { id } = (await owner.call<{ id: string }>('POST', `/groups/${code}/sessions`, session([ids.alex, ids.sam]))).json;
    const exp = await sam.call<{ id: string }>('POST', `/groups/${code}/expenses`, expense(id, ids.sam, [ids.alex, ids.sam]));
    expect(exp.status).toBe(201);

    const blocked = await owner.call('DELETE', `/groups/${code}/sessions/${id}`);
    expect(blocked.status).toBe(409);
    expect(blocked.json.code).toBe('SESSION_HAS_EXPENSES');

    expect((await sam.call('DELETE', `/groups/${code}/expenses/${exp.json.id}`)).status).toBe(200);
    expect((await owner.call('DELETE', `/groups/${code}/sessions/${id}`)).status).toBe(200);
    expect((await getGroup(owner)).sessions).toHaveLength(0);
  });

  it('DELETE race guard: a cost inserted after the check keeps the session (direct SQL)', async () => {
    const { id } = (await owner.call<{ id: string }>('POST', `/groups/${code}/sessions`, session([ids.sam]))).json;
    // A live expense that references the session, inserted directly, as if another request wrote it meanwhile.
    await env.env.DB.prepare(
      `INSERT INTO expenses (id, group_code, payer_id, amount, description, spent_on, split_mode, session_id, created_by, created_at)
       VALUES ('race-exp', ?, ?, 1000, 'Late cost', ?, 'equal', ?, ?, '2026-10-21T00:00:00.000Z')`,
    )
      .bind(code, ids.sam, day, id, ids.sam)
      .run();
    await env.env.DB.prepare(
      `INSERT INTO expense_shares (expense_id, member_id, weight, amount) VALUES ('race-exp', ?, 1, 1000)`,
    )
      .bind(ids.sam)
      .run();

    const res = await owner.call('DELETE', `/groups/${code}/sessions/${id}`);
    expect(res.status).toBe(409);
    expect(res.json.code).toBe('SESSION_HAS_EXPENSES');
    expect((await getGroup(owner)).sessions).toHaveLength(1);
  });

  it('a purge of the group removes its sessions and attendance by cascade', async () => {
    await owner.call('POST', `/groups/${code}/sessions`, session([ids.sam, ids.jamie]));
    const count = (table: string) =>
      env.env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${table === 'attendance' ? 'session_id IN (SELECT id FROM group_sessions WHERE group_code = ?)' : 'group_code = ?'}`)
        .bind(code)
        .first<{ n: number }>()
        .then((r) => r!.n);
    expect(await count('group_sessions')).toBe(1);
    expect(await count('attendance')).toBe(2);

    await env.env.DB.prepare('UPDATE groups SET last_activity_at = ? WHERE code = ?')
      .bind('2000-01-01T00:00:00.000Z', code)
      .run();
    await purgeInactiveGroups(env.env.DB, new Date('2026-10-29T00:00:00.000Z'));

    expect((await env.env.DB.prepare('SELECT COUNT(*) AS n FROM group_sessions WHERE group_code = ?').bind(code).first<{ n: number }>())!.n).toBe(0);
    expect((await env.env.DB.prepare('SELECT COUNT(*) AS n FROM attendance').first<{ n: number }>())!.n).toBe(0);
  });
});

describe('expense sessionId', () => {
  it('a session of another group is refused with 400 SESSION_NOT_FOUND', async () => {
    const other = new Browser(env.env);
    const { code: otherCode } = (await other.call('POST', '/groups', { name: 'Other', ownerName: 'Casey' })).json;
    const { id: foreign } = (await other.call<{ id: string }>('POST', `/groups/${otherCode}/sessions`, session([]))).json;

    const res = await owner.call('POST', `/groups/${code}/expenses`, expense(foreign, ids.sam, [ids.sam]));
    expect(res.status).toBe(400);
    expect(res.json.code).toBe('SESSION_NOT_FOUND');
  });

  it('a valid sessionId is stored and returned; an edit keeps or clears it', async () => {
    const { id } = (await owner.call<{ id: string }>('POST', `/groups/${code}/sessions`, session([ids.sam]))).json;
    const created = await sam.call<{ id: string }>('POST', `/groups/${code}/expenses`, expense(id, ids.sam, [ids.sam]));
    expect(created.status).toBe(201);
    let e = (await getGroup(owner)).expenses[0];
    expect(e.sessionId).toBe(id);

    // Resending the same session keeps it.
    const kept = await sam.call('PATCH', `/groups/${code}/expenses/${created.json.id}`, expense(id, ids.sam, [ids.sam], { description: 'Court' }));
    expect(kept.json.changed).toBe(true);
    expect((await getGroup(owner)).expenses[0].sessionId).toBe(id);

    // Clearing it sets null.
    await sam.call('PATCH', `/groups/${code}/expenses/${created.json.id}`, expense(null, ids.sam, [ids.sam], { description: 'Court' }));
    e = (await getGroup(owner)).expenses[0];
    expect(e.sessionId).toBeNull();
  });

  it('a session-only change sets editedAt and keeps the stored shares', async () => {
    const { id } = (await owner.call<{ id: string }>('POST', `/groups/${code}/sessions`, session([ids.sam, ids.jamie]))).json;
    const created = await sam.call<{ id: string }>('POST', `/groups/${code}/expenses`, expense(null, ids.sam, [ids.sam, ids.jamie]));
    const before = (await getGroup(owner)).expenses[0];

    const res = await sam.call('PATCH', `/groups/${code}/expenses/${created.json.id}`, expense(id, ids.sam, [ids.sam, ids.jamie]));
    expect(res.json).toEqual({ id: created.json.id, sharesChanged: false, changed: true });
    const after = (await getGroup(owner)).expenses[0];
    expect(after.editedAt).not.toBeNull();
    expect(after.shares).toEqual(before.shares);
    expect(await auditRows('expense.edit')).toHaveLength(1);
  });

  it('an exact-split and a weighted session cost balance like the same expense without a session', async () => {
    const { id } = (await owner.call<{ id: string }>('POST', `/groups/${code}/sessions`, session([ids.alex, ids.sam, ids.jamie]))).json;

    const exact = {
      payerId: ids.alex,
      amount: 90_000,
      description: 'Shuttlecocks',
      spentOn: day,
      splitMode: 'exact' as const,
      participants: [
        { memberId: ids.alex, amount: 30_000 },
        { memberId: ids.sam, amount: 40_000 },
        { memberId: ids.jamie, amount: 20_000 },
      ],
    };
    const weighted = {
      payerId: ids.sam,
      amount: 60_000,
      description: 'Drinks',
      spentOn: day,
      splitMode: 'weight' as const,
      participants: [
        { memberId: ids.alex, weight: 1 },
        { memberId: ids.sam, weight: 2 },
      ],
    };

    expect((await owner.call('POST', `/groups/${code}/expenses`, { ...exact, sessionId: id })).status).toBe(201);
    expect((await owner.call('POST', `/groups/${code}/expenses`, { ...weighted, sessionId: id })).status).toBe(201);
    const withSession = await getGroup(owner);
    expect(withSession.expenses.every((e) => e.sessionId === id)).toBe(true);

    // The same two expenses without a session produce the same balances.
    const ledger = withSession.expenses.map((e) => ({ ...e, sessionId: null }));
    expect(balancesOf({ ...withSession, expenses: ledger })).toEqual(balancesOf(withSession));
  });

  it('changing the attendance afterwards leaves the shares of session costs untouched', async () => {
    const { id } = (await owner.call<{ id: string }>('POST', `/groups/${code}/sessions`, session([ids.alex, ids.sam, ids.jamie]))).json;
    await owner.call('POST', `/groups/${code}/expenses`, expense(id, ids.alex, [ids.alex, ids.sam, ids.jamie]));
    const before = (await getGroup(owner)).expenses[0].shares;

    await owner.call('PATCH', `/groups/${code}/sessions/${id}`, { presentIds: [ids.alex] });
    const after = (await getGroup(owner)).expenses[0];
    expect(after.shares).toEqual(before);
    expect(after.sessionId).toBe(id);
  });

  it('a session cost is edited with PATCH and keeps its sessionId when the client resends it', async () => {
    const { id } = (await owner.call<{ id: string }>('POST', `/groups/${code}/sessions`, session([ids.alex, ids.sam]))).json;
    const created = await owner.call<{ id: string }>('POST', `/groups/${code}/expenses`, expense(id, ids.alex, [ids.alex, ids.sam]));

    const res = await owner.call('PATCH', `/groups/${code}/expenses/${created.json.id}`, expense(id, ids.alex, [ids.alex, ids.sam], { amount: 120_000 }));
    expect(res.json.changed).toBe(true);
    const e = (await getGroup(owner)).expenses[0];
    expect(e.amount).toBe(120_000);
    expect(e.sessionId).toBe(id);
  });
});
