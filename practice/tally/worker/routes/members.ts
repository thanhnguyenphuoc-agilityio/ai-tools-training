// Joining a group, adding people by name, claiming a name, bank details, removing a member.
import { Hono } from 'hono';
import { memberCookieName, randomToken, setGroupCookie, sha256Hex } from '../auth';
import { loadActiveMember, loadGroup, loadMembers, memberSettlement, recordChange } from '../groupData';
import {
  ApiError,
  bankDetails,
  isUniqueViolation,
  now,
  optionalEmail,
  optionalText,
  readJson,
  text,
  type AppEnv,
} from '../http';
import {
  requireCanEditMember,
  requireCanRemoveMember,
  requireCanSetInviteEmail,
  requireMember,
  requireMemberLinkable,
  requireNotMember,
} from '../policy';

export const memberRoutes = new Hono<AppEnv>();

const sameName = (a: string, b: string) => a.toLocaleLowerCase('vi') === b.toLocaleLowerCase('vi');

const alreadyMember = () =>
  new ApiError(409, 'ACCOUNT_ALREADY_MEMBER', 'your account is already a member of this group');

// claim=true: "this is me", anyone with the link joins and gets a device token.
// claim=false: an existing member adds someone else by name (claimable later).
memberRoutes.post('/:code/members', async (c) => {
  const { group, me } = await loadGroup(c);
  const body = await readJson(c);
  const name = text(body.name, 'name', 40);
  const claim = body.claim === true;
  if (!claim) {
    requireMember(me);
  } else {
    requireNotMember(me);
  }

  // Only a person added by name can carry an invite email; a joining device ignores the field.
  const inviteEmail = claim ? null : optionalEmail(body.inviteEmail, 'inviteEmail');

  const members = await loadMembers(c.env.DB, group.code);
  if (members.some((m) => sameName(m.name, name)))
    throw new ApiError(409, 'DUPLICATE_NAME', 'a member with this name already exists');

  const id = crypto.randomUUID();
  const token = claim ? randomToken() : null;
  const userId = claim ? me.userId : null;
  try {
    await c.env.DB.prepare(
      'INSERT INTO members (id, group_code, name, token_hash, user_id, invite_email, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    )
      .bind(id, group.code, name, token ? await sha256Hex(token) : null, userId, inviteEmail, now())
      .run();
  } catch (err) {
    // Two simultaneous joins from one account both pass requireNotMember; the unique index stops the second.
    if (userId !== null && isUniqueViolation(err)) throw alreadyMember();
    throw err;
  }
  if (token) setGroupCookie(c, group.code, memberCookieName(group.code), `${id}.${token}`);
  await recordChange(c.env.DB, group.code, me, 'member.add', id);
  return c.json({ id }, 201);
});

// "I am this person": take over a member someone added by name.
memberRoutes.post('/:code/members/:id/claim', async (c) => {
  const { group, me } = await loadGroup(c);
  requireNotMember(me);
  const member = await loadActiveMember(c.env.DB, group.code, c.req.param('id'));
  requireMemberLinkable(me, member);
  if (member.token_hash)
    throw new ApiError(409, 'MEMBER_ALREADY_CLAIMED', 'this member is already used on another device');
  const token = randomToken();
  // The guard is repeated in the UPDATE so that two simultaneous claims cannot both win.
  let result: D1Result;
  try {
    result = await c.env.DB.prepare(
      'UPDATE members SET token_hash = ?, user_id = COALESCE(?, user_id), invite_email = NULL WHERE id = ? AND token_hash IS NULL',
    )
      .bind(await sha256Hex(token), me.userId, member.id)
      .run();
  } catch (err) {
    // Two simultaneous claims from one account for different names: the unique index stops the second.
    if (me.userId !== null && isUniqueViolation(err)) throw alreadyMember();
    throw err;
  }
  if (result.meta.changes === 0) {
    throw new ApiError(409, 'MEMBER_ALREADY_CLAIMED', 'this member is already used on another device');
  }
  setGroupCookie(c, group.code, memberCookieName(group.code), `${member.id}.${token}`);
  await recordChange(c.env.DB, group.code, { ...me, memberId: member.id }, 'member.claim', member.id);
  return c.json({ ok: true });
});

memberRoutes.patch('/:code/members/:id', async (c) => {
  const { group, me } = await loadGroup(c);
  const member = await loadActiveMember(c.env.DB, group.code, c.req.param('id'));
  const body = await readJson(c);
  // The invite email is the owner's to set: a non-owner who sends it gets OWNER_ONLY, not EDIT_SELF_ONLY.
  const setsEmail = body.inviteEmail !== undefined;
  if (setsEmail) requireCanSetInviteEmail(me);
  requireCanEditMember(me, member.id);

  const name = body.name === undefined ? member.name : text(body.name, 'name', 40);
  if (name !== member.name) {
    const others = (await loadMembers(c.env.DB, group.code)).filter((m) => m.id !== member.id);
    if (others.some((m) => sameName(m.name, name)))
      throw new ApiError(409, 'DUPLICATE_NAME', 'a member with this name already exists');
  }
  const bank = bankDetails(body, {
    bankBin: member.bank_bin,
    accountNo: member.account_no,
    accountName: member.account_name,
  });

  // The invite email is written only when the body carries it, so other edits never touch it.
  let inviteEmail: string | null = null;
  if (setsEmail) {
    if (member.token_hash !== null || member.user_id !== null) {
      throw new ApiError(409, 'MEMBER_ALREADY_CLAIMED', 'this member is already used on another device');
    }
    inviteEmail = optionalEmail(body.inviteEmail, 'inviteEmail');
  }

  if (setsEmail) {
    await c.env.DB.prepare(
      'UPDATE members SET name = ?, bank_bin = ?, account_no = ?, account_name = ?, invite_email = ? WHERE id = ?',
    )
      .bind(name, bank.bankBin, bank.accountNo, bank.accountName, inviteEmail, member.id)
      .run();
  } else {
    await c.env.DB.prepare('UPDATE members SET name = ?, bank_bin = ?, account_no = ?, account_name = ? WHERE id = ?')
      .bind(name, bank.bankBin, bank.accountNo, bank.accountName, member.id)
      .run();
  }
  await recordChange(c.env.DB, group.code, me, 'member.update', member.id);
  return c.json({ ok: true });
});

// The owner removes a member who has settled up. The row stays (soft delete) so
// past expenses and transfers keep the name; the member's device becomes a guest.
memberRoutes.post('/:code/members/:id/remove', async (c) => {
  const { group, me } = await loadGroup(c);
  requireCanRemoveMember(me);
  const member = await loadActiveMember(c.env.DB, group.code, c.req.param('id'));
  if (member.is_owner === 1) throw new ApiError(409, 'CANNOT_REMOVE_OWNER', 'the group owner cannot be removed');

  const body = await readJson(c);
  // A reason of only spaces counts as no reason.
  const blank = typeof body.reason === 'string' && body.reason.trim() === '';
  const reason = blank ? null : optionalText(body.reason, 'reason', 200);

  // A member who still owes or is owed money settles up first: a debt is never written off or moved.
  const { balance, pending } = await memberSettlement(c.env.DB, group.code, member.id);
  if (balance !== 0 || pending) {
    throw new ApiError(409, 'MEMBER_HAS_BALANCE', 'settle up before removing this member', { balance });
  }

  // The guard is repeated in the UPDATE so that two simultaneous removals cannot both win.
  // user_id is cleared so the account can join again as a new member.
  const removedAt = now();
  const result = await c.env.DB.prepare(
    'UPDATE members SET removed_at = ?, removed_reason = ?, user_id = NULL, invite_email = NULL WHERE id = ? AND removed_at IS NULL',
  )
    .bind(removedAt, reason, member.id)
    .run();
  if (result.meta.changes === 0) {
    throw new ApiError(409, 'MEMBER_REMOVED', 'this member has been removed from the group');
  }
  // D1 has no interactive transaction, so an expense or transfer may have committed between the check above and
  // the UPDATE. From the UPDATE on, new writes refuse the member (noneRemovedSql), so one more look at the ledger
  // sees everything: if the member is no longer settled up, the removal is undone.
  const after = await memberSettlement(c.env.DB, group.code, member.id);
  if (after.balance !== 0 || after.pending) {
    await c.env.DB.prepare(
      'UPDATE members SET removed_at = NULL, removed_reason = NULL, user_id = ? WHERE id = ? AND removed_at = ?',
    )
      .bind(member.user_id, member.id, removedAt)
      .run();
    throw new ApiError(409, 'MEMBER_HAS_BALANCE', 'settle up before removing this member', { balance: after.balance });
  }
  await recordChange(c.env.DB, group.code, me, 'member.remove', member.id);
  return c.json({ ok: true });
});
