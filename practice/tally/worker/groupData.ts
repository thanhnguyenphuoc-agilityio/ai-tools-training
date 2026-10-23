// Loading a group and its members, activity tracking and audit log.
import { GROUP_CODE_RE } from '../shared/groupCode';
import type { MemberDto } from '../shared/types';
import { resolveIdentity, type Identity } from './auth';
import { ApiError, now, type Ctx } from './http';

export interface GroupRow {
  code: string;
  name: string;
  currency: string;
  round_to: number;
  owner_key_hash: string;
  last_activity_at: string;
  created_at: string;
}

export interface MemberRow {
  id: string;
  name: string;
  bank_bin: string | null;
  account_no: string | null;
  account_name: string | null;
  token_hash: string | null;
  is_owner: number;
  created_at: string;
}

/** Loads the group named by the :code route param and who is calling. 404 if missing. */
export async function loadGroup(c: Ctx): Promise<{ group: GroupRow; me: Identity }> {
  const code = c.req.param('code') ?? '';
  if (!GROUP_CODE_RE.test(code)) throw new ApiError(404, 'GROUP_NOT_FOUND', 'group not found');
  const group = await c.env.DB.prepare('SELECT * FROM groups WHERE code = ?').bind(code).first<GroupRow>();
  if (!group) throw new ApiError(404, 'GROUP_NOT_FOUND', 'group not found');
  const me = await resolveIdentity(c, code, group);
  return { group, me };
}

export async function loadMembers(db: D1Database, code: string): Promise<MemberRow[]> {
  const { results } = await db
    .prepare('SELECT * FROM members WHERE group_code = ? ORDER BY created_at, id')
    .bind(code)
    .all<MemberRow>();
  return results;
}

export async function loadMember(db: D1Database, code: string, id: string): Promise<MemberRow> {
  const member = await db
    .prepare('SELECT * FROM members WHERE id = ? AND group_code = ?')
    .bind(id, code)
    .first<MemberRow>();
  if (!member) throw new ApiError(404, 'MEMBER_NOT_FOUND', 'member not found');
  return member;
}

export const toMemberDto = (m: MemberRow): MemberDto => ({
  id: m.id,
  name: m.name,
  isOwner: m.is_owner === 1,
  claimed: m.token_hash !== null,
  bankBin: m.bank_bin,
  accountNo: m.account_no,
  accountName: m.account_name,
});

/** Member activity pushes back the (future) auto-delete date. */
export async function touch(db: D1Database, code: string): Promise<void> {
  await db.prepare('UPDATE groups SET last_activity_at = ? WHERE code = ?').bind(now(), code).run();
}

/** Records a change and counts it as activity. Call after every successful write. */
export async function audit(db: D1Database, code: string, me: Identity, action: string, target: string | null) {
  const actor = me.memberId ?? (me.isOwner ? 'owner' : 'anonymous');
  await db.batch([
    db
      .prepare('INSERT INTO audit_log (group_code, actor, action, target, at) VALUES (?, ?, ?, ?, ?)')
      .bind(code, actor, action, target, now()),
    db.prepare('UPDATE groups SET last_activity_at = ? WHERE code = ?').bind(now(), code),
  ]);
}
