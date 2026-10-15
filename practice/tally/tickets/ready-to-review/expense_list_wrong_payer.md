# Expense list shows the wrong person as the payer

| Field | Value |
|---|---|
| Labels | `type::bug`, `priority::medium`, `area::ui`, `source::seeded` |
| Reporter | Haiku (end user, group member) |
| Assignee | Developer (trainee) |
| Depends on | - |
| Related | - |

## Description

Jamie paid for the taxi, but the reporter entered the expense from their own phone and selected Jamie in
"Paid by". In the expense list, the line under the taxi expense says that the reporter paid.

The "Settle up" tab shows Jamie as the person who is owed money, so the reporter is unsure which of the two is
correct. The reporter expected the expense list to show Jamie as the payer.

## Notes from the reporter

Expenses that people entered for themselves look correct.

## Reproduce

1. Alex creates a group with the currency VND. Jamie is added by name in the members panel.
2. On Alex's device, open the "Expenses" tab and add an expense: description "Taxi", amount `90000`, "Paid by"
   Jamie, shared equally by Alex and Jamie.
3. Look at the line under "Taxi" in the expense list, then open the "Settle up" tab.

- Observed: the expense list says "Alex paid". The "Settle up" tab shows Alex owing 45,000 to Jamie.
- Expected: the expense list says "Jamie paid", which matches the balances.
- An expense where the author is also the payer looks correct, which matches the reporter's note.

## Analysis

The ticket asks for the expense list to name the member selected in "Paid by" instead of another member. The only
ambiguity is which of the two screens is wrong; the API returns `payerId` and the settle-up view uses it, while the
list row reads `createdBy` (the member who entered the expense), so the list is wrong and the stored data is correct.
The first step is to move the choice of the name shown on a row into a small pure function so that a unit test can
reproduce the bug without a component test setup.

## Plan

- `src/expenseRow.ts` (new): a pure helper that returns the payer name shown on an expense list row, given the
  expense and the group members. It is extracted from `src/components/ExpenseList.tsx` with the current behaviour,
  because the Vitest setup runs in Node and has no React component testing.
- `src/components/ExpenseList.tsx`: use the helper for the payer name.
- `tests/unit/expenseRow.test.ts` (new): an expense created by Alex with Jamie as the payer must show Jamie. It fails
  before the fix (it returns Alex).
- Fix: the helper reads `payerId` instead of `createdBy`. `createdBy` stays in use for the delete button, which
  depends on the author. No rule or design changes, so `docs/` stays as it is.

## Merge request

`fix/expense_list_wrong_payer` into `develop`: the expense list row now names the member in `payerId` instead of the
author in `createdBy`, through the new pure helper `src/expenseRow.ts`, covered by `tests/unit/expenseRow.test.ts`.
The merge request is opened on GitLab from this branch; its link is added when it exists.

## Review

Approved by the AI team lead after one round: typecheck, 106 unit and API tests and 6 e2e tests pass. Review
comments addressed: an e2e assertion on the row text (it fails with the old behaviour) and a narrower helper type.
