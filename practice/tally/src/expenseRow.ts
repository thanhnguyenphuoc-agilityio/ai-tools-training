// What a row of the expense list shows, kept out of the component so it can be unit tested.
import type { ExpenseDto, MemberDto } from '../shared/types';

/** Name of a member, or `fallback` when the id does not match any member. */
export function memberName(members: MemberDto[], id: string | null, fallback: string): string {
  return members.find((m) => m.id === id)?.name ?? fallback;
}

/** Name shown as the payer of an expense. */
export function payerName(
  expense: Pick<ExpenseDto, 'payerId' | 'createdBy'>,
  members: MemberDto[],
  fallback: string,
): string {
  return memberName(members, expense.createdBy, fallback);
}
