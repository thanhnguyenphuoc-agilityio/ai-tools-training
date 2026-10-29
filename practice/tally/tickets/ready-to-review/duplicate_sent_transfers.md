# "I have sent it" can be recorded many times for the same debt

| Field | Value |
|---|---|
| ID | `TAL-55` |
| Labels | `type::bug`, `priority::high`, `area::settle` |
| Reporter | Product owner (human) |
| Assignee | Haiku (developer) |
| Depends on | - |
| Related | `owner_member_tools` |

## Description

After a payer clicks "I have sent it", the suggested transfer stays on the settle-up page with its Pay button, so
the payer can record the same payment again and again. The receiver then sees several waiting transfers. If the
receiver confirms two of them, the balance goes past zero and the receiver now owes the payer money that was never
sent. After "I have sent it", the payer should wait for the confirmation instead.

## Reproduce

1. Group with Alex (owner) and Sam; Alex pays 100,000 for both, so Sam owes Alex 50,000.
2. Sam opens Settle up, clicks Pay, then "I have sent it". Repeat once more.
3. Alex sees two waiting transfers of 50,000 and confirms both.

Expected: the second "I have sent it" is refused; Sam's row says it is waiting for Alex to confirm.
Actual: two transfers are recorded; after both are confirmed, Alex owes Sam 50,000.

## Analysis

- `worker/routes/transfers.ts` `POST /:code/transfers` inserts a new `sent` transfer without looking for one that
  is already waiting between the same two members.
- Balances count only `confirmed` transfers (`shared/settle.ts`), so the suggestion does not change while a
  transfer is `sent`, and `SettlePanel.tsx` keeps offering Pay / Record for it.
- Confirm reads the status and then updates it in two statements; two quick confirms of the same transfer both
  pass the check (no balance change, but a duplicate `transfer.confirm` in the activity log). The UI button is not
  disabled while the request runs.

## Plan

1. Failing API tests first, in `tests/api/money-flow.test.ts` under `describe('transfers')`. That block's
   `beforeEach` makes Sam owe Alex 100,000. The tests use the existing `interleave()` helper, because in-process
   calls through `Browser` do not reliably overlap.
   - A second transfer from Sam to Alex while one is `sent` answers 409 `TRANSFER_PENDING` and inserts nothing.
     After the owner confirms the first, a new one is accepted.
   - The owner recording for a payer who already has a waiting transfer is refused the same way.
   - A transfer recorded between the check and the insert is refused: the raced request answers 409
     `TRANSFER_PENDING` and only one `sent` row exists.
   - A receiver removed before the insert still answers 400 `PARTICIPANT_NOT_IN_GROUP` and inserts nothing. This
     one passes before the fix too.
   - Two confirms of one transfer give one 200, one 409 `ALREADY_CONFIRMED`, and exactly one `transfer.confirm`
     audit row.
2. API, `worker/routes/transfers.ts`:
   - `POST /:code/transfers` keeps a single `INSERT ... SELECT`. Its `WHERE` adds `NOT EXISTS` a `sent` transfer
     with the same group, `from_id` and `to_id`. The bind list stays as it is. One statement is atomic, so two
     concurrent requests cannot both insert. The amount is ignored: any waiting transfer between the pair blocks a
     new one.
   - When the insert changes nothing, one follow-up read of the pending row decides the cause. A pending row
     answers 409 `TRANSFER_PENDING`; otherwise the existing 400 `PARTICIPANT_NOT_IN_GROUP`. A removed member cannot
     have a waiting transfer, so the two causes do not overlap.
   - Confirm keeps its `SELECT` (for the 404 and `requireCanConfirmTransfer`) and its early check for status
     `confirmed`. The `UPDATE` also requires `status = 'sent'`; zero changes answers 409 `ALREADY_CONFIRMED` before
     `recordChange`.
   - New code `TRANSFER_PENDING` in `shared/errors.ts`, translated in every locale. No policy change.
3. UI:
   - `payAction` in `src/ownerTools.ts` gains a third argument, the group's transfers, and returns `'waiting'` when
     a `sent` transfer matches the suggestion's payer and receiver. `SettlePanel` shows "Waiting for {to} to
     confirm" instead of Pay or Record payment. Unit tests in `tests/unit/ownerTools.test.ts`.
   - The Confirm button is disabled while its request runs.
   - `QrDialog`: "I have sent it" is disabled while saving, and a `TRANSFER_PENDING` error shows inside the dialog.
4. Existing duplicate `sent` rows are left as they are (local and test data only).
5. Docs: one bullet in the settle section of `docs/business-rules.md`, and one in the `owner_member_tools` section
   of `docs/design.md`.

## Acceptance criteria

- (a) A second "I have sent it", or an owner "Record payment", for the same payer and receiver while one transfer
  is still `sent` answers 409 `TRANSFER_PENDING` and inserts nothing.
- (b) After that transfer is confirmed, a new transfer is accepted.
- (c) Two confirms of one transfer give exactly one 200, one `transfer.confirm` audit row, and 409
  `ALREADY_CONFIRMED` for the other.
- (d) The settle-up row shows "Waiting for {to} to confirm" instead of Pay or Record payment.
- (e) The Confirm and "I have sent it" buttons are disabled while their request runs.

## Clarifying questions

1. Should the receiver be able to reject a waiting transfer that never arrived, so the payer can record it again?
   Suggested: not in this ticket; a follow-up ticket if wanted.

## Answers

From the product owner (human), 2026-10-29: 1. Not in this ticket; a follow-up ticket if wanted.

## Merge request

Branch `fix/duplicate_sent_transfers` into `develop`.

- `POST /groups/:code/transfers` keeps one `INSERT ... SELECT`, now also requiring that no `sent` transfer exists for
  the same group, payer and receiver. When the insert writes nothing, one follow-up read answers 409 `TRANSFER_PENDING`
  for a pending row and 400 `PARTICIPANT_NOT_IN_GROUP` otherwise.
- Confirm updates only a row that is still `sent`. Zero changes answers 409 `ALREADY_CONFIRMED` before the audit row.
- `payAction` returns `waiting` while a `sent` transfer matches the suggestion, and the settle-up row shows
  "Waiting for {to} to confirm". The Confirm and "I have sent it" buttons are disabled while their request runs.
- Existing duplicate `sent` rows are left as they are. `tickets/README.md` now names `TAL-57` as the next free ID.

Commands, run in `practice/tally`:

- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm test`: two full runs hit Miniflare timeouts and poisoned stubs in unrelated files (the failing set changed
  between runs). `tests/api/money-flow.test.ts`, `tests/unit/ownerTools.test.ts` and `tests/unit/lintRules.test.ts`
  then passed together, 56 tests.
- `npm run test:hooks`: 29 passed.
- `npx playwright test --config playwright.local.config.ts e2e/settle-up.spec.ts e2e/owner-member-tools.spec.ts`:
  12 passed.
