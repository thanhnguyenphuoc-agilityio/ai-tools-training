# Owner tools for other members

| Field | Value |
|---|---|
| ID | `TAL-11` |
| Labels | `type::feature`, `priority::medium`, `area::members` |
| Reporter | Product owner (human) |
| Assignee | Haiku (developer) |
| Depends on | - |
| Related | `remove_member` |

## Description

The business rules allow the owner to edit another member's receiving account and to record a transfer on behalf
of another member. The API supports both, but the interface offers neither: the bank form is shown only for the
current member, and the "Pay" button only for the current member's own debts. Members added by name who never
open the app therefore cannot receive a QR payment unless someone uses the API.

## Notes from the reporter

- Owners usually collect the account details in a chat and want to enter them for everyone.

## Analysis

The API already allows both owner actions, and `worker/policy.ts` stays unchanged:

- `PATCH /groups/:code/members/:id` checks `requireCanEditMember(me, memberId)`: the member themself or the owner.
  A removed member is refused by `loadActiveMember` with `MEMBER_REMOVED`.
- `POST /groups/:code/transfers` takes an optional `fromId` and checks `requireCanRecordTransfer(me, fromId)`: own
  transfers, or any transfer for the owner. A removed member is refused with `PARTICIPANT_NOT_IN_GROUP`.
- Existing API tests already exercise both actions:
  - owner `PATCH` of another member's bank: `tests/api/remove-member.test.ts` ("stops showing the bank details of a
    removed member");
  - owner `fromId` transfers: `tests/api/remove-member.test.ts` (the transfer with `fromId` of a member who is then
    removed, and the transfer that blocks a removal);
  - a plain member refused for someone else's transfer (`TRANSFER_SELF_ONLY`): `tests/api/money-flow.test.ts`
    ("does not let a member record someone else's transfer").
  The new API cases in `tests/api/groups.test.ts` add the missing owner-for-another-member paths.

The interface offers neither action:

- `MembersPanel` renders `BankForm` only for `me`.
- `SettlePanel` renders "Pay" only when `s.fromId === group.me.memberId`.
- `QrDialog.recordSent()` calls `api.recordTransfer(code, toId, amount)` without `fromId`.
- `api.recordTransfer` has no `fromId` parameter.

The real member row also holds other owner actions that this ticket must keep: "Make owner" (`transfer_ownership`),
the invite-email action (`member_email_invite`) and "Remove" (`remove_member`). `wrong_name_claim` adds a Release
action to the same row in the same batch; the two changes touch separate state and separate buttons.

This builds on `remove_member` (removed members are listed separately and cannot be edited) and on the existing
`BankForm` and `QrDialog` components.

## Reproduce

On `develop`:

1. Alex creates a group and adds Sam by name.
2. Alex adds a 90k expense shared by Alex and Sam.

Expected from the code paths above (not run in the app):

- The Members tab shows one bank form, Alex's own.
- Sam's row offers no account action for Alex.
- On the Settle tab, the plan shows "Sam → Alex" with no "Pay" button.

The owner cannot enter Sam's account or record Sam's transfer in the interface.

## Clarifying questions

1. Where does the owner enter another member's account? In the list, or on a separate page?
2. Which members can the owner edit? Members added by name only, or claimed members too? Removed members?
3. May the owner also rename a member here?
4. What does the owner see on a suggested transfer that is not their own, and what happens when it is used?
5. Should the owner be able to record a transfer for someone who already has one waiting for confirmation?
6. Should a plain member see any of these tools?

## Answers

From the product owner (human):

1. In the member list. Each current member's row has an "Edit account" action that opens the same bank form under that
   row, titled with the member's name. One form is open at a time; saving or cancelling closes it. The owner's own
   form stays at the top.
2. Every current member other than the owner's own member, claimed or not. The business rules already allow the owner
   to edit on a member's behalf, and the audit log records the change. Removed members cannot be edited (their bank
   details are no longer returned).
