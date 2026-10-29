# Editing an expense

| Field | Value |
|---|---|
| ID | `TAL-4` |
| Labels | `type::feature`, `priority::medium`, `area::expenses` |
| Reporter | Haiku (end user, group member) |
| Assignee | Haiku (developer) |
| Depends on | - |
| Related | - |

## Description

A member entered 2m instead of 200k and had to delete the expense and add it again. Expenses should be editable.

## Notes from the reporter

- If anyone can edit, a member could reduce their own share. It is unclear who should be allowed to edit.

## Analysis

The ticket asks for expenses to be editable instead of deleted and re-entered. The open points are who may edit
(author, owner, any member), which fields may change, and whether the previous values must be kept for the group
to see. First step: settle the permission and history rules with the product owner before any design, as
`docs/business-rules.md` marks this as an open question.

## Clarifying questions

1. Who may edit an expense: only its author, the owner, or both?
2. Which fields may change: amount, payer, participants, date, description?
3. Must the group see what changed (old and new values), or is the audit log enough?
4. Should shares be recomputed with the current rounding setting, or with the setting used when the expense was
   first saved?
5. What happens when an edit changes the balance of a member who has already sent or confirmed a transfer?

## Answers

From Haiku (reporter):

1. Both the author and the owner.
2. The amount was the problem; other fields referred to the product owner.
3. Other members should see that the expense was edited.
4. and 5. Referred to the product owner.

From the product owner (human):

2. All fields may change: amount, payer, participants, split, date and description.
3. A visible "edited" marker is required in the first version. The previous values are recorded in the audit log;
   showing the old amount in the interface is out of scope for now.
4. An edit counts as a new save and uses the group's current rounding setting. Shares are recomputed only when the
   amount, payer, participants or split change; editing only the date or description keeps the stored shares.
5. Nothing is blocked. Sent and confirmed transfers stay unchanged and balances are recalculated from the edited
   shares; any new difference is settled with a new transfer.

From the product owner (human), follow-up after review:

1. The author of the expense and the group owner may edit it. An expense without a recorded author can be edited
   only by the owner. The risk that a member reduces their own share is accepted for the first version: the
   "edited" marker shows the group that the expense changed, and the audit log records who changed it and the
   previous values.

## Acceptance criteria

- `PATCH /groups/:code/expenses/:id` accepts the same body as `POST /groups/:code/expenses`. All fields can change:
  amount, payer, participants, split mode, weights, typed exact amounts, date and description.
- Who may edit: the author of the expense and the group owner. An expense without a recorded author (`created_by`
  NULL) can be edited only by the owner.
- Refusals, with nothing changed on failure:
  - `403 EDIT_NOT_ALLOWED` for a member who is neither the author nor the owner.
  - `401 JOIN_FIRST` for a guest (no member identity and not the owner).
  - `404 EXPENSE_NOT_FOUND` for an unknown or deleted expense.
  - `409 EXPENSE_HAS_REMOVED_MEMBER` when the expense involves a removed member (the payer, or a participant with a
    share above zero).
  - The same `400` errors as `POST`: `PAYER_NOT_IN_GROUP`, `PARTICIPANT_NOT_IN_GROUP`, `NO_PARTICIPANTS`,
    `DUPLICATE_PARTICIPANT`, `INVALID_AMOUNT`, `INVALID_DATE`, `FIELD_REQUIRED`, `FIELD_TOO_LONG`, `INVALID_WEIGHT`,
    `INVALID_SHARE_AMOUNT`, `SPLIT_SUM_MISMATCH`.
- Shares are recomputed with the group's current `round_to` only when the amount, payer, split mode, participants,
  weights (compared in hundredths) or exact amounts change. An edit of only the date or the description keeps the
  stored shares.
- Exact mode stores the typed amounts through `splitExact` and applies no rounding (`exact_amount_split`).
- A request that repeats the stored values answers `changed: false`, writes nothing, adds no audit row and does not
  move `last_activity_at`.
