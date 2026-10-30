# Deleting a paid expense puts its payer in debt

| Field | Value |
|---|---|
| ID | `TAL-61` |
| Labels | `type::bug`, `priority::medium`, `area::settle` |
| Reporter | Product owner (human) |
| Assignee | Haiku (developer) |
| Depends on | - |
| Related | `duplicate_sent_transfers`, `edit_expense` |

## Description

After a debt from an expense has been paid and confirmed, deleting that expense leaves the confirmed transfer in
place. The member who paid the expense then owes the money back, although nothing was spent on the group's behalf
any more from their point of view. The product owner expects a settled expense not to turn its payer into a debtor.

## Reproduce

1. Create a VND group with Alex (owner) and Sam. Give Sam a fake bank account (`0123456789`).
2. Add an expense of 300,000 paid by Sam, split equally. Settle up shows Alex owes Sam 150,000.
3. Alex pays with the QR and clicks "I have sent it"; Sam (or the owner) confirms. Settle up shows everyone even.
4. Delete the expense.

Expected: the group does not show Sam as a debtor because of a payment that settled a deleted expense.

Actual: settle up suggests that Sam pays Alex 150,000.

## Analysis

- A balance is total paid minus total owed, plus or minus **confirmed** transfers (`docs/business-rules.md`,
  "Balances and settling up"). Deleting an expense removes it from paid and owed, but transfers are not linked to
  expenses, so the confirmed 150,000 still counts and Sam's balance becomes -150,000.
- `DELETE /api/groups/:code/expenses/:id` in `worker/routes/expenses.ts` only blocks expenses that involve a removed
  member (`EXPENSE_HAS_REMOVED_MEMBER`); it does not consider settled debts. Editing the amount of a settled expense
  likely has the same effect.
- The arithmetic is consistent (Sam really did receive 150,000 that is no longer backed by an expense), so the fix
  is a product decision rather than a calculation error.

## Clarifying questions

1. Should deleting (or lowering) an expense be blocked once confirmed transfers cover it, warned about in the delete
   dialog, or allowed with the resulting refund shown as expected?
2. If it is blocked, how does the app decide that a transfer belongs to an expense, given that transfers settle net
   balances rather than single expenses?
3. Does the same rule apply to editing an expense's amount, payer or split?

## Answers

From the product owner (human):

1. Neither delete nor allow: an expense that someone has already paid toward stays. It can no longer be edited or
   deleted. Instead it can be hidden from the expense list; a hidden expense still counts in balances.
2. An expense is open to edit or delete only while nobody has paid toward it yet.
3. Yes. Editing and deleting follow the same rule.

## Decision

- **Paid toward.** Transfers settle net balances, not single expenses, so the rule is defined from data the app has:
  an expense is *paid toward* once the group has a transfer (`sent` or `confirmed`) recorded at or after the
  expense's `created_at` whose payer or receiver is the expense's payer or a member with a share above zero.
  A transfer covers only the expenses that existed when it was recorded. Example: Alex adds expenses 1 and 2, Sam
  pays Alex, then Alex adds expense 3. Expenses 1 and 2 are locked; expense 3 can still be edited or deleted (for
  example when it was added by mistake), and if it is correct Sam pays the new difference.
- **Edit and delete.** A paid-toward expense cannot be edited or deleted; the API answers 409 with a new stable code
  `EXPENSE_PAID_TOWARD`, translated in every locale. The UI does not offer Edit or Delete on such an expense and
  shows why. An expense nobody has paid toward keeps today's edit and soft delete.
- **Hide.** A paid-toward expense offers Hide (and Unhide), allowed to the same people who may delete an expense
  (its author or the owner, through `worker/policy.ts`). Hiding is group-wide, stored on the expense (new migration),
  audited, and counts as activity. A hidden expense stays in balances, settle-up suggestions and the spreadsheet
  export; it is left out of the expense list and its total only.
- **Show hidden.** The expense list has a toggle between "Visible expenses" and "All expenses"; in "All expenses",
  hidden rows are marked as hidden. The choice is per viewer and is not stored on the server.
- **Purge.** Hidden expenses are deleted with the group by `purge_inactive_groups`, like everything else.
- `docs/business-rules.md` ("Expenses", "Balances and settling up") and `docs/design.md` are updated in the same
  branch.

## Acceptance criteria

- After a transfer involving its payer or a sharing member, an expense can no longer be edited or deleted, in the UI
  and through the API (`EXPENSE_PAID_TOWARD`); the reproduce steps above can no longer turn Sam into a debtor.
- An expense added after the last transfer can still be edited and deleted.
- The author or the owner can hide and unhide a paid-toward expense; balances and suggestions do not change.
- The list toggle shows hidden expenses, marked as hidden, and hides them again.
- Tests: an API test that fails before the fix (delete after a confirmed transfer answers 409 and balances stay
  even), plus an e2e for hide and the toggle.

## Plan

1. Shared: `shared/expenseLock.ts` with `isPaidToward`, pure, boundary at equal timestamps, zero shares ignored.
2. Data: migration `0013_expense_hidden.sql` adds `hidden_at` and `hidden_by` (NULL means visible). Check that
   `tests/api/helpers.ts` reads the migrations directory (it does).
3. Worker: `paidTowardSql` and `isExpensePaidToward` in `worker/groupData.ts`; `loadLedger` maps `hiddenAt` and
   `paidToward`; `ExpenseDto` gains both fields; ExpenseDto fixtures in unit tests get the new fields.
