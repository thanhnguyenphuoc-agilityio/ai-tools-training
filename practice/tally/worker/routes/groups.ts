// Create, read and configure a group; recover owner access.
import { Hono } from 'hono';
import { DEFAULT_CURRENCY, getCurrency } from '../../shared/currency';
import { generateGroupCode } from '../../shared/groupCode';
import { expiresAt, MAX_LOCKED_GROUPS } from '../../shared/rules';
import type { CreateGroupResponse, GroupDto } from '../../shared/types';
import {
  clearOwnerCookie,
  memberCookieName,
  ownerCookieName,
  randomToken,
  resolveAccount,
  REVOKED_OWNER_KEY,
  setGroupCookie,
  sha256Hex,
} from '../auth';
import { attachOwnerGroup, tryAttachOwnerGroup } from '../accountLink';
import { linkInvitedMember } from '../inviteLink';
import {
  audit,
  loadActiveMember,
  loadGroup,
  loadLedger,
  loadMember,
  loadMembers,
  loadSessions,
  recordChange,
  toMemberDto,
} from '../groupData';
import { ApiError, currency, now, readJson, roundTo, text, type AppEnv } from '../http';
import {
  canAutoLinkInvite,
  canLinkToAccount,
  requireAccount,
  requireCanTransferOwnership,
  requireGroupNotOwnedByOther,
  requireOwner,
  requireOwnerAccount,
  requireTransferTarget,
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
  // A group created while signed in is owned by the account: no owner key is issued (owner_link_binds_account).
  const ownerKey = userId ? null : randomToken();
  const ownerKeyHash = ownerKey ? await sha256Hex(ownerKey) : REVOKED_OWNER_KEY;
  const memberId = crypto.randomUUID();
  const memberToken = randomToken();
  const at = now();

  await c.env.DB.batch([
    c.env.DB.prepare(
      'INSERT INTO groups (code, name, currency, round_to, owner_key_hash, owner_user_id, last_activity_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(code, name, groupCurrency.code, rounding, ownerKeyHash, userId, at, at),
    c.env.DB.prepare(
      'INSERT INTO members (id, group_code, name, token_hash, user_id, is_owner, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)',
    ).bind(memberId, code, ownerName, await sha256Hex(memberToken), userId, at),
  ]);

  if (ownerKey) {
    setGroupCookie(c, code, ownerCookieName(code), ownerKey);
  }
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
      c.set('groupChanged', true);
      me.memberId = memberId;
      me.accountMemberId = memberId;
    }
  }

  const [members, { expenses, transfers }, sessions] = await Promise.all([
    loadMembers(db, group.code),
    loadLedger(db, group.code),
    loadSessions(db, group.code),
  ]);
  const deviceMember = me.deviceMemberId ? (members.find((m) => m.id === me.deviceMemberId) ?? null) : null;
  const canLinkAccount = canLinkToAccount(me, deviceMember);

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
    ownedByAccount: group.owner_user_id !== null,
    currencyLocked: await isCurrencyLocked(db, group.code),
    canLinkAccount,
    members: members.map(toMemberDto),
    expenses,
    transfers,
    sessions,
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

  // A revoked key matches nothing: the group is tied to an account (owner_link_binds_account).
  if (group.owner_key_hash === REVOKED_OWNER_KEY) {
    if (me.userId && group.owner_user_id === me.userId) {
      return c.json({ ok: true, attached: false });
    }
    if (me.userId && group.owner_user_id !== null) {
      throw new ApiError(403, 'GROUP_OWNED_BY_OTHER_ACCOUNT', 'group belongs to another account');
    }
    throw new ApiError(403, 'OWNER_KEY_REVOKED', 'this recovery link was revoked because the group is now linked to an account');
  }

  if ((await sha256Hex(key)) !== group.owner_key_hash) throw new ApiError(403, 'WRONG_OWNER_KEY', 'wrong owner key');

  if (me.userId) {
    try {
      const { changed, memberId } = await attachOwnerGroup(c.env.DB, group, me);
      clearOwnerCookie(c, group.code);
      if (changed) {
        await recordChange(c.env.DB, group.code, me, 'group.link', memberId);
      }
      return c.json({ ok: true, attached: true });
    } catch (err: unknown) {
      // The account is already another member of the group, so it is not attached (recovery_link_signed_in_member).
      // The owner key still restores owner access on this device through the owner cookie, as without an account.
      // Other refusals (owned by another account, owner member linked elsewhere) still answer their errors.
      if (!(err instanceof ApiError && err.code === 'ACCOUNT_ALREADY_MEMBER')) throw err;
    }
  }

  setGroupCookie(c, group.code, ownerCookieName(group.code), key);
  await audit(c.env.DB, group.code, { ...me, isOwner: true }, 'owner.claim', null);
  return c.json({ ok: true, attached: false });
});

// Attaches the group from the owner cookie of this device after sign-in (called for each device group).
groupRoutes.post('/:code/owner/attach', async (c) => {
  const { group, me } = await loadGroup(c);
  requireAccount(me);

  if (!me.hasOwnerKey) {
    return c.json({ ok: true, attached: false });
  }

  const { attached, memberId } = await tryAttachOwnerGroup(c.env.DB, group, me);
  if (attached) {
    clearOwnerCookie(c, group.code);
    await recordChange(c.env.DB, group.code, me, 'group.link', memberId);
  }
  return c.json({ ok: true, attached });
});

