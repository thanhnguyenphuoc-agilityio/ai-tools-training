import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CreateGroupResponse, ExpenseDto, GroupDto } from '../../shared/types';
import { purgeInactiveGroups } from '../../worker/cleanup';
import { Browser, createTestEnv, signIn } from './helpers';

// receipt_photos: one optional photo per expense. Bytes live in R2 (binding RECEIPTS); rows in expense_attachments.
// Fake data only: synthetic names (Alex, Sam, Jamie) and fake accounts.

const PNG_HEADER = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_HEADER = [0xff, 0xd8, 0xff, 0xe0];
const WEBP_HEADER = [0x52, 0x49, 0x46, 0x46, 0x10, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50];

/** A small image: the magic bytes of `header`, then filler. */
function image(header: number[], size = 64): Uint8Array {
  const bytes = new Uint8Array(size).fill(7);
  bytes.set(header, 0);
  return bytes;
}

let env: Awaited<ReturnType<typeof createTestEnv>>;
let owner: Browser;
let sam: Browser;
let jamie: Browser;
let code: string;
let ids: { owner: string; sam: string; jamie: string };

const getGroup = (b: Browser) => b.call<GroupDto>('GET', `/groups/${code}`).then((r) => r.json);

const addExpense = (b: Browser, payerId: string, participantIds: string[], description = 'Dinner') =>
  b.call<{ id: string }>('POST', `/groups/${code}/expenses`, {
    payerId,
    amount: 90_000,
    description,
    spentOn: '2026-10-10',
    splitMode: 'equal',
    participants: participantIds.map((memberId) => ({ memberId, weight: 1 })),
  });

const attachmentsUrl = (expenseId: string) => `/groups/${code}/expenses/${expenseId}/attachments`;

/** Keys of every object stored for the group in R2. */
const r2KeysOf = async (groupCode: string) =>
  (await env.env.RECEIPTS.list({ prefix: `${groupCode}/` })).objects.map((o) => o.key);

beforeEach(async () => {
  env = await createTestEnv();
  owner = new Browser(env.env);
  sam = new Browser(env.env);
  jamie = new Browser(env.env);
  ({ code } = (
    await owner.call<CreateGroupResponse>('POST', '/groups', { name: 'Shared house', ownerName: 'Alex' })
  ).json);
  const samId = (await sam.call<{ id: string }>('POST', `/groups/${code}/members`, { name: 'Sam', claim: true })).json
    .id;
  const jamieId = (await jamie.call<{ id: string }>('POST', `/groups/${code}/members`, { name: 'Jamie', claim: true }))
    .json.id;
  const ownerId = (await getGroup(owner)).members.find((m) => m.isOwner)!.id;
  ids = { owner: ownerId, sam: samId, jamie: jamieId };
});

afterEach(async () => {
  await env.dispose();
});

