import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { GroupDto } from '../../shared/types';
import { Browser, createTestEnv } from './helpers';

let env: Awaited<ReturnType<typeof createTestEnv>>;
let owner: Browser;
let code: string;
let ownerKey: string;

beforeEach(async () => {
  env = await createTestEnv();
  owner = new Browser(env.env);
  const res = await owner.call('POST', '/groups', { name: 'Weekend trip', ownerName: 'Alex', roundTo: 1000 });
  expect(res.status).toBe(201);
  ({ code, ownerKey } = res.json);
});

afterEach(async () => {
  await env.dispose();
});

const getGroup = (b: Browser) => b.call<GroupDto>('GET', `/groups/${code}`).then((r) => r.json);

describe('groups', () => {
  it('creates a group whose creator is owner and first member', async () => {
    expect(code).toMatch(/^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);
    const group = await getGroup(owner);
    expect(group.name).toBe('Weekend trip');
    expect(group.members).toHaveLength(1);
    expect(group.me.isOwner).toBe(true);
    expect(group.me.memberId).toBe(group.members[0].id);
  });

  it('lets anyone with the link view, but not as a member', async () => {
    const guest = new Browser(env.env);
    const group = await getGroup(guest);
    expect(group.me).toEqual({ memberId: null, isOwner: false, accountLinked: false });
  });

  it('returns 404 for unknown or malformed codes', async () => {
    expect((await owner.call('GET', '/groups/2222-2222-2222')).status).toBe(404);
    expect((await owner.call('GET', '/groups/not-a-code')).status).toBe(404);
  });

  it('recovers owner access on a new device with the owner key only', async () => {
    const laptop = new Browser(env.env);
    expect((await laptop.call('POST', `/groups/${code}/owner/claim`, { ownerKey: 'wrong' })).status).toBe(403);
    expect((await laptop.call('POST', `/groups/${code}/owner/claim`, { ownerKey })).status).toBe(200);
    const group = await getGroup(laptop);
    expect(group.me.isOwner).toBe(true);
    expect(group.me.memberId).toBe(group.members[0].id);
  });

  it('only lets the owner rename the group', async () => {
    const guest = new Browser(env.env);
    await guest.call('POST', `/groups/${code}/members`, { name: 'Sam', claim: true });
    expect((await guest.call('PATCH', `/groups/${code}`, { name: 'Hacked' })).status).toBe(403);
    expect((await owner.call('PATCH', `/groups/${code}`, { name: 'Weekend trip, day 2' })).status).toBe(200);
    expect((await getGroup(owner)).name).toBe('Weekend trip, day 2');
  });
});