4. API: DELETE and PATCH refuse paid-toward expenses with `EXPENSE_PAID_TOWARD`, checked in the UPDATE SQL. The
   removed-member check stays first. New `POST /:code/expenses/:id/hide` with `requireCanHideExpense` in
   `worker/policy.ts`; errors added to `shared/errors.ts`; `hideExpense` in `src/api.ts`.
5. UI: `ExpenseList` gets the per-viewer Visible / All toggle, the paid-toward row state with a hide button, the
   hidden badge, and toasts. Icons in `Icon.tsx`, styles in `ExpenseList.scss`, texts in both locales.
6. Tests: `tests/api/paid-toward.test.ts` (first commit: the ticket repro alone, failing on develop), then the rest of
   the matrix; `tests/unit/expenseLock.test.ts`; updates to the existing suites listed in the task; `e2e/hide-expense.spec.ts`.
7. Docs: `docs/business-rules.md` ("Expenses" and a note under "Balances and settling up") and `docs/design.md`
   (`### delete_settled_expense (built)` after `group_live_updates`). The TAL-60 parts are not touched.
8. Verify: typecheck, lint, `npm test`, `npm run test:hooks`. Then the ticket moves to `waiting-to-merge/`.

## Merge request

Branch `fix/delete_settled_expense` into `develop`. The merge request link is added when it exists. Merge order in
the batch: `fix/recovery_link_signed_in_member` (TAL-60) first, then this branch.

What changed:

- `shared/expenseLock.ts`: `isPaidToward`, the pure rule. Equal timestamps count, zero shares do not.
- `migrations/0013_expense_hidden.sql`: `hidden_at` and `hidden_by`, NULL means visible.
- `worker/groupData.ts`: `paidTowardSql` (the EXISTS fragment used in the UPDATEs), `isExpensePaidToward`,
  `loadLedger` maps `hiddenAt` and sets `paidToward`.
- `worker/routes/expenses.ts`: DELETE and PATCH refuse a paid-toward expense with `EXPENSE_PAID_TOWARD`, checked in
  the UPDATE SQL and before the payer and participant checks. The removed-member check stays first. New
  `POST /:code/expenses/:id/hide` with `{ hidden }`, 404, 403, 409 `EXPENSE_NOT_PAID_TOWARD`, audited as
  `expense.hide` or `expense.unhide`, counts as activity.
- `worker/policy.ts`: `requireCanHideExpense`, the owner or the author, `HIDE_NOT_ALLOWED` otherwise.
- `shared/errors.ts`, `src/i18n/locales/en.ts` and `vi.ts`: `EXPENSE_PAID_TOWARD`, `EXPENSE_NOT_PAID_TOWARD`,
  `HIDE_NOT_ALLOWED`, and the list and toast texts.
- `shared/types.ts`: `ExpenseDto.hiddenAt` and `paidToward`. Unit fixtures updated.
- `src/api.ts`: `hideExpense`.
- `src/components/ExpenseList.tsx`, `ExpenseList.scss`, `Icon.tsx`: the Visible / All toggle (per viewer), the
  paid-toward row state with a Hide or Unhide button, the hidden badge. Errors show next to the list.
- Existing suites adjusted to the rule: `tests/api/edit-expense.test.ts` (the edit targets an expense added after the
  transfer), `tests/api/purge.test.ts` (the delete moves before the transfer), `tests/api/live.test.ts` (new
  `POST /groups/:code/expenses/:id/hide` case).
- `tests/api/paid-toward.test.ts`, `tests/unit/expenseLock.test.ts` and `e2e/hide-expense.spec.ts`: the matrix in the
  acceptance criteria.
- `docs/business-rules.md` ("Paid-toward expenses", and a note under "Balances and settling up") and
  `docs/design.md` (`### delete_settled_expense (built)`).

Commands and results (run in the feature worktree):

- `npm run typecheck`: clean.
- `npm run lint`: clean.
- `npm test`: 52 files, 647 tests passed.
- `npm run test:hooks`: 29 passed, 0 failed.
- `npm run e2e`: not run in this branch. The batch runs it, including `e2e/hide-expense.spec.ts` and the regression
  specs (edit-expense, receipts, attendance, csv-export).

## Review

Reviewed by Opus (AI team lead).

Findings:

- Rule, SQL and pure function match the Decision: `paidTowardSql` and `isPaidToward` use the same involved set (payer
  plus shares above zero), the same `>=` boundary and both transfer sides. DELETE and PATCH check it inside the UPDATE,
  with the removed-member code first; the hide route keeps permissions in `worker/policy.ts`.
- The expense list kept the "All expenses" choice after the last hidden expense was shown again. The toggle then
  disappeared, and the next hide left the row on screen with no way to switch. Fixed: `showAll` resets once nothing is
  hidden, and the e2e spec covers a second hide.
- The two toggle buttons looked identical; the pressed one is now the solid button and the other uses `button--ghost`.
- `e2e/hide-expense.spec.ts` matched the toast text twice (the live region and the visible toast) and the hidden badge
  as a substring of the toast. It now uses `.toasts__text` and `.expense-list__hidden`, as other specs do.
- `docs/design.md` still named `0012_sessions.sql` as the newest migration; it now names `0013_expense_hidden.sql`.

Checks in the worktree: `npm run typecheck` passed, `npm run lint` passed, `npm test` 52 files, 647 tests passed;
e2e `hide-expense`, `edit-expense`, `receipts`, `attendance` and `csv-export` passed on desktop and mobile.
