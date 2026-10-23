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

Branch: `seeded/review` from `develop`. Rules in `docs/business-rules.md` ("Removing a member"); design in
`docs/design.md` (`remove_member`).
