// Create, read and configure a group; recover owner access.
import { Hono } from 'hono';
import { DEFAULT_CURRENCY, getCurrency } from '../../shared/currency';
import { generateGroupCode } from '../../shared/groupCode';
import { expiresAt, MAX_LOCKED_GROUPS } from '../../shared/rules';
import type { CreateGroupResponse, GroupDto } from '../../shared/types';
import { memberCookieName, ownerCookieName, randomToken, resolveAccount, setGroupCookie, sha256Hex } from '../auth';
import { linkToAccount } from '../accountLink';
import { linkInvitedMember } from '../inviteLink';
import { audit, loadGroup, loadLedger, loadMembers, recordChange, toMemberDto } from '../groupData';
import { ApiError, currency, now, readJson, roundTo, text, type AppEnv } from '../http';
import {
  canAutoLinkInvite,
  canLinkToAccount,
  requireGroupNotOwnedByOther,
  requireOwner,
  requireOwnerAccount,
} from '../policy';

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

  const account = await resolveAccount(c);
  const userId = account?.id ?? null;

  const code = generateGroupCode();
  const ownerKey = randomToken();
  const memberId = crypto.randomUUID();
  const memberToken = randomToken();
  const at = now();

  await c.env.DB.batch([
    c.env.DB.prepare(
      'INSERT INTO groups (code, name, currency, round_to, owner_key_hash, owner_user_id, last_activity_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(code, name, groupCurrency.code, rounding, await sha256Hex(ownerKey), userId, at, at),
    c.env.DB.prepare(
      'INSERT INTO members (id, group_code, name, token_hash, user_id, is_owner, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)',
    ).bind(memberId, code, ownerName, await sha256Hex(memberToken), userId, at),
  ]);

  setGroupCookie(c, code, ownerCookieName(code), ownerKey);
  setGroupCookie(c, code, memberCookieName(code), `${memberId}.${memberToken}`);
  return c.json({ code, ownerKey } satisfies CreateGroupResponse, 201);
});

// Anyone with the link can read the whole group.
groupRoutes.get('/:code', async (c) => {
  const { group, me } = await loadGroup(c);
  const db = c.env.DB;

  // member_email_invite: a signed-in account with no member here is linked to the invited member that has its email.
  // This is the only GET that writes, and only when a link happens (recorded as a change, like a claim).
  if (canAutoLinkInvite(me)) {
    const account = await resolveAccount(c);
    const memberId = account ? await linkInvitedMember(db, group, me, account.email) : null;
    if (memberId) {
      await recordChange(db, group.code, { ...me, memberId }, 'member.link', memberId);
      me.memberId = memberId;
      me.accountMemberId = memberId;
    }
  }

  const [members, { expenses, transfers }] = await Promise.all([
    loadMembers(db, group.code),
    loadLedger(db, group.code),
  ]);
  const ownerMember = members.find((m) => m.is_owner === 1 && !m.removed_at) ?? null;
  const deviceMember = me.deviceMemberId ? (members.find((m) => m.id === me.deviceMemberId) ?? null) : null;
  const canLinkAccount = canLinkToAccount(me, group, ownerMember, deviceMember);

  const locked = group.locked_at !== null;
  const dto: GroupDto = {
    code: group.code,
    name: group.name,
    currency: group.currency,
    roundTo: group.round_to,
    createdAt: group.created_at,
    lastActivityAt: group.last_activity_at,
    expiresAt: locked ? null : expiresAt(group.last_activity_at),
    locked,
    currencyLocked: await isCurrencyLocked(db, group.code),
    canLinkAccount,
    members: members.map(toMemberDto),
    expenses,
    transfers,
    me: {
      memberId: me.memberId,
      isOwner: me.isOwner,
      accountLinked: me.accountMemberId !== null && me.accountMemberId === me.memberId,
    },
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

// Lock a group: exempt it from inactivity deletion.
groupRoutes.post('/:code/lock', async (c) => {
  const { group, me } = await loadGroup(c);
  requireOwnerAccount(me);

  if (group.owner_user_id !== me.userId) {
    requireGroupNotOwnedByOther(me, group);
    const { changed, memberId } = await linkToAccount(c.env.DB, group, me);
    if (changed) {
      await recordChange(c.env.DB, group.code, me, 'group.link', memberId);
    }
  }

  if (group.locked_at !== null) {
    return c.json({ ok: true, changed: false });
  }

  const countRow = await c.env.DB.prepare(
    'SELECT COUNT(*) AS total FROM groups WHERE owner_user_id = ? AND locked_at IS NOT NULL',
  )
    .bind(me.userId)
    .first<{ total: number }>();
  if ((countRow?.total ?? 0) >= MAX_LOCKED_GROUPS) {
    throw new ApiError(409, 'LOCK_LIMIT_REACHED', 'lock limit reached', { max: MAX_LOCKED_GROUPS });
  }

  // The limit is repeated in the UPDATE so that two simultaneous locks cannot both pass the count above.
  const updateRes = await c.env.DB.prepare(
    `UPDATE groups SET locked_at = ?1 WHERE code = ?2 AND locked_at IS NULL AND owner_user_id = ?3
       AND (SELECT COUNT(*) FROM groups WHERE owner_user_id = ?3 AND locked_at IS NOT NULL) < ?4`,
  )
    .bind(now(), group.code, me.userId, MAX_LOCKED_GROUPS)
    .run();
  if ((updateRes.meta.changes ?? 0) === 0) {
    const current = await c.env.DB.prepare('SELECT locked_at FROM groups WHERE code = ?')
      .bind(group.code)
      .first<{ locked_at: string | null }>();
    if (current?.locked_at != null) {
      return c.json({ ok: true, changed: false });
    }
    throw new ApiError(409, 'LOCK_LIMIT_REACHED', 'lock limit reached', { max: MAX_LOCKED_GROUPS });
  }

  await recordChange(c.env.DB, group.code, me, 'group.lock', null);
  return c.json({ ok: true, changed: true });
});

// Unlock a group: restarts inactivity timer.
groupRoutes.delete('/:code/lock', async (c) => {
  const { group, me } = await loadGroup(c);
  requireOwnerAccount(me);
  requireGroupNotOwnedByOther(me, group);

  if (group.locked_at === null) {
    return c.json({ ok: true, changed: false });
  }

  const updateRes = await c.env.DB.prepare(
    'UPDATE groups SET locked_at = NULL WHERE code = ? AND locked_at IS NOT NULL',
  )
    .bind(group.code)
    .run();
  if ((updateRes.meta.changes ?? 0) === 0) {
    return c.json({ ok: true, changed: false });
  }
  await recordChange(c.env.DB, group.code, me, 'group.unlock', null);
  return c.json({ ok: true, changed: true });
});