- A real edit sets `expenses.edited_at` and records `expense.edit` through `recordChange` with the details
  `{ previous: { amount, payerId, description, spentOn, splitMode, shares }, sharesChanged }`. It moves
  `last_activity_at` ("editing an expense" is activity in `docs/business-rules.md`). It works the same in a kept
  group, because a lock only stops deletion.
- Sent and confirmed transfers are not changed by an edit; balances follow the edited shares.
- `ExpenseDto.editedAt` is the time of the last real edit, or null. The expense list shows an "edited" badge for it.
- The expense list shows the edit action to the author and the owner, and hides it when the expense involves a
  removed member.
- The form opens in edit mode with a Cancel action. The "expense edited" toast appears only when the save changed
  something.

## Test matrix (QA)

| Case | Expected |
|---|---|
| Author changes the amount | `200`, `sharesChanged: true`, shares recomputed with the group rounding |
| Real edit | `edited_at` set, `expense.edit` audit row with `previous`, `last_activity_at` moved |
| Date or description only | `sharesChanged: false`, stored shares unchanged |
| Repeat of the stored values | `changed: false`, no audit row, `last_activity_at` unchanged |
| Weight 2.3000000000001 against stored 2.3 | `changed: false` |
| Recompute after the group rounding changed | shares follow the current `round_to` |
| Owner edits another member's expense | succeeds |
| Owner with only the owner key (anonymous group) | succeeds |
| Other member edits | `403 EDIT_NOT_ALLOWED` |
| Guest edits | `401 JOIN_FIRST` |
| Expense with `created_by` NULL, edited by a member | `403 EDIT_NOT_ALLOWED`; the owner succeeds |
| Unknown or deleted expense | `404 EXPENSE_NOT_FOUND` |
| Each validation failure | the same `400` as `POST`, expense unchanged |
| Exact split edit | typed shares stored as given, no rounding; mismatch gives `SPLIT_SUM_MISMATCH` |
| Removed member in a share above zero or as payer | `409 EXPENSE_HAS_REMOVED_MEMBER` for the author and for the owner |
| Removed member with a zero share | edit allowed |
| Edit in a kept (locked) group | succeeds and is recorded |
| Member removed between the check and the UPDATE | `400` or `409`, expense unchanged |
| Same participants in another order | `changed: false` (shares compared by `memberId`) |
| Unit: `splitChanged` and `expenseFieldsChanged` cases, including the hundredths case | as stated above |
| Unit: `formatAmountInput` round-trips through `parseAmount` (VND, a two-digit currency, comma and dot locales) | parsed value equals the input amount |
| E2e: wrong amount `2m` corrected to `200k` | row shows the new amount and the edited badge; the settle panel follows |
| E2e: deleting the expense being edited | the form returns to adding with empty fields |

## Plan

1. Migration `migrations/0010_expense_edits.sql`: a comment, then `ALTER TABLE expenses ADD COLUMN edited_at TEXT;`.
   `audit_log.details` already exists from `0006_audit_details.sql`, so the migration does not add it.
2. `worker/groupData.ts`: `audit()` and `recordChange()` take an optional last parameter `details`, stored as JSON in
   `audit_log.details` (NULL when absent); existing callers are unchanged. Move `involvesRemovedMember(db, code, id)`
   here, since the PATCH refusal mapping uses it. `loadLedger` maps `editedAt` from `edited_at`.
3. `shared/types.ts`: `ExpenseDto.editedAt: string | null`. Update the unit fixtures that build an `ExpenseDto`
   (`groupCsv`, `groupSummary`, `settleView`, `expenseRow` tests) where typecheck reports them.
4. `shared/expenseEdit.ts` (new, pure):
   - `splitChanged(previous, next)` returns true when the amount, payer, split mode, the set of participants, a weight
     (compared as `Math.round(weight * 100)`, the same as `weightHundredths` in TAL-26) or a typed exact amount
     differs. Participants are matched by `memberId`, so their order does not matter.
   - `expenseFieldsChanged(previous, next)` compares payer, amount, description, date and split mode, so later
     items can add a field in one place.