describe('receipt photo upload and download', () => {
  it('round-trips PNG, JPEG and WebP with the stored content type', async () => {
    const { json: expense } = await addExpense(owner, ids.owner, [ids.owner, ids.sam]);
    for (const [header, type] of [
      [PNG_HEADER, 'image/png'],
      [JPEG_HEADER, 'image/jpeg'],
      [WEBP_HEADER, 'image/webp'],
    ] as const) {
      const bytes = image(header);
      const up = await owner.sendBytes('POST', attachmentsUrl(expense.id), bytes, type);
      expect(up.status).toBe(201);
      expect(up.json).toEqual({ id: expect.any(String), contentType: type, size: bytes.byteLength });

      const res = await owner.fetchRaw(`/groups/${code}/expenses/${expense.id}/attachments/${up.json.id}`);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe(type);
      expect(res.headers.get('x-content-type-options')).toBe('nosniff');
      expect(res.headers.get('content-disposition')).toBe('inline');
      expect(res.headers.get('cache-control')).toBe('private, max-age=3600');
      expect(new Uint8Array(await res.arrayBuffer())).toEqual(bytes);
    }
  });

  it('shows the receipt on the expense in the group ledger', async () => {
    const { json: expense } = await addExpense(owner, ids.owner, [ids.owner]);
    const up = await owner.sendBytes('POST', attachmentsUrl(expense.id), image(PNG_HEADER), 'image/png');
    const found = (await getGroup(owner)).expenses.find((e: ExpenseDto) => e.id === expense.id)!;
    expect(found.receipt).toEqual({ id: up.json.id, contentType: 'image/png', size: 64 });
  });

  it('lets the author and the owner attach, another member gets 403, a guest gets JOIN_FIRST', async () => {
    const { json: samExpense } = await addExpense(sam, ids.sam, [ids.sam, ids.owner]);
    const bytes = image(PNG_HEADER);

    expect((await sam.sendBytes('POST', attachmentsUrl(samExpense.id), bytes, 'image/png')).status).toBe(201);

    const byOther = await jamie.sendBytes('POST', attachmentsUrl(samExpense.id), bytes, 'image/png');
    expect(byOther.status).toBe(403);
    expect(byOther.json.code).toBe('EDIT_NOT_ALLOWED');

    const guest = new Browser(env.env);
    const byGuest = await guest.sendBytes('POST', attachmentsUrl(samExpense.id), bytes, 'image/png');
    expect(byGuest.json.code).toBe('JOIN_FIRST');

    // The owner may change any expense's photo.
    expect((await owner.sendBytes('POST', attachmentsUrl(samExpense.id), bytes, 'image/png')).status).toBe(201);
  });

  it('answers 413 RECEIPT_TOO_LARGE for 1 MB + 1 byte, and stores nothing', async () => {
    const { json: expense } = await addExpense(owner, ids.owner, [ids.owner]);
    const tooBig = image(PNG_HEADER, 1_048_577);
    const res = await owner.sendBytes('POST', attachmentsUrl(expense.id), tooBig, 'image/png');
    expect(res.status).toBe(413);
    expect(res.json.code).toBe('RECEIPT_TOO_LARGE');
    expect(await r2KeysOf(code)).toEqual([]);
  });

  it('answers 415 RECEIPT_TYPE_NOT_ALLOWED for text labelled as an image, and for an empty body', async () => {
    const { json: expense } = await addExpense(owner, ids.owner, [ids.owner]);
    const text = new TextEncoder().encode('not an image, just text');
    const asPng = await owner.sendBytes('POST', attachmentsUrl(expense.id), text, 'image/png');
    expect(asPng.status).toBe(415);
    expect(asPng.json.code).toBe('RECEIPT_TYPE_NOT_ALLOWED');

    const empty = await owner.sendBytes('POST', attachmentsUrl(expense.id), new Uint8Array(0), 'image/png');
    expect(empty.status).toBe(415);
    expect(empty.json.code).toBe('RECEIPT_TYPE_NOT_ALLOWED');

    const unsupported = await owner.sendBytes('POST', attachmentsUrl(expense.id), image(PNG_HEADER), 'image/gif');
    expect(unsupported.status).toBe(415);
    expect(await r2KeysOf(code)).toEqual([]);
  });

  it('replaces the photo of an expense and deletes the old object', async () => {
    const { json: expense } = await addExpense(owner, ids.owner, [ids.owner]);
    const first = await owner.sendBytes('POST', attachmentsUrl(expense.id), image(PNG_HEADER), 'image/png');
    const second = await owner.sendBytes('POST', attachmentsUrl(expense.id), image(JPEG_HEADER), 'image/jpeg');
    expect(second.status).toBe(201);

    const keys = await r2KeysOf(code);
    expect(keys).toEqual([`${code}/${expense.id}/${second.json.id}`]);
    const group = await getGroup(owner);
    expect(group.expenses.find((e) => e.id === expense.id)!.receipt!.id).toBe(second.json.id);
    expect((await owner.fetchRaw(`/groups/${code}/expenses/${expense.id}/attachments/${first.json.id}`)).status).toBe(
      404,
    );
  });

  it('answers 404 for an attachment of another group, or of a deleted expense', async () => {
    const { json: expense } = await addExpense(owner, ids.owner, [ids.owner]);
    const up = await owner.sendBytes('POST', attachmentsUrl(expense.id), image(PNG_HEADER), 'image/png');

    const other = new Browser(env.env);
    const { code: otherCode } = (
      await other.call<CreateGroupResponse>('POST', '/groups', { name: 'Other trip', ownerName: 'Taylor' })
    ).json;
    const crossGroup = await other.fetchRaw(`/groups/${otherCode}/expenses/${expense.id}/attachments/${up.json.id}`);
    expect(crossGroup.status).toBe(404);

    await owner.call('DELETE', `/groups/${code}/expenses/${expense.id}`);
    const afterDelete = await owner.fetchRaw(`/groups/${code}/expenses/${expense.id}/attachments/${up.json.id}`);
    expect(afterDelete.status).toBe(404);
    expect(await r2KeysOf(code)).toEqual([]);
  });

  it('removes the photo when the attachment is deleted, and records the change', async () => {
    const { json: expense } = await addExpense(owner, ids.owner, [ids.owner]);
    const up = await owner.sendBytes('POST', attachmentsUrl(expense.id), image(PNG_HEADER), 'image/png');

    const res = await owner.call('DELETE', `${attachmentsUrl(expense.id)}/${up.json.id}`);
    expect(res.status).toBe(200);
    expect(await r2KeysOf(code)).toEqual([]);
    const audit = await env.env.DB.prepare(
      "SELECT COUNT(*) AS n FROM audit_log WHERE group_code = ? AND action = 'expense.receipt.remove'",
    )
      .bind(code)
      .first<{ n: number }>();
    expect(audit!.n).toBe(1);
  });

  it('removes the photo object together with the expense', async () => {
    const { json: expense } = await addExpense(owner, ids.owner, [ids.owner]);
    await owner.sendBytes('POST', attachmentsUrl(expense.id), image(WEBP_HEADER), 'image/webp');
    expect(await r2KeysOf(code)).toHaveLength(1);

    const del = await owner.call('DELETE', `/groups/${code}/expenses/${expense.id}`);
    expect(del.status).toBe(200);
    expect(await r2KeysOf(code)).toEqual([]);
    const row = await env.env.DB.prepare('SELECT COUNT(*) AS n FROM expense_attachments WHERE expense_id = ?')
      .bind(expense.id)
      .first<{ n: number }>();
    expect(row!.n).toBe(0);
  });

  it('refuses to change the photo of an expense that involves a removed member', async () => {
    const { json: expense } = await addExpense(owner, ids.owner, [ids.owner, ids.jamie]);
    const { json: transfer } = await owner.call<{ id: string }>('POST', `/groups/${code}/transfers`, {
      fromId: ids.jamie,
      toId: ids.owner,
      amount: 45_000,
    });
    await owner.call('POST', `/groups/${code}/transfers/${transfer.id}/confirm`);
    const removed = await owner.call('POST', `/groups/${code}/members/${ids.jamie}/remove`, {
      reason: 'Left the house',
    });
    expect(removed.status).toBe(200);

    const res = await owner.sendBytes('POST', attachmentsUrl(expense.id), image(PNG_HEADER), 'image/png');
    expect(res.status).toBe(409);
    expect(res.json.code).toBe('EXPENSE_HAS_REMOVED_MEMBER');
    expect(await r2KeysOf(code)).toEqual([]);
  });

  it('keeps the JSON body limit of 16 KB for other routes', async () => {
    const big = { payerId: ids.owner, description: 'x'.repeat(17 * 1024), amount: 1, participants: [] };
    const res = await owner.call('POST', `/groups/${code}/expenses`, big);
    expect(res.status).toBe(413);
    expect(res.json.code).toBe('BODY_TOO_LARGE');
  });
});