3. No. Renaming is not part of this ticket. The form edits the bank, account number and holder name only.
4. On each suggested transfer that is not the owner's own debt, the owner sees "Record payment". It opens the same
   transfer dialog with the receiver's account and the VietQR code (VND groups), so the debtor can scan it on the
   spot. The "I have sent it" button reads "Mark as sent by <debtor>". Saving records a `sent` transfer from the
   debtor. The receiver (or the owner) still confirms it as usual. On the owner's own debts the button stays "Pay".
5. Same as today for a member's own Pay button: the suggestion stays until a transfer is confirmed, and nothing new is
   blocked. Duplicate prevention is out of scope.
6. No. A plain member sees only their own bank form and their own Pay button. The server rules are unchanged and stay
   in `worker/policy.ts`.

## Acceptance criteria

- The owner sees "Edit account" on each active member row except the owner's own row.
- "Edit account" opens the bank form under that row, titled with the member's name. One form is open at a time.
- Save or Cancel closes the form.
- The form has no rename field.
- On the Settle tab, the owner sees "Record payment" on each suggested transfer whose payer is not the owner.
- "Record payment" opens the transfer dialog with the receiver's account; VietQR for VND groups; the title and the
  button name the debtor.
- Confirming in that dialog records a `sent` transfer from the debtor.
- A plain member sees no new controls.
- The existing "Make owner", invite email and "Remove" buttons stay.

## Test matrix (QA)

| Area | Case | Expected |
|---|---|---|
| Unit | Owner may edit an unclaimed and a claimed member | `canEditAccount` true |
| Unit | Owner may not edit self or a removed member; plain member may edit nobody | `canEditAccount` false |
| Unit | Debt between two other members, debt to the owner, plain member | `payAction` `recordFor`, `recordFor`, `null` |
| API | Owner `PATCH`es another member's bank with `0123456789` | 200 |
| API | Plain member `PATCH`es another member | 403 `EDIT_SELF_ONLY` |
| API | Owner records `fromId` transfer between two other members | 201, `fromId` stored |
| API | Plain member records `fromId` transfer of another member | 403 `TRANSFER_SELF_ONLY` |
| API | Owner edits a removed member | 409 `MEMBER_REMOVED` |
| E2E | Alex adds Sam and Jamie, edits Jamie's account, sees the row and the toast | account shown, toast shown |
| E2E | Expense paid by Jamie, shared by Jamie and Sam; Alex records Sam to Jamie | dialog shows `0123456789` and the QR canvas |
| E2E | Alex confirms "Mark as sent by Sam" | pending list shows Sam to Jamie |
| E2E | Taylor joins a second context | no "Edit account" and no "Record payment" buttons |

The API cases in `tests/api/groups.test.ts` (owner `PATCH` of another member, plain member `PATCH`, owner `fromId`,
plain member `fromId`, owner edit of a removed member) document existing behaviour. They pass before the change; they
are added to lock that behaviour in, not as a regression test for a bug.

## Plan

Branch `feat/owner_member_tools` from `develop` (4c72495). The ticket moves to `in-progress/`; the assignee is Haiku
(developer).

1. API client, `src/api.ts`: `recordTransfer` takes an optional `fromId` and sends it in the body with `toId` and
   `amount`. When `fromId` is undefined it is dropped from the JSON, so the current behaviour stays.
2. Display helper, `src/ownerTools.ts` (appended after `canSetInviteEmail`): `canEditAccount(me, member)` returns true
   for the owner on an active member other than the owner's own member. `payAction(me, settlement)` returns `pay` when
   the settlement's payer is the current member, `recordFor` when the current member is the owner, and `null`
   otherwise. The file mirrors `worker/policy.ts` for display only; the server enforces the rules.
3. Members list, `src/components/MembersPanel.tsx`: add one `editingId` state. Each active row keeps its current row
   as the first child (a `cluster cluster--between` div) and renders the bank form below it when open, inside a
   `list__item stack` row. The "Edit account" ghost button goes first in the action cluster, with aria-label
   `members.editAccountLabel`. Existing buttons keep their order (Make owner, invite email, Remove). The owner's own
   bank form stays at the top.
