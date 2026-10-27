# Removing a member

| Field | Value |
|---|---|
| ID | `TAL-14` |
| Labels | `type::feature`, `priority::medium`, `area::members` |
| Reporter | Opus (AI team lead) |
| Assignee | Developer (trainee) |
| Depends on | - |
| Related | - |

## Question

A member has moved out of a shared house and asked to be removed from the group, but still owes last month's
utilities. Can the owner remove a member? If so, what happens to that member's debt?

## Analysis

The question has two parts: whether the owner may remove a member, and what happens to that member's balance. The
balances of a group always sum to zero, so a debt cannot simply disappear; writing it off or moving it to someone
else would change other members' balances without their agreement. Past expenses and transfers reference the
member and must keep showing the name.

## Clarifying questions

1. Who may remove a member: only the owner, or also the member themself?
2. Can a member with a balance be removed, and if so, where does the balance go?
3. Should the removed member still appear in the history?

## Answers

From Opus (AI team lead):

1. Only the owner. The owner cannot remove themself.
2. No. The member settles up first (pays what they owe, or is paid what they are owed). The app does not write off
   or move debts. A short reason may be recorded.
3. Yes. Past expenses and transfers keep the name; the person can no longer be picked for new expenses.

## Plan

Branch: `feat/remove_member` from `develop`. The first three commits were written on `seeded/review` for the Day 10
review exercise; that branch is kept unchanged for the exercise, and the review fixes follow on this branch. Rules
in `docs/business-rules.md` ("Removing a member"); design in `docs/design.md` (`remove_member`).

## Merge request

The merge request is opened on GitLab from this branch; its link is added when it exists.

- Source branch: `feat/remove_member`. Target branch: `develop`.
- Changes: `POST /groups/:code/members/:id/remove` (owner only, zero balance, no pending transfer, optional reason
  of at most 200 characters), migration `0002_member_removal.sql` (soft delete), the device of a removed member
  becomes a guest, and the members panel shows a remove action for the owner and lists removed members with their
  reason.
- Review fixes, one commit each, each with a test that fails before it:
  - only the owner can remove a member (`requireCanRemoveMember` in `policy.ts`);
  - the hard-coded support header that skipped the balance check is gone;
  - a member who is owed money cannot be removed (the balance must be exactly zero);
  - the balance comes from `computeBalances`, so deleted expenses no longer count;
  - the reason is validated (text, at most 200 characters);
  - an expense paid or shared by a removed member can no longer be deleted (`EXPENSE_HAS_REMOVED_MEMBER`);
  - of two simultaneous removals only one succeeds;
  - members are listed in the order they joined again (the new order was outside the ticket);
  - the bank details of a removed member are no longer returned;
  - the Vietnamese label says "removed" instead of "left the group" (no test; text only).
- Known gap, recorded in `docs/design.md`: an expense written between the balance check and the update is not
  detected, since D1 has no interactive transaction.
- `e2e/remove-member.spec.ts` covers the flow on desktop and phone. Typecheck, 262 unit and API tests and 24 e2e
  tests pass.

## Review

Round 1 (two independent reviews of `seeded/review`) found 12 issues; all are fixed above. Round 2 approved after
two minor fixes, both done with a test that fails before the fix:

- an expense in which a removed member owes zero (an exact split with an empty field) can still be deleted;
- a removal reason of only spaces counts as no reason instead of returning `FIELD_REQUIRED`.

Nits done: the support header test sends a placeholder value, and `docs/design.md` says that the CSV export keeps
a share column for removed members.

- Replaced browser native `window.prompt` with an accessible in-app `RemoveMemberDialog` (follows `QrDialog` pattern with aria attributes, Escape key, backdrop click, autofocus, error banner, Cancel and Remove buttons). `e2e/remove-member.spec.ts` updated.

Typecheck, lint, 262 unit and API tests, 28 hook tests, and 24 e2e tests pass on the branch.

Second review (8 findings, all fixed; each bug fix has a test that fails before the fix):

- Removal race with new expenses and transfers: fixed. Their INSERT repeats the removed-member check
  (`INSERT ... SELECT ... WHERE NOT EXISTS`, shares in the same batch), and the removal checks the balance again
  after its UPDATE and undoes it with `MEMBER_HAS_BALANCE`. Five API tests simulate the interleavings with
  `interleave()` in `tests/api/helpers.ts`.
- Expense delete race: fixed. The removed-member check is a `NOT EXISTS` inside the soft-delete UPDATE.
- Settle-up suggestions naming a removed member: fixed. `src/settleView.ts` suggests transfers between current
  members only; a removed member with a non-zero balance is named in a note. Unit tests added.
- Remove dialog closing when a press inside it ends on the backdrop: fixed. It closes only when the press starts
  and ends on the backdrop. Covered in `e2e/remove-member.spec.ts`.
- Expense form keeping a removed payer: fixed. The form falls back to a current payer, shows the error through
  `t()` and reloads the group. New e2e test.
- Delete button on an expense the API refuses to delete: fixed. A note replaces it (`involvesRemovedMember()`,
  unit tests added).
- `hasPendingTransfer` reading transfers twice: fixed. `memberSettlement()` reads both from one ledger.
- Reason input focused twice: fixed. Only `autoFocus` remains.

Typecheck, lint, 273 unit and API tests, 28 hook tests, and 26 e2e tests pass on the branch.
Released in release/2026-10-26.