describe('members', () => {
  it('lists members in the order they joined', async () => {
    for (const name of ['Sam', 'jamie', 'Casey']) {
      expect((await owner.call('POST', `/groups/${code}/members`, { name })).status).toBe(201);
    }
    expect((await getGroup(owner)).members.map((m) => m.name)).toEqual(['Alex', 'Sam', 'jamie', 'Casey']);
  });

  it('joins with claim=true and gets a device identity', async () => {
    const sam = new Browser(env.env);
    const { status, json } = await sam.call('POST', `/groups/${code}/members`, { name: 'Sam', claim: true });
    expect(status).toBe(201);
    expect((await getGroup(sam)).me).toEqual({ memberId: json.id, isOwner: false, accountLinked: false });
  });

  it('lets a member add someone by name, who can claim it once', async () => {
    const { json } = await owner.call('POST', `/groups/${code}/members`, { name: 'Jamie' });
    const jamie = new Browser(env.env);
    expect((await jamie.call('POST', `/groups/${code}/members/${json.id}/claim`)).status).toBe(200);
    expect((await getGroup(jamie)).me.memberId).toBe(json.id);
    const impostor = new Browser(env.env);
    expect((await impostor.call('POST', `/groups/${code}/members/${json.id}/claim`)).status).toBe(409);
  });

  it('lets only one of two simultaneous claims win', async () => {
    const { json } = await owner.call('POST', `/groups/${code}/members`, { name: 'Morgan' });
    const [a, b] = [new Browser(env.env), new Browser(env.env)];
    const statuses = await Promise.all(
      [a, b].map(async (device) => (await device.call('POST', `/groups/${code}/members/${json.id}/claim`)).status),
    );
    expect(statuses.sort()).toEqual([200, 409]);
  });

  it('rejects adding by name without being a member, and duplicate names', async () => {
    const guest = new Browser(env.env);
    expect((await guest.call('POST', `/groups/${code}/members`, { name: 'Jamie' })).status).toBe(401);
    expect((await owner.call('POST', `/groups/${code}/members`, { name: 'alex' })).status).toBe(409);
  });

  it('lets members edit only their own bank details', async () => {
    const sam = new Browser(env.env);
    const { json } = await sam.call('POST', `/groups/${code}/members`, { name: 'Sam', claim: true });
    const ownerId = (await getGroup(owner)).members[0].id;

    const bank = { bankBin: '970436', accountNo: '0123456789', accountName: 'SAM TAYLOR' };
    expect((await sam.call('PATCH', `/groups/${code}/members/${json.id}`, bank)).status).toBe(200);
    expect((await sam.call('PATCH', `/groups/${code}/members/${ownerId}`, bank)).status).toBe(403);
    expect((await sam.call('PATCH', `/groups/${code}/members/${json.id}`, { bankBin: '123456' })).status).toBe(400);

    const me = (await getGroup(owner)).members.find((m) => m.id === json.id)!;
    expect(me.accountNo).toBe('0123456789');
  });
});
describe('owner acting for another member (owner_member_tools)', () => {
  const bank = { bankBin: '970436', accountNo: '0123456789', accountName: 'JAMIE' };

  // Sam claims a device; Jamie is added by name and never opens the app.
  async function addSamAndJamie() {
    const sam = new Browser(env.env);
    const { json: samRes } = await sam.call('POST', `/groups/${code}/members`, { name: 'Sam', claim: true });
    const { json: jamieRes } = await owner.call('POST', `/groups/${code}/members`, { name: 'Jamie' });
    const ownerId = (await getGroup(owner)).members[0].id;
    return { sam, samId: samRes.id as string, jamieId: jamieRes.id as string, ownerId };
  }

  it('lets the owner edit another member bank: 200 and the account is stored', async () => {
    const { jamieId } = await addSamAndJamie();
    expect((await owner.call('PATCH', `/groups/${code}/members/${jamieId}`, bank)).status).toBe(200);
    const jamie = (await getGroup(owner)).members.find((m) => m.id === jamieId)!;
    expect(jamie.accountNo).toBe('0123456789');
  });

  it('refuses a plain member editing another member bank: 403 EDIT_SELF_ONLY', async () => {
    const { sam, jamieId } = await addSamAndJamie();
    const res = await sam.call('PATCH', `/groups/${code}/members/${jamieId}`, bank);
    expect(res.status).toBe(403);
    expect(res.json.code).toBe('EDIT_SELF_ONLY');
  });

  it('lets the owner record a transfer between two other members and stores fromId', async () => {
    const { samId, jamieId } = await addSamAndJamie();
    const res = await owner.call('POST', `/groups/${code}/transfers`, { fromId: samId, toId: jamieId, amount: 50000 });
    expect(res.status).toBe(201);
    const transfer = (await getGroup(owner)).transfers.find((t) => t.id === res.json.id)!;
    expect(transfer.fromId).toBe(samId);
    expect(transfer.toId).toBe(jamieId);
  });

  it('refuses a plain member recording someone else transfer: 403 TRANSFER_SELF_ONLY', async () => {
    const { sam, jamieId, ownerId } = await addSamAndJamie();
    const res = await sam.call('POST', `/groups/${code}/transfers`, { fromId: jamieId, toId: ownerId, amount: 50000 });
    expect(res.status).toBe(403);
    expect(res.json.code).toBe('TRANSFER_SELF_ONLY');
  });

  it('refuses the owner editing a removed member: 409 MEMBER_REMOVED', async () => {
    const { jamieId } = await addSamAndJamie();
    expect((await owner.call('POST', `/groups/${code}/members/${jamieId}/remove`, {})).status).toBe(200);
    const res = await owner.call('PATCH', `/groups/${code}/members/${jamieId}`, bank);
    expect(res.status).toBe(409);
    expect(res.json.code).toBe('MEMBER_REMOVED');
  });
});
