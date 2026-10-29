import { describe, expect, it } from 'vitest';
import {
  expenseFieldsChanged,
  splitChanged,
  type ExpenseFields,
  type ExpenseSplit,
  type SplitInput,
  type StoredShare,
} from '../../shared/expenseEdit';
import type { SplitMode } from '../../shared/types';

// Which part of an edit makes the stored shares stale (edit_expense). Fake data only.
const stored = (mode: SplitMode = 'equal'): ExpenseSplit & { shares: StoredShare[] } => ({
  amount: 300_000,
  payerId: 'alex',
  splitMode: mode,
  shares: [
    { memberId: 'alex', weight: 1, amount: 100_000 },
    { memberId: 'sam', weight: 1, amount: 100_000 },
    { memberId: 'jamie', weight: 1, amount: 100_000 },
  ],
});

const same = (overrides: Partial<ExpenseSplit & { participants: SplitInput[] }> = {}) => ({
  amount: 300_000,
  payerId: 'alex',
  splitMode: 'equal' as SplitMode,
  participants: [
    { memberId: 'alex', weight: 1, amount: 0 },
    { memberId: 'sam', weight: 1, amount: 0 },
    { memberId: 'jamie', weight: 1, amount: 0 },
  ],
  ...overrides,
});

const fields = (overrides: Partial<ExpenseFields> = {}): ExpenseFields => ({
  payerId: 'alex',
  amount: 300_000,
  description: 'Utilities',
  spentOn: '2026-10-10',
  splitMode: 'equal',
  ...overrides,
});

describe('splitChanged', () => {
  it('keeps the stored shares when only the date or the description changes', () => {
    // The date and the description are not part of the comparison at all.
    expect(splitChanged(stored(), same())).toBe(false);
  });

  it('recomputes when the amount, the payer or the split mode changes', () => {
    expect(splitChanged(stored(), same({ amount: 200_000 }))).toBe(true);
    expect(splitChanged(stored(), same({ payerId: 'sam' }))).toBe(true);
    expect(splitChanged(stored(), same({ splitMode: 'weight' }))).toBe(true);
  });

  it('recomputes when a participant joins, leaves or changes', () => {
    const withoutJamie = same({ participants: same().participants.slice(0, 2) });
    expect(splitChanged(stored(), withoutJamie)).toBe(true);

    const withOther = same({
      participants: [...same().participants.slice(0, 2), { memberId: 'pat', weight: 1, amount: 0 }],
    });
    expect(splitChanged(stored(), withOther)).toBe(true);
  });

  it('compares weights in hundredths, so a float within tolerance is the same weight', () => {
    const weighted: StoredShare[] = [
      { memberId: 'alex', weight: 2.3, amount: 200_000 },
      { memberId: 'sam', weight: 1, amount: 100_000 },
    ];
    const weightInput = (weight: number): SplitInput[] => [
      { memberId: 'alex', weight, amount: 0 },
      { memberId: 'sam', weight: 1, amount: 0 },
    ];
    const weightedExpense = { ...stored('weight'), shares: weighted };
    expect(splitChanged(weightedExpense, same({ splitMode: 'weight', participants: weightInput(2.3) }))).toBe(false);
    expect(
      splitChanged(weightedExpense, same({ splitMode: 'weight', participants: weightInput(2.3000000000001) })),
    ).toBe(false);
    expect(splitChanged(weightedExpense, same({ splitMode: 'weight', participants: weightInput(3) }))).toBe(true);
  });

  it('compares typed amounts in exact mode', () => {
    const exactExpense = { ...stored('exact') };
    const exactInput = (alex: number): SplitInput[] => [
      { memberId: 'alex', weight: 1, amount: alex },
      { memberId: 'sam', weight: 1, amount: 100_000 },
      { memberId: 'jamie', weight: 1, amount: 100_000 },
    ];
    expect(splitChanged(exactExpense, same({ splitMode: 'exact', participants: exactInput(100_000) }))).toBe(false);
    expect(splitChanged(exactExpense, same({ splitMode: 'exact', participants: exactInput(120_000) }))).toBe(true);
  });

  it('does not care about the order of the participants', () => {
    const reversed = same({ participants: [...same().participants].reverse() });
    expect(splitChanged(stored(), reversed)).toBe(false);
  });
});

describe('expenseFieldsChanged', () => {
  it('is false when every stored field is the same', () => {
    expect(expenseFieldsChanged(fields(), fields())).toBe(false);
  });

  it('is true when the payer, amount, description, date or split mode changes', () => {
    expect(expenseFieldsChanged(fields(), fields({ payerId: 'sam' }))).toBe(true);
    expect(expenseFieldsChanged(fields(), fields({ amount: 1 }))).toBe(true);
    expect(expenseFieldsChanged(fields(), fields({ description: 'Groceries' }))).toBe(true);
    expect(expenseFieldsChanged(fields(), fields({ spentOn: '2026-10-11' }))).toBe(true);
    expect(expenseFieldsChanged(fields(), fields({ splitMode: 'exact' }))).toBe(true);
  });
});
