// Which part of an edit makes the stored shares stale, and which stored fields changed (edit_expense).
// Pure, so the API and the tests share one rule.
import { weightHundredths } from './money';
import type { SplitMode } from './types';

export interface StoredShare {
  memberId: string;
  weight: number;
  /** The stored share, in minor units. */
  amount: number;
}

export interface SplitInput {
  memberId: string;
  /** 1 in equal mode. */
  weight: number;
  /** The typed amount in exact mode, 0 otherwise. */
  amount: number;
}

export interface ExpenseSplit {
  amount: number;
  payerId: string;
  splitMode: SplitMode;
}

/**
 * True when an edit changes something the stored shares are computed from: the amount, the payer, the split mode,
 * the set of participants, their weights (weight mode) or their typed amounts (exact mode).
 * An edit to the date or the description alone keeps the stored shares as they are.
 */
export function splitChanged(
  previous: ExpenseSplit & { shares: StoredShare[] },
  next: ExpenseSplit & { participants: SplitInput[] },
): boolean {
  if (previous.amount !== next.amount || previous.payerId !== next.payerId || previous.splitMode !== next.splitMode) {
    return true;
  }
  if (previous.shares.length !== next.participants.length) return true;
  const stored = new Map(previous.shares.map((s) => [s.memberId, s]));
  return next.participants.some((participant) => {
    const share = stored.get(participant.memberId);
    if (!share) return true;
    // Exact mode stores the typed amount; the other modes store the weight (always 1 in equal mode). Weights are
    // compared in hundredths, the unit the split uses, so 2.3 and 2.3000000000001 are the same weight.
    return next.splitMode === 'exact'
      ? share.amount !== participant.amount
      : weightHundredths(share.weight) !== weightHundredths(participant.weight);
  });
}

export interface ExpenseFields {
  payerId: string;
  amount: number;
  description: string;
  spentOn: string;
  splitMode: SplitMode;
}

/**
 * True when an edit changes one of the stored expense fields. The shares are compared separately, by `splitChanged`.
 * A later field (for example a session) is added here, in one place.
 */
export function expenseFieldsChanged(previous: ExpenseFields, next: ExpenseFields): boolean {
  return (
    previous.payerId !== next.payerId ||
    previous.amount !== next.amount ||
    previous.description !== next.description ||
    previous.spentOn !== next.spentOn ||
    previous.splitMode !== next.splitMode
  );
}
