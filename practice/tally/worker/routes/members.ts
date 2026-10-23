// Joining a group, adding people by name, claiming a name, bank details, removing a member.
import { Hono } from 'hono';
import { memberCookieName, randomToken, setGroupCookie, sha256Hex } from '../auth';
import { audit, loadActiveMember, loadGroup, loadMembers, memberSettlement } from '../groupData';
import { ApiError, bankDetails, now, optionalText, readJson, text, type AppEnv } from '../http';
import { requireCanEditMember, requireCanRemoveMember, requireMember } from '../policy';

export const memberRoutes = new Hono<AppEnv>();

const sameName = (a: string, b: string) => a.toLocaleLowerCase('vi') === b.toLocaleLowerCase('vi');

// claim=true: "this is me", anyone with the link joins and gets a device token.
// claim=false: an existing member adds someone else by name (claimable later).
memberRoutes.post('/:code/members', async (c) => {
  const { group, me } = await loadGroup(c);
  const body = await readJson(c);
  const name = text(body.name, 'name', 40);
  const claim = body.claim === true;
  if (!claim) requireMember(me);

  const members = await loadMembers(c.env.DB, group.code);
  if (members.some((m) => sameName(m.name, name)))
    throw new ApiError(409, 'DUPLICATE_NAME', 'a member with this name already exists');

  const id = crypto.randomUUID();
  const token = claim ? randomToken() : null;
  await c.env.DB.prepare('INSERT INTO members (id, group_code, name, token_hash, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(id, group.code, name, token ? await sha256Hex(token) : null, now())
    .run();
  if (token) setGroupCookie(c, group.code, memberCookieName(group.code), `${id}.${token}`);
  await audit(c.env.DB, group.code, me, 'member.add', id);
  return c.json({ id }, 201);
});

// "I am this person": take over a member someone added by name.
memberRoutes.post('/:code/members/:id/claim', async (c) => {
  const { group, me } = await loadGroup(c);
  const member = await loadActiveMember(c.env.DB, group.code, c.req.param('id'));
  if (member.token_hash)
    throw new ApiError(409, 'MEMBER_ALREADY_CLAIMED', 'this member is already used on another device');
  const token = randomToken();
  // The guard is repeated in the UPDATE so that two simultaneous claims cannot both win.
  const result = await c.env.DB.prepare('UPDATE members SET token_hash = ? WHERE id = ? AND token_hash IS NULL')
    .bind(await sha256Hex(token), member.id)
    .run();
  if (result.meta.changes === 0) {
    throw new ApiError(409, 'MEMBER_ALREADY_CLAIMED', 'this member is already used on another device');
  }
  setGroupCookie(c, group.code, memberCookieName(group.code), `${member.id}.${token}`);
  await audit(c.env.DB, group.code, me, 'member.claim', member.id);
  return c.json({ ok: true });
});

memberRoutes.patch('/:code/members/:id', async (c) => {
  const { group, me } = await loadGroup(c);
  const member = await loadActiveMember(c.env.DB, group.code, c.req.param('id'));
  requireCanEditMember(me, member.id);

  const body = await readJson(c);
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

  await c.env.DB.prepare('UPDATE members SET name = ?, bank_bin = ?, account_no = ?, account_name = ? WHERE id = ?')
    .bind(name, bank.bankBin, bank.accountNo, bank.accountName, member.id)
    .run();
  await audit(c.env.DB, group.code, me, 'member.update', member.id);
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
  const removedAt = now();
  const result = await c.env.DB.prepare(
    'UPDATE members SET removed_at = ?, removed_reason = ? WHERE id = ? AND removed_at IS NULL',
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
      'UPDATE members SET removed_at = NULL, removed_reason = NULL WHERE id = ? AND removed_at = ?',
    )
      .bind(member.id, removedAt)
      .run();
    throw new ApiError(409, 'MEMBER_HAS_BALANCE', 'settle up before removing this member', { balance: after.balance });
  }
  await audit(c.env.DB, group.code, me, 'member.remove', member.id);
  return c.json({ ok: true });
});
