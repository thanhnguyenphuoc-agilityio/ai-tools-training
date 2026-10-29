# Stored weight can differ from the weight used for the split

| Field | Value |
|---|---|
| ID | `TAL-26` |
| Labels | `type::bug`, `priority::low`, `area::expenses` |
| Reporter | Opus (AI team lead, code review of `weighted_split_share_off`) |
| Assignee | Haiku (developer) |
| Depends on | - |
| Related | `weighted_split_share_off` |

## Description

The API accepts a weight such as `2.299999999999` through the expense endpoint, because the weight check allows a
tiny tolerance around two decimal places. The split then uses 2.30, but the value stored with the share is the
original number, so the stored weight and the weight actually used can differ.

The reviewer expected the stored weight to be the same two-decimal value that the split used.

## Notes from the reporter

Found while reviewing the fix for `weighted_split_share_off`; not seen through the interface, which sends the
typed weight.

## Analysis

`worker/http.ts` `weight()` validates a weight with `isValidWeight()` from `shared/money.ts`:

```ts
weight > 0 && weight <= MAX_WEIGHT && Math.abs(weight * 100 - Math.round(weight * 100)) < 1e-9
```

The tolerance is needed, because valid two-decimal weights such as 0.29 are not exact in binary (`0.29 * 100` is `28.999999999999996`). `weight()` then returns the number it received. As a result:

- `splitAmount` uses `Math.round(weight * 100)` hundredths, which is 230 for `2.299999999999`.
- `POST /groups/:code/expenses` passes the raw `p.weight` to the `INSERT` into `expense_shares`, so the stored weight is `2.299999999999`.
- `isValidWeight(1e-12)` is `true` today, because `1e-12` is within the tolerance of zero. Rounded to hundredths it is `0`, so a weight that passes the check can still be stored as zero. The check must refuse it.

The UI is not affected: `ExpenseForm` sends `Number(typedText)`, which is already the two-decimal value.

Comparing weights in hundredths on edit (answer 3) is done by `edit_expense` (TAL-4) when it lands. This ticket does not touch the edit path.

## Reproduce

Throwaway API test (Vitest + Miniflare; deleted after the run). Group with Alex and Sam; weighted expense of 330,000 VND, Alex at weight `2.299999999999` and Sam at weight `1`:

- `POST` answers `201`. The stored shares are `{ weight: 2.299999999999, amount: 230000 }` and `{ weight: 1, amount: 100000 }`. The split used 2.30, but the stored weight is the raw number. Confirmed.
- `POST` with weight `2.3000000000001` is also accepted (`201`).

## Clarifying questions

1. Should the API reject such weights instead of rounding them?
2. Should existing share rows that hold an unrounded weight be corrected by a migration?
3. Should a stored `2.299999999999` and a sent `2.3` count as the same weight when an expense is edited?

## Answers

From Opus (AI team lead, reporter) and the product owner (human):

1. No. The tolerance stays, because it is what lets valid weights such as 0.29 through. A weight within the tolerance is accepted and stored as its two-decimal value: the value the split uses. (product owner, consistent with "at most 2 decimal places" in business-rules.md)
2. No migration. Such rows can only come from direct API calls; they split correctly and are displayed with at most two decimals. Comparing weights in hundredths (answer 3) is enough. (AI team lead)
3. Yes. Weights are compared in hundredths, as the split uses them, so the edit is not reported as a split change. (AI team lead)

## Acceptance criteria

- A weight within tolerance is stored as its two-decimal value.
- A weight that rounds to 0 hundredths gives 400 `INVALID_WEIGHT`.
- 0.29 is still accepted.
- No migration, no error code, no i18n key, no UI change.

## Test matrix (QA)

| Case | Expected |
|---|---|
| POST weights 2.299999999999 and 1 on 330,000 VND | 201, stored weights 2.3 and 1, amounts 230000 and 100000 |
| POST 2.3000000000001 | stored 2.3 |
| POST 0.29 | accepted and stored 0.29 |
| POST 1e-12 | 400 `INVALID_WEIGHT` |
| POST 100.001 | 400 |

## Plan

Branch `fix/stored_weight_rounding` from `develop`. Assignee set; ticket moved to `in-progress/`.

1. `shared/money.ts`, top of the file next to `MAX_WEIGHT` and `isValidWeight`:
   - Add `weightHundredths(weight)`, which returns `Math.round(weight * 100)`, and `roundWeight(weight)`, which returns `weightHundredths(weight) / 100`. Each gets a one-line doc comment.
   - `isValidWeight`: compute `hundredths = weightHundredths(weight)` and return `hundredths >= 1 && weight <= MAX_WEIGHT` plus the existing 1e-9 tolerance check. Update the doc comment: a weight is at least 0.01 and at most 100, and a weight that rounds to zero hundredths is refused.
   - `splitAmount`: use `weightHundredths(p.weight)`. This is a refactor with no behaviour change.
   - Nothing else in `money.ts` changes.
2. `worker/http.ts` `weight()`: return `roundWeight(n)` and import `roundWeight`.
3. `worker/routes/expenses.ts` stays as it is: it already passes `p.weight` from `weight()`.
4. No migration, no error code, no i18n key, no UI change.
5. Tests, committed before the fix so that they fail first:
   - `tests/api/money-flow.test.ts`, new test "stores the two-decimal weight that the split used": `POST` with weights `2.299999999999` and `1` on 330,000 VND, then `GET` the group. Compare the shares by member id, never by array order, because `loadLedger` has no `ORDER BY`. Expect weights `2.3` and `1` and amounts `230000` and `100000`.
   - `tests/api/money-flow.test.ts`, in the existing weight loop: `POST` with weight `1e-12` answers `400` `INVALID_WEIGHT`.
   - `tests/unit/money.test.ts`: `roundWeight(2.299999999999)` is `2.3`, `roundWeight(0.29)` is `0.29`, `weightHundredths(0.29)` is `29`; `isValidWeight(1e-12)` is `false` and `isValidWeight(0.01)` is `true`.
   - No edit-expense tests here; those belong to `edit_expense` (TAL-4).
6. Docs, same branch:
   - `docs/business-rules.md`, Expenses, "By weight" bullet: add that a weight within a tiny tolerance of two decimals is accepted and stored rounded to two decimals, the value the split uses; a weight that rounds to zero is refused.
   - `docs/design.md`, section 4 Data, Weights bullet: `weight()` in `worker/http.ts` stores `roundWeight()`, so the stored value matches the split.
   - The edit_expense section of `docs/design.md` is not touched.
7. Checks: `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:hooks`, and `npx playwright test --config playwright.local.config.ts` (port 5191).