4. Bank form, `BankForm` in the same file: optional `forOther` and `onCancel` props. With `forOther`, the form skips the
   "using saved account" view and the "use saved" button, shows the title `members.bankTitleFor` and the hint
   `members.bankHintFor`, shows a Cancel button (`common.cancel`), and on save shows the toast `toast.bankSavedFor`
   and closes. Prefill from the stored values only when `bankSource` is `group`, as now.
5. Settle tab, `src/components/SettlePanel.tsx`: switch on `payAction`. `pay` keeps `settle.pay`. `recordFor` shows
   `settle.recordFor` with aria-label `settle.recordForLabel` (the debtor and the receiver) and opens the existing
   `QrDialog` for that settlement.
6. Transfer dialog, `src/components/QrDialog.tsx`: `isOther` is true when the settlement's payer is not the current
   member. When `isOther`, the title uses `qr.titleFor` and the send button uses `qr.sentFor`. `recordSent` passes the
   settlement's payer as `fromId`. The dialog keeps `useDialog` and its existing local `message` (the transfer note).
7. Translations: add the keys to `src/i18n/locales/en.ts` first, then `src/i18n/locales/vi.ts` in natural Vietnamese.
   New keys: `members.editAccount`, `members.editAccountLabel`, `members.bankTitleFor`, `members.bankHintFor`,
   `settle.recordFor`, `settle.recordForLabel`, `qr.titleFor`, `qr.sentFor`, `toast.bankSavedFor`. `common.cancel`
   already exists and is not added again. No error code is added.
8. Styles: the existing `list__item`, `cluster` and `card` blocks are enough. If the inline form needs spacing, add a
   BEM element to `src/components/MembersPanel.scss`, mobile first, with theme custom properties only.
9. No API route change, no `policy.ts` change, no migration.
10. Tests:
    - `tests/unit/ownerTools.test.ts` (appended): the `canEditAccount` and `payAction` cases from the test matrix.
    - `tests/api/groups.test.ts`: the five API cases from the test matrix, each in its own `it()` block, to stay within
      the test timeout.
    - `e2e/owner-member-tools.spec.ts` (new): the e2e cases from the test matrix, in the Vietnamese locale used by the
      other e2e specs, with text read through `t()`.
11. Docs: `docs/business-rules.md` (the receiving-account bullet and the balances section), `README.md` (the Owner
    concept row and "Not in the MVP"), and `docs/design.md` (`owner_member_tools` marked built, and one line in
    section 3 about `src/ownerTools.ts`).
12. Checks: `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:hooks` and the e2e run on port 5194.

## Merge request

The merge request is opened on GitLab from this branch; its link is added when it exists.

- Source branch: `feat/owner_member_tools`. Target branch: `develop`.
- Changes:
  - the owner sees "Edit account" on each active member row except their own; it opens the bank form under that row
    (`MembersPanel`, `BankForm` with `forOther`);
  - the owner sees "Record payment" on each suggested transfer whose payer is not the owner; it opens the transfer
    dialog for the payer (`SettlePanel`, `QrDialog`) and records a `sent` transfer from that payer;
  - `api.recordTransfer` takes an optional `fromId`; display helpers `canEditAccount` and `payAction` in
    `src/ownerTools.ts`.
- No API route change, no `policy.ts` change, no migration.
- The API cases in `tests/api/groups.test.ts` document existing behaviour and pass before and after the change.
- Commands and results (worktree `practice/tally`):
  - `npm run typecheck`: pass.
  - `npm run lint`: pass.
  - `npm test`: 40 files, 458 tests, all pass.
  - `npm run test:hooks`: 29 pass, 0 fail.
  - `npx playwright test --config playwright.local.config.ts` (port 5194): 130 passed, 2 skipped. The new spec
    `e2e/owner-member-tools.spec.ts` passes on desktop and mobile.
- Docs updated: `docs/business-rules.md`, `docs/design.md` (`owner_member_tools (built)` and section 3) and
  `README.md` (Owner concept row and "Not in the MVP").