describe('receipt photos and account, purge and lock', () => {
  it('deleting an account keeps the group, its row and its photo', async () => {
    const account = new Browser(env.env);
    await signIn(account, 'alex@example.com');
    const { code: ownCode } = (
      await account.call<CreateGroupResponse>('POST', '/groups', { name: 'Own trip', ownerName: 'Alex' })
    ).json;
    const { json: expense } = await account.call<{ id: string }>('POST', `/groups/${ownCode}/expenses`, {
      payerId: (await account.call<GroupDto>('GET', `/groups/${ownCode}`)).json.me.memberId,
      amount: 20_000,
      description: 'Taxi',
      spentOn: '2026-10-10',
      splitMode: 'equal',
      participants: [
        { memberId: (await account.call<GroupDto>('GET', `/groups/${ownCode}`)).json.me.memberId!, weight: 1 },
      ],
    });
    const up = await account.sendBytes(
      'POST',
      `/groups/${ownCode}/expenses/${expense.id}/attachments`,
      image(PNG_HEADER),
      'image/png',
    );
    expect(up.status).toBe(201);

    const del = await account.call('DELETE', '/me');
    expect(del.status).toBe(200);

    const row = await env.env.DB.prepare('SELECT id FROM expense_attachments WHERE id = ?').bind(up.json.id).first();
    expect(row).not.toBeNull();
    expect(await r2KeysOf(ownCode)).toEqual([`${ownCode}/${expense.id}/${up.json.id}`]);
  });

  it('a purged group loses its photos, and a locked group keeps them', async () => {
    const account = new Browser(env.env);
    await signIn(account, 'owner@example.com');
    const kept = (await account.call<CreateGroupResponse>('POST', '/groups', { name: 'Kept', ownerName: 'Alex' })).json
      .code;
    await account.call('POST', `/groups/${kept}/lock`);
    const keptExpense = (
      await account.call<{ id: string }>('POST', `/groups/${kept}/expenses`, {
        payerId: (await account.call<GroupDto>('GET', `/groups/${kept}`)).json.me.memberId,
        amount: 10_000,
        description: 'Kept dinner',
        spentOn: '2026-10-10',
        splitMode: 'equal',
        participants: [
          { memberId: (await account.call<GroupDto>('GET', `/groups/${kept}`)).json.me.memberId!, weight: 1 },
        ],
      })
    ).json;
    await account.sendBytes(
      'POST',
      `/groups/${kept}/expenses/${keptExpense.id}/attachments`,
      image(PNG_HEADER),
      'image/png',
    );

    // An unlocked group with a photo, left inactive for longer than the purge period.
    const { json: gone } = await owner.call<CreateGroupResponse>('POST', '/groups', {
      name: 'Gone',
      ownerName: 'Alex',
    });
    const goneCode = gone.code;
    const goneMember = (await owner.call<GroupDto>('GET', `/groups/${goneCode}`)).json.me.memberId;
    const goneExpense = (
      await owner.call<{ id: string }>('POST', `/groups/${goneCode}/expenses`, {
        payerId: goneMember,
        amount: 10_000,
        description: 'Old dinner',
        spentOn: '2026-10-10',
        splitMode: 'equal',
        participants: [{ memberId: goneMember, weight: 1 }],
      })
    ).json;
    await owner.sendBytes(
      'POST',
      `/groups/${goneCode}/expenses/${goneExpense.id}/attachments`,
      image(PNG_HEADER),
      'image/png',
    );
    expect(await r2KeysOf(goneCode)).toHaveLength(1);

    const later = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
    // Every unlocked group is inactive by then (the owner's other groups too), so only the photos of the locked
    // group are checked, not the count of purged groups.
    await purgeInactiveGroups(env.env.DB, later, env.env.RECEIPTS);

    expect(await r2KeysOf(goneCode)).toEqual([]);
    expect(await r2KeysOf(kept)).toHaveLength(1);
  }, 30_000);
});
