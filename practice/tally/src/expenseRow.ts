// What a row of the expense list shows, kept out of the component so it can be unit tested.
import type { ExpenseDto, MemberDto } from '../shared/types';

/** Name of a member, or `fallback` when the id does not match any member. */
export function memberName(members: MemberDto[], id: string | null, fallback: string): string {
  return members.find((m) => m.id === id)?.name ?? fallback;
}

/** Name shown as the payer: the member selected in "Paid by", not the member who entered the expense. */
export function payerName(expense: Pick<ExpenseDto, 'payerId'>, members: MemberDto[], fallback: string): string {
  return memberName(members, expense.payerId, fallback);
}

/**
 * True when a removed member paid the expense or owes a share above zero. The API refuses to delete such an
 * expense (EXPENSE_HAS_REMOVED_MEMBER), so the list does not offer it.
 */
export function involvesRemovedMember(
  expense: Pick<ExpenseDto, 'payerId' | 'shares'>,
  members: Pick<MemberDto, 'id' | 'removed'>[],
): boolean {
  const removed = new Set(members.filter((m) => m.removed).map((m) => m.id));
  return removed.has(expense.payerId) || expense.shares.some((s) => s.amount !== 0 && removed.has(s.memberId));
}
