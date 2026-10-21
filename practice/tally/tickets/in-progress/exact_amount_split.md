# Split by exact amounts

| Field | Value |
|---|---|
| Labels | `type::feature`, `priority::low`, `area::expenses` |
| Reporter | Haiku (end user, group member) |
| Assignee | Developer (trainee) |
| Depends on | - |
| Related | - |

## Description

At restaurants each person orders their own dish. An equal split is unfair to people who spent less, and weights
are hard to work out. The expense form should accept the exact amount each person owes.

## Analysis

The ticket asks for a third split mode in which the person entering the expense types each participant's amount.
It does not say what happens when the parts do not add up to the total, whether the total is typed first or
computed from the parts, or how the rounding setting applies. First step: add `splitExact(amount, parts)` to
`shared/money.ts` with unit tests that reject parts whose sum differs from the amount.

## Clarifying questions

1. Is the total typed first, or should it be the sum of the individual amounts?
2. If the parts do not add up to the total, should saving be blocked, or should the difference go to the payer?
3. Does the group rounding setting apply to the typed amounts?
4. Can a participant have an amount of zero?

## Answers

From Haiku (reporter):

1. The total is typed first (it is printed on the bill), then each person's amount.
2. Saving is blocked, with a message, until the parts add up to the total. The app does not guess.
3. Unknown; referred to the product owner.
4. Yes. A participant can owe zero and still be listed in the expense.

From Opus (product owner):

3. No. Typed amounts are stored exactly as entered; the rounding setting does not apply. Saving is blocked unless
   the parts add up exactly to the total.

## Plan

- **Data:** `split_mode = 'exact'` needs no migration: `migrations/0001_init.sql` declares `split_mode TEXT NOT NULL`
  without a `CHECK`. Each share row stores the typed amount; its `weight` column is set to 1, as in equal mode,
  because weights do not apply.
- **Shared logic (`shared/money.ts`):**
  - `splitExact(amount, parts)` returns the shares exactly as given. It throws when the amount is not a positive
    integer, when there are no parts, when a part is negative, not an integer or above `MAX_AMOUNT`, when a member
    appears twice, or when the parts do not add up exactly to the amount. No rounding is applied.
  - `exactSplitDifference(amount, parts)` returns `amount - sum(parts)`; the form uses it for the
    remaining or excess line, the API for the sum check.
  - `parseShareAmount(input, rules, currency)` parses one participant's amount. `parseAmount` rejects `0`
    (the main amount must be positive), so it cannot be reused unchanged. Decision: an empty field or a typed zero
    (`0`, `0.00`, `0,00`) means the participant owes zero; anything else goes through `parseAmount` with the
    locale rules, so `150k`, `150.000` and `12.50` work as in the main field.
  - `SplitMode = 'equal' | 'weight' | 'exact'` in `shared/types.ts`, used by `ExpenseDto` and `NewExpense`.
    `NewExpense.participants` carries an optional `amount` (exact mode) and an optional `weight` (weight mode).
- **API (`worker/routes/expenses.ts`, `worker/http.ts`):**
  - `splitMode: 'exact'` is accepted; each participant needs an `amount`, validated by a new `shareAmount()` in
    `http.ts`: an integer from 0 to `MAX_AMOUNT`, otherwise 400 `INVALID_SHARE_AMOUNT`.
  - Unknown and duplicate members keep `PARTICIPANT_NOT_IN_GROUP` and `DUPLICATE_PARTICIPANT`.
  - When the parts do not add up to the amount: 400 `SPLIT_SUM_MISMATCH`.
  - The group rounding setting is not applied to exact expenses.
  - New codes in `shared/errors.ts`, translated in `en.ts` and `vi.ts`.
- **UI:**
  - `ExpenseForm`: a third split option "Exact amounts". Each selected participant gets an amount field (an empty
    field is zero). A line under the list shows the amount left to assign, the excess, or that the parts match.
    Saving is blocked with a message while a part is invalid or the parts do not add up.
  - `ExpenseList`: exact expenses show an "exact amounts" label next to the people count, like "by weight".
  - Settle-up needs no change: balances are computed from the stored shares.
  - `src/api.ts` needs no change beyond the shared `NewExpense` type.
- **Tests:** unit tests for `splitExact`, `exactSplitDifference` and `parseShareAmount`; API tests for an accepted
  exact expense (with a zero part and a rounding group) and for rejected requests (sum mismatch, negative,
  non-integer, missing amount, unknown and duplicate members); an e2e spec for the form (run by the lead).
- **Docs:** `docs/business-rules.md` (exact split rules), `docs/design.md` (built), README "Not in the MVP".