5. `worker/policy.ts`: `requireCanEditExpense(me, expense)` after `requireCanDeleteExpense`. The owner passes;
   anyone else must be a member (`JOIN_FIRST` otherwise), and `created_by` must be set and equal to the caller
   (`EDIT_NOT_ALLOWED` otherwise). Listed in `docs/design.md` section 3.
6. `shared/errors.ts`: append `EDIT_NOT_ALLOWED`. The `en` and `vi` locales translate it, and
   `EXPENSE_HAS_REMOVED_MEMBER` now says "edited or deleted".
7. `worker/routes/expenses.ts`:
   - `parseExpense(c, code, roundTo)` takes the validation of the current POST body unchanged, with the same error
     codes, and returns the parsed expense with its computed shares. POST uses it with its existing `noneRemovedSql`
     batch, unchanged in behaviour.
   - `PATCH /:code/expenses/:id`: load the group, select the expense (404), `requireCanEditExpense`, refuse an
     expense with a removed member (409), load the stored shares, parse with the group's current `round_to`, compare
     with `splitChanged` and `expenseFieldsChanged`. When nothing changed, answer `changed: false` without writing.
     Otherwise one `db.batch`: the guarded UPDATE (sets `edited_at`, repeats the removed-member check), and when the
     shares changed, a DELETE and INSERT of the shares gated on `edited_at`. When the UPDATE changes no row, map to
     404, `EXPENSE_HAS_REMOVED_MEMBER`, `PAYER_NOT_IN_GROUP` or `PARTICIPANT_NOT_IN_GROUP`. Then `recordChange` with
     `expense.edit` and the details. The file header comment is updated.
8. `shared/money.ts`: `formatAmountInput(amount, rules, currency)` next to `toDecimalString`. `src/i18n/index.tsx`
   exposes `formatAmount`, and `useGroupMoney` passes it on.
9. UI:
   - `src/api.ts`: `updateExpense(code, id, expense)`, returning `{ id, sharesChanged, changed }`.
   - `src/components/Icon.tsx`: an edit (pencil) path.
   - `src/components/ExpenseList.tsx`: optional `onEdit` prop; an edit icon button next to the delete button, shown
     when the caller is the author or the owner and the expense has no removed member; the "edited" badge in the
     `expense-list__edited` element (`ExpenseList.scss`). The existing confirm dialog for delete is unchanged.
   - `src/components/ExpenseForm.tsx`: optional `editing` expense and `onCancel`. The fields start from the stored
     values; the preview shows the stored shares when the edit keeps them; saving calls `updateExpense` and shows
     the toast only when `changed`. The existing `onStale` and payer fallback are kept. The error state is the one
     the component already has.
   - `src/pages/GroupPage.tsx`: `editing` state; the form is keyed by `editing?.id ?? 'new'`; saving clears `editing`
     and reloads; reloading drops `editing` when that expense is gone; `onEdit` sets `editing` and scrolls to the top.
     The form props leave room for a later item to pass more fields.
10. i18n (`src/i18n/locales/en.ts`, `vi.ts`): `expenseForm.editTitle`, `expenseForm.editSubmit`,
    `expenseList.edited`, `expenseList.edit`, `expenseList.editLabel`, `toast.expenseEdited`, `errors.EDIT_NOT_ALLOWED`.
    Cancel uses the existing `common.cancel`.
11. Tests: `tests/api/edit-expense.test.ts`; `tests/unit/expenseEdit.test.ts`; `formatAmountInput` cases in
    `tests/unit/money.test.ts`; `edited` row cases in `tests/unit/expenseRow.test.ts`; `e2e/edit-expense.spec.ts`.
