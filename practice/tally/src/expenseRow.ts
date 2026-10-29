// What a row of the expense list shows, kept out of the component so it can be unit tested.
import { endsNextDay } from '../shared/sessions';
import type { ExpenseDto, MemberDto, SessionDto } from '../shared/types';
import type { MessageKey, Vars } from './i18n/types';

/** Name of a member, or `fallback` when the id does not match any member. */
export function memberName(members: MemberDto[], id: string | null, fallback: string): string {
  return members.find((m) => m.id === id)?.name ?? fallback;
}

/** Name shown as the payer: the member selected in "Paid by", not the member who entered the expense. */
export function payerName(expense: Pick<ExpenseDto, 'payerId'>, members: MemberDto[], fallback: string): string {
  return memberName(members, expense.payerId, fallback);
}

/**
 * True when a removed member paid the expense or owes a share above zero. The API refuses to edit or delete such an
 * expense (EXPENSE_HAS_REMOVED_MEMBER), so the list offers neither action.
 */
export function involvesRemovedMember(
  expense: Pick<ExpenseDto, 'payerId' | 'shares'>,
  members: Pick<MemberDto, 'id' | 'removed'>[],
): boolean {
  const removed = new Set(members.filter((m) => m.removed).map((m) => m.id));
  return removed.has(expense.payerId) || expense.shares.some((s) => s.amount !== 0 && removed.has(s.memberId));
}

/**
 * The text of a session: its day, then its time range, then the next-day note when it ends after midnight.
 * Shared by the expense form's session select and the expense list badge (expense_session_link).
 */
export function sessionLabel(
  session: Pick<SessionDto, 'day' | 'startsAt' | 'endsAt'>,
  t: (key: MessageKey, vars?: Vars) => string,
  day: (iso: string) => string,
): string {
  const parts = [day(session.day), t('sessions.range', { start: session.startsAt, end: session.endsAt })];
  if (endsNextDay(session.startsAt, session.endsAt)) parts.push(t('sessions.nextDay'));
  return parts.join(t('common.separator'));
}
