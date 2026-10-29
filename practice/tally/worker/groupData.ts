// Loading a group and its members, activity tracking and audit log.
import { GROUP_CODE_RE } from '../shared/groupCode';
import { computeBalances } from '../shared/settle';
import type { ExpenseDto, MemberDto, SessionDto, TransferDto } from '../shared/types';
import { resolveIdentity, type Identity } from './auth';
import { ApiError, now, type Ctx } from './http';

export interface GroupRow {
  code: string;
  name: string;
  currency: string;
  round_to: number;
  owner_key_hash: string;
  owner_user_id: string | null;
  locked_at: string | null;
  last_activity_at: string;
  created_at: string;
}

export interface MemberRow {
  id: string;
  name: string;
  bank_bin: string | null;
  account_no: string | null;
  account_name: string | null;
  user_bank_bin?: string | null;
  user_account_no?: string | null;
  user_account_name?: string | null;
  token_hash: string | null;
  user_id: string | null;
  is_owner: number;
  created_at: string;
  removed_at: string | null;
  removed_reason: string | null;
  /** Never copied into a DTO; only `invited` is derived from it. */
  invite_email?: string | null;
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
    .prepare(
      `SELECT m.*, u.bank_bin AS user_bank_bin, u.account_no AS user_account_no, u.account_name AS user_account_name
       FROM members m LEFT JOIN users u ON u.id = m.user_id
       WHERE m.group_code = ?
       ORDER BY m.created_at, m.id`,
    )
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
 * SQL condition, true while none of the members listed in the JSON array bound at `?<n>` has been removed.
 * New expenses and transfers repeat it inside their INSERT, so a removal that commits after the route loaded the
 * active members still cannot be followed by a write naming the removed member (D1 runs one write at a time).
 */
export const noneRemovedSql = (n: number) =>
  `NOT EXISTS (SELECT 1 FROM members WHERE removed_at IS NOT NULL AND id IN (SELECT value FROM json_each(?${n})))`;

/**
 * True when a removed member paid the expense or owes a share above zero. Such an expense can no longer be edited
 * or deleted, the same rule as `involvesRemovedMember` in src/expenseRow.ts for the list.
 */
export async function involvesRemovedMember(db: D1Database, code: string, id: string): Promise<boolean> {
  const row = await db
    .prepare(
      `SELECT EXISTS (
         SELECT 1 FROM members m
         WHERE m.group_code = ?2 AND m.removed_at IS NOT NULL
           AND (m.id = (SELECT payer_id FROM expenses WHERE id = ?1)
                OR m.id IN (SELECT member_id FROM expense_shares WHERE expense_id = ?1 AND amount <> 0))
       ) AS removed`,
    )
    .bind(id, code)
    .first<{ removed: number }>();
  return !!row?.removed;
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
      .prepare(
        'SELECT * FROM expenses WHERE group_code = ? AND deleted_at IS NULL ORDER BY spent_on DESC, created_at DESC',
      )
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
    editedAt: (e.edited_at as string | null) ?? null,
    sessionId: (e.session_id as string | null) ?? null,
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

/** The sessions of a group, newest day first, with the members present (attendance_split). */
export async function loadSessions(db: D1Database, code: string): Promise<SessionDto[]> {
  const [sessionRows, attendanceRows] = await Promise.all([
    db
      .prepare('SELECT * FROM group_sessions WHERE group_code = ? ORDER BY day DESC, starts_at DESC')
      .bind(code)
      .all<{ id: string; day: string; starts_at: string; ends_at: string; note: string }>()
      .then((r) => r.results),
    db
      .prepare(
        `SELECT a.session_id, a.member_id FROM attendance a
         JOIN group_sessions s ON s.id = a.session_id WHERE s.group_code = ?`,
      )
      .bind(code)
      .all<{ session_id: string; member_id: string }>()
      .then((r) => r.results),
  ]);
  return sessionRows.map((s) => ({
    id: s.id,
    day: s.day,
    startsAt: s.starts_at,
    endsAt: s.ends_at,
    note: s.note,
    presentIds: attendanceRows.filter((a) => a.session_id === s.id).map((a) => a.member_id),
  }));
}

/**
 * What stands between a member and their removal, from one read of the ledger: their balance in minor units
 * (positive = the group owes them, from computeBalances) and whether a transfer to or from them is marked sent but
 * not confirmed yet.
 */
export async function memberSettlement(
  db: D1Database,
  code: string,
  memberId: string,
): Promise<{ balance: number; pending: boolean }> {
  const { expenses, transfers } = await loadLedger(db, code);
  return {
    balance: computeBalances([memberId], expenses, transfers).get(memberId) ?? 0,
    pending: transfers.some((t) => t.status === 'sent' && (t.fromId === memberId || t.toId === memberId)),
  };
}

export const toMemberDto = (m: MemberRow): MemberDto => {
  if (m.removed_at) {
    return {
      id: m.id,
      name: m.name,
      isOwner: m.is_owner === 1,
      claimed: m.token_hash !== null || m.user_id !== null,
      removed: true,
      removedReason: m.removed_reason,
      bankBin: null,
      accountNo: null,
      accountName: null,
      bankSource: null,
      hasAccount: false,
      invited: false,
    };
  }

  let bankBin: string | null = null;
  let accountNo: string | null = null;
  let accountName: string | null = null;
  let bankSource: 'group' | 'account' | null = null;

  if (m.account_no) {
    bankBin = m.bank_bin;
    accountNo = m.account_no;
    accountName = m.account_name;
    bankSource = 'group';
  } else if (m.user_account_no) {
    bankBin = m.user_bank_bin ?? null;
    accountNo = m.user_account_no;
    accountName = m.user_account_name ?? null;
    bankSource = 'account';
  }

  const claimed = m.token_hash !== null || m.user_id !== null;
  return {
    id: m.id,
    name: m.name,
    isOwner: m.is_owner === 1,
    claimed,
    removed: false,
    removedReason: m.removed_reason,
    bankBin,
    accountNo,
    accountName,
    bankSource,
    hasAccount: m.user_id !== null,
    invited: !claimed && !!m.invite_email,
  };
};

/** Records an event in the audit log without changing last_activity_at. */
export async function audit(
  db: D1Database,
  code: string,
  me: Identity,
  action: string,
  target: string | null,
  /** JSON-able values that explain the change, e.g. the values before an edit. */
  details?: unknown,
) {
  const actor = me.memberId ?? (me.isOwner ? 'owner' : 'anonymous');
  await db
    .prepare('INSERT INTO audit_log (group_code, actor, action, target, details, at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(code, actor, action, target, details === undefined ? null : JSON.stringify(details), now())
    .run();
}

/**
 * Use for every change listed in `docs/business-rules.md`; use `audit()` alone for events that are not changes.
 * Records the change in audit_log and pushes back the deletion date (last_activity_at) in one db.batch.
 */
export async function recordChange(
  db: D1Database,
  code: string,
  me: Identity,
  action: string,
  target: string | null,
  /** JSON-able values that explain the change, e.g. the values before an edit. */
  details?: unknown,
) {
  const actor = me.memberId ?? (me.isOwner ? 'owner' : 'anonymous');
  const timestamp = now();
  await db.batch([
    db
      .prepare('INSERT INTO audit_log (group_code, actor, action, target, details, at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(code, actor, action, target, details === undefined ? null : JSON.stringify(details), timestamp),
    db.prepare('UPDATE groups SET last_activity_at = ? WHERE code = ?').bind(timestamp, code),
  ]);
}
