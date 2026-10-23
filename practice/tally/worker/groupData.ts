// Loading a group and its members, activity tracking and audit log.
import { GROUP_CODE_RE } from '../shared/groupCode';
import { computeBalances } from '../shared/settle';
import type { ExpenseDto, MemberDto, TransferDto } from '../shared/types';
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
  removed_at: string | null;
  removed_reason: string | null;
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
    .prepare('SELECT * FROM members WHERE group_code = ? ORDER BY is_owner DESC, name COLLATE NOCASE, id')
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

/** Like loadMember, but a removed member cannot be changed any more. */
export async function loadActiveMember(db: D1Database, code: string, id: string): Promise<MemberRow> {
  const member = await loadMember(db, code, id);
  if (member.removed_at) throw new ApiError(409, 'MEMBER_REMOVED', 'this member has been removed from the group');
  return member;
}

/** Ids of the members who have not been removed: the only ones new expenses and transfers may name. */
export async function loadActiveMemberIds(db: D1Database, code: string): Promise<Set<string>> {
  return new Set((await loadMembers(db, code)).filter((m) => !m.removed_at).map((m) => m.id));
}

/**
 * The expenses (deleted ones left out, newest first) and transfers of a group, as the API returns them.
 * Balances are always computed from this with computeBalances (shared/settle.ts), never with a second formula.
 */
export async function loadLedger(
  db: D1Database,
  code: string,
): Promise<{ expenses: ExpenseDto[]; transfers: TransferDto[] }> {
  const [expenseRows, shareRows, transferRows] = await Promise.all([
    db
      .prepare('SELECT * FROM expenses WHERE group_code = ? AND deleted_at IS NULL ORDER BY spent_on DESC, created_at DESC')
      .bind(code)
      .all<Record<string, string | number | null>>()
      .then((r) => r.results),
    db
      .prepare(
        `SELECT s.* FROM expense_shares s JOIN expenses e ON e.id = s.expense_id
         WHERE e.group_code = ? AND e.deleted_at IS NULL`,
      )
      .bind(code)
      .all<{ expense_id: string; member_id: string; weight: number; amount: number }>()
      .then((r) => r.results),
    db
      .prepare('SELECT * FROM transfers WHERE group_code = ? ORDER BY created_at DESC')
      .bind(code)
      .all<Record<string, string | number | null>>()
      .then((r) => r.results),
  ]);

  const expenses: ExpenseDto[] = expenseRows.map((e) => ({
    id: e.id as string,
    payerId: e.payer_id as string,
    amount: e.amount as number,
    description: e.description as string,
    spentOn: e.spent_on as string,
    splitMode: e.split_mode as ExpenseDto['splitMode'],
    shares: shareRows
      .filter((s) => s.expense_id === e.id)
      .map((s) => ({ memberId: s.member_id, weight: s.weight, amount: s.amount })),
    createdBy: e.created_by as string | null,
    createdAt: e.created_at as string,
  }));
  const transfers: TransferDto[] = transferRows.map((t) => ({
    id: t.id as string,
    fromId: t.from_id as string,
    toId: t.to_id as string,
    amount: t.amount as number,
    status: t.status as TransferDto['status'],
    createdAt: t.created_at as string,
    confirmedAt: t.confirmed_at as string | null,
  }));
  return { expenses, transfers };
}

/** Balance of one member in minor units (positive = the group owes them), from computeBalances. */
export async function memberBalance(db: D1Database, code: string, memberId: string): Promise<number> {
  const { expenses, transfers } = await loadLedger(db, code);
  return computeBalances([memberId], expenses, transfers).get(memberId) ?? 0;
}

/** True while a transfer to or from the member is marked sent but not confirmed yet. */
export async function hasPendingTransfer(db: D1Database, code: string, memberId: string): Promise<boolean> {
  const row = await db
    .prepare(
      `SELECT EXISTS (SELECT 1 FROM transfers WHERE group_code = ?1 AND status = 'sent' AND (from_id = ?2 OR to_id = ?2)) AS pending`,
    )
    .bind(code, memberId)
    .first<{ pending: number }>();
  return !!row?.pending;
}

export const toMemberDto = (m: MemberRow): MemberDto => ({
  id: m.id,
  name: m.name,
  isOwner: m.is_owner === 1,
  claimed: m.token_hash !== null,
  removed: m.removed_at !== null,
  removedReason: m.removed_reason,
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
