// Create, read and configure a group; recover owner access.
import { Hono } from 'hono';
import { DEFAULT_CURRENCY, getCurrency } from '../../shared/currency';
import { generateGroupCode } from '../../shared/groupCode';
import { expiresAt } from '../../shared/rules';
import type { CreateGroupResponse, GroupDto } from '../../shared/types';
import { memberCookieName, ownerCookieName, randomToken, setGroupCookie, sha256Hex } from '../auth';
import { audit, loadGroup, loadLedger, loadMembers, recordChange, toMemberDto } from '../groupData';
import { ApiError, currency, now, readJson, roundTo, text, type AppEnv } from '../http';
import { requireOwner } from '../policy';

export const groupRoutes = new Hono<AppEnv>();

// Deleted expenses count: they stay in the history with amounts in the current currency.
async function isCurrencyLocked(db: D1Database, code: string): Promise<boolean> {
  const row = await db
    .prepare(
      `SELECT EXISTS (SELECT 1 FROM expenses WHERE group_code = ?1) OR EXISTS (SELECT 1 FROM transfers WHERE group_code = ?1) AS used`,
    )
    .bind(code)
    .first<{ used: number }>();
  return !!row?.used;
}

// The creator becomes the owner and the first member.
groupRoutes.post('/', async (c) => {
  const body = await readJson(c);
  const name = text(body.name, 'name', 80);
  const ownerName = text(body.ownerName, 'ownerName', 40);
  const groupCurrency = currency(body.currency ?? DEFAULT_CURRENCY);
  const rounding = roundTo(body.roundTo, groupCurrency);

  const code = generateGroupCode();
  const ownerKey = randomToken();
  const memberId = crypto.randomUUID();
  const memberToken = randomToken();
  const at = now();

  await c.env.DB.batch([
    c.env.DB.prepare(
      'INSERT INTO groups (code, name, currency, round_to, owner_key_hash, last_activity_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).bind(code, name, groupCurrency.code, rounding, await sha256Hex(ownerKey), at, at),
    c.env.DB.prepare(
      'INSERT INTO members (id, group_code, name, token_hash, is_owner, created_at) VALUES (?, ?, ?, ?, 1, ?)',
    ).bind(memberId, code, ownerName, await sha256Hex(memberToken), at),
  ]);

  setGroupCookie(c, code, ownerCookieName(code), ownerKey);
  setGroupCookie(c, code, memberCookieName(code), `${memberId}.${memberToken}`);
  return c.json({ code, ownerKey } satisfies CreateGroupResponse, 201);
});

// Anyone with the link can read the whole group.
groupRoutes.get('/:code', async (c) => {
  const { group, me } = await loadGroup(c);
  const db = c.env.DB;

  const [members, { expenses, transfers }] = await Promise.all([
    loadMembers(db, group.code),
    loadLedger(db, group.code),
  ]);

  const dto: GroupDto = {
    code: group.code,
    name: group.name,
    currency: group.currency,
    roundTo: group.round_to,
    createdAt: group.created_at,
    lastActivityAt: group.last_activity_at,
    expiresAt: expiresAt(group.last_activity_at),
    currencyLocked: await isCurrencyLocked(db, group.code),
    members: members.map(toMemberDto),
    expenses,
    transfers,
    me,
  };
  return c.json(dto);
});

// Owner settings: name, currency, rounding. The currency can only change
// while the group has no expenses or transfers, so no amount is reinterpreted.
groupRoutes.patch('/:code', async (c) => {
  const { group, me } = await loadGroup(c);
  requireOwner(me);
  const body = await readJson(c);
  const name = body.name === undefined ? group.name : text(body.name, 'name', 80);

  const current = getCurrency(group.currency)!;
  const next = body.currency === undefined ? current : currency(body.currency);
  if (next.code !== current.code) {
    if (await isCurrencyLocked(c.env.DB, group.code)) {
      throw new ApiError(409, 'CURRENCY_LOCKED', 'currency cannot change once the group has expenses or transfers');
    }
  }
  // Keep the current rounding if the (new) currency allows it, else fall back to exact.
  const rounding =
    body.roundTo !== undefined
      ? roundTo(body.roundTo, next)
      : next.roundOptions.includes(group.round_to)
        ? group.round_to
        : next.roundOptions[0];

  if (name === group.name && next.code === group.currency && rounding === group.round_to) {
    return c.json({ ok: true, changed: false });
  }

  await c.env.DB.prepare('UPDATE groups SET name = ?, currency = ?, round_to = ? WHERE code = ?')
    .bind(name, next.code, rounding, group.code)
    .run();
  await recordChange(c.env.DB, group.code, me, 'group.update', null);
  return c.json({ ok: true, changed: true });
});

// Recover owner access on a new device with the owner key.
groupRoutes.post('/:code/owner/claim', async (c) => {
  // The body is read first: answering 404 for a deleted group before the request body is consumed makes the
  // Vite dev proxy fail with "fetch failed", and the recovery link of a deleted group must end in a plain 404.
  // This lowers the chance of the dev-proxy failure; it does not remove it (dev only, see docs/design.md).
  const body = await readJson(c);
  const { group, me } = await loadGroup(c);
  const key = text(body.ownerKey, 'ownerKey', 200);
  if ((await sha256Hex(key)) !== group.owner_key_hash) throw new ApiError(403, 'WRONG_OWNER_KEY', 'wrong owner key');
  setGroupCookie(c, group.code, ownerCookieName(group.code), key);
  await audit(c.env.DB, group.code, { ...me, isOwner: true }, 'owner.claim', null);
  return c.json({ ok: true });
});
