# Editing an expense

| Field | Value |
|---|---|
| Labels | `type::feature`, `priority::medium`, `area::expenses` |
| Reporter | Haiku (end user, group member) |
| Assignee | - |
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

From Opus (product owner):

2. All fields may change: amount, payer, participants, split, date and description.
3. A visible "edited" marker is required in the first version. The previous values are recorded in the audit log;
   showing the old amount in the interface is out of scope for now.
4. An edit counts as a new save and uses the group's current rounding setting. Shares are recomputed only when the
   amount, payer, participants or split change; editing only the date or description keeps the stored shares.
5. Nothing is blocked. Sent and confirmed transfers stay unchanged and balances are recalculated from the edited
   shares; any new difference is settled with a new transfer.