12. Docs: `docs/business-rules.md` (the "Editing an expense" rules replace the open question, rule 4 is extended, the
    removed-member bullet says "deleted or edited"); `docs/design.md` (`### edit_expense` section marked Built, and
    the section 3 list); `README.md` (editing removed from "Not in the MVP", and the sentence about the rules in the
    ticket is dropped).

## Merge request

Branch `feat/edit_expense` into `develop`. The merge request is opened on GitLab from this branch; its link is added
when it exists.

What changed:

- `PATCH /groups/:code/expenses/:id` takes the same body as `POST`. The author or the owner may edit; an expense
  without a recorded author can be edited only by the owner. A guest gets `JOIN_FIRST`, another member
  `EDIT_NOT_ALLOWED`, an unknown or deleted expense `EXPENSE_NOT_FOUND`, and an expense a removed member paid or owes
  a share of `EXPENSE_HAS_REMOVED_MEMBER`.
- Shares are recomputed with the group's current rounding only when the amount, payer, split, participants, weights
  (compared in hundredths) or typed exact amounts change. A date or description edit keeps the stored shares. Exact
  mode stores the typed amounts with no rounding. A request that repeats the stored values answers `changed: false`
  and writes nothing.
- A real edit sets `expenses.edited_at` (migration `0010_expense_edits.sql`) and records `expense.edit` with the
  previous values in the audit details. That moves `last_activity_at`. It works the same in a kept group. The UPDATE
  repeats the removed-member check, and the share rewrite is gated on the new `edited_at`, so a removal that commits
  in between changes nothing.
- The list shows an edit action to the author and the owner (hidden when a removed member is involved) and an
  "edited" badge. The form opens in edit mode with a Cancel action; the toast appears only when the save changed
  something. Deleting the expense being edited returns the form to adding.

Commands and results, run in `practice/tally`:

- `npm run typecheck`: pass.
- `npm run lint`: pass.
- `npm test`: 478 tests, 476 passed on the first run. Two tests in other files (`TO-1`, `GS-3`) timed out once with a
  poisoned Miniflare stub; both passed on the rerun.
- `npm run test:hooks`: 29 passed.
- `npx playwright test --config playwright.local.config.ts`: 132 passed, 2 skipped.

## Review

Reviewed by Opus (AI team lead).

- `PATCH /groups/:code/expenses/:id` reuses the `POST` validation (`parseExpense`), checks `requireCanEditExpense` in
  `worker/policy.ts` (author or owner; owner only when `created_by` is NULL), refuses an expense with a removed member
  and repeats that guard inside the `UPDATE`. Shares are recomputed with the current `round_to` only when
  `splitChanged` says so; a repeat of the stored values writes nothing. A real edit sets `edited_at` (migration
  `0010_expense_edits.sql`) and records `expense.edit` with the previous values through `recordChange`. This matches
  the answers and the acceptance criteria.
- Tests: `tests/api/edit-expense.test.ts`, `tests/unit/expenseEdit.test.ts`, `formatAmountInput` round trips and
  `e2e/edit-expense.spec.ts`.
- Finding: `shared/expenseEdit.ts` kept its own copy of the hundredths rule, waiting for `stored_weight_rounding`.
  Fix: it now uses `weightHundredths()` from `shared/money.ts`, which is on `develop`.
- Finding: the branch predates `stale_language_messages`, `wrong_name_claim` and `owner_member_tools`. Fix: `develop`
  merged into the branch with both sides kept: `ExpenseForm` and `ExpenseList` store a `UiMessage` in edit mode too,
  both new error codes and `EDIT_NOT_ALLOWED` are in every locale (the Vietnamese text uses the same word for owner as
  the other messages), and README no longer lists editing or owner tools as not built.
- Checks after the fix: typecheck and lint clean, 515 unit and API tests, e2e `edit-expense`, `exact-split`,
  `language-picker`, `remove-member`, `settle-up`, `ui-redesign`, `owner-member-tools` and `claim-member` 60 passed.

Confirmed by the human on local `develop`. Released in release/2026-10-29.
