// Paid-toward expenses (TAL-61): an expense that a transfer has already settled against is locked against edit and
// delete. The rule is pure so the API (worker/groupData.ts), the ledger DTO and the tests share one definition; the
// SQL in `paidTowardSql` must match it.
import type { ExpenseDto, TransferDto } from './types';

/**
 * True when some transfer, recorded at or after the expense's creation and involving its payer or a member with a
 * share above zero (on either side: sender or receiver), has been made. Both timestamps are ISO strings from now(),
 * so they compare as text. Transfers are never deleted, so the result never turns back to false.
 */
export function isPaidToward(
  expense: Pick<ExpenseDto, 'payerId' | 'shares' | 'createdAt'>,
  transfers: Pick<TransferDto, 'fromId' | 'toId' | 'createdAt'>[],
): boolean {
  const involved = new Set<string>([expense.payerId]);
  for (const share of expense.shares) {
    if (share.amount > 0) involved.add(share.memberId);
  }
  return transfers.some(
    (t) => t.createdAt >= expense.createdAt && (involved.has(t.fromId) || involved.has(t.toId)),
  );
}