// Hand the group over to another member (transfer_ownership). The receiver must be linked to an account; the
// previous owner stays a normal member. The recovery link is revoked, so the previous owner loses owner access
// outside the account. A hand-over does not move last_activity_at, except for a kept group, which stops being kept:
// its locked_at is cleared, last_activity_at moves to the hand-over time (a fresh 10 days) and group.unlock is written.
// These statements share the batch with the ownership move, so they apply only when that move wins the race.
groupRoutes.post('/:code/owner/transfer', async (c) => {
  const { group, me } = await loadGroup(c);
  requireCanTransferOwnership(me);
  const body = await readJson(c);
  const memberId = text(body.memberId, 'memberId', 64);

  const target = await loadActiveMember(c.env.DB, group.code, memberId);
  requireTransferTarget(target);
  const currentOwner = await c.env.DB.prepare(
    'SELECT id FROM members WHERE group_code = ? AND is_owner = 1 AND removed_at IS NULL',
  )
    .bind(group.code)
    .first<{ id: string }>();
  if (!currentOwner) throw new ApiError(404, 'MEMBER_NOT_FOUND', 'owner member not found');

  // Every statement carries the guards again, so two simultaneous hand-overs cannot both win. The group statement
  // runs first and the member statement only applies while the previous owner is still the owner member.
  // The unlock statements share one timestamp and carry the same guards. The audit row runs before the update,
  // because it selects on locked_at IS NOT NULL.
  const handOverAt = now();
  const unlockActor = me.memberId ?? 'owner';
  await c.env.DB.batch([
    c.env.DB.prepare(
      `UPDATE groups SET owner_user_id = ?1, owner_key_hash = ?2
       WHERE code = ?3
       AND EXISTS (SELECT 1 FROM members WHERE id = ?4 AND group_code = ?3 AND is_owner = 1 AND removed_at IS NULL)
       AND EXISTS (SELECT 1 FROM members WHERE id = ?5 AND group_code = ?3 AND user_id = ?1 AND removed_at IS NULL)`,
    ).bind(target.user_id, REVOKED_OWNER_KEY, group.code, currentOwner.id, target.id),
    c.env.DB.prepare(
      `UPDATE members SET is_owner = CASE WHEN id = ?1 THEN 1 ELSE 0 END
       WHERE group_code = ?2 AND id IN (?1, ?3)
       AND EXISTS (SELECT 1 FROM groups WHERE code = ?2 AND owner_user_id = ?4 AND owner_key_hash = ?5)
       AND EXISTS (SELECT 1 FROM members WHERE id = ?3 AND group_code = ?2 AND is_owner = 1 AND removed_at IS NULL)`,
    ).bind(target.id, group.code, currentOwner.id, target.user_id, REVOKED_OWNER_KEY),
    // A kept group stops being kept: the unlock is recorded, and last_activity_at restarts the 10 days. Applies only
    // when the ownership move above won (the receiver is now the owner of the group with the revoked key).
    c.env.DB.prepare(
      `INSERT INTO audit_log (group_code, actor, action, target, details, at)
       SELECT code, ?1, 'group.unlock', NULL, '{"reason":"owner.transfer"}', ?2 FROM groups
       WHERE code = ?3 AND locked_at IS NOT NULL AND owner_user_id = ?4 AND owner_key_hash = ?5
       AND EXISTS (SELECT 1 FROM members WHERE id = ?6 AND group_code = ?3 AND is_owner = 1 AND removed_at IS NULL)`,
    ).bind(unlockActor, handOverAt, group.code, target.user_id, REVOKED_OWNER_KEY, target.id),
    c.env.DB.prepare(
      `UPDATE groups SET locked_at = NULL, last_activity_at = ?1
       WHERE code = ?2 AND locked_at IS NOT NULL AND owner_user_id = ?3 AND owner_key_hash = ?4
       AND EXISTS (SELECT 1 FROM members WHERE id = ?5 AND group_code = ?2 AND is_owner = 1 AND removed_at IS NULL)`,
    ).bind(handOverAt, group.code, target.user_id, REVOKED_OWNER_KEY, target.id),
  ]);

  // Read back: when nothing moved, say why.
  const after = await loadMember(c.env.DB, group.code, target.id);
  if (after.is_owner !== 1) {
    if (after.removed_at) throw new ApiError(409, 'MEMBER_REMOVED', 'this member has been removed from the group');
    if (after.user_id === null) {
      throw new ApiError(409, 'OWNER_TRANSFER_NOT_LINKED', 'the member needs an account to receive ownership');
    }
    // Another hand-over (or a revoke) won the race, so the caller no longer owns the group.
    throw new ApiError(403, 'OWNER_ONLY', 'only the group owner can do this');
  }

  clearOwnerCookie(c, group.code);
  await audit(c.env.DB, group.code, me, 'owner.transfer', target.id);
  return c.json({ ok: true });
});

// Lock a group: exempt it from inactivity deletion.
groupRoutes.post('/:code/lock', async (c) => {
  const { group, me } = await loadGroup(c);
  requireOwnerAccount(me);

  if (group.owner_user_id !== me.userId) {
    requireGroupNotOwnedByOther(me, group);
    const { changed, memberId } = await attachOwnerGroup(c.env.DB, group, me);
    clearOwnerCookie(c, group.code);
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
