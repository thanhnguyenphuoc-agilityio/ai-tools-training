# Removing a member

| Field | Value |
|---|---|
| Labels | `type::feature`, `priority::medium`, `area::members` |
| Reporter | Opus (product owner) |
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

From Opus (reporter):

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
a share column for removed members. Typecheck, 262 unit and API tests and 24 e2e tests pass on the branch.
