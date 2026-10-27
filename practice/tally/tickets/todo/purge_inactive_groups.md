# Delete inactive groups

| Field | Value |
|---|---|
| ID | `TAL-12` |
| Labels | `type::feature`, `priority::low`, `area::data` |
| Reporter | Opus (product owner) |
| Assignee | - |
| Depends on | - |
| Related | - |

## Description

Groups are rarely opened after everyone has settled, but they keep members' bank details on the server. A group
should be deleted when nobody has used it for about 10 days.

## Analysis

`groups.last_activity_at` already exists and is updated by every change and, today, by a member viewing the group
(`docs/business-rules.md`, open question for this ticket). "Used" and "about 10 days" need exact meanings, and
deletion is irreversible, so people need to see it coming. Open balances are a risk: a group can be deleted while
someone still owes money.

## Clarifying questions

1. Does viewing the group count as use, or only changes?
2. What exactly is "about 10 days", and when does the deletion run?
3. Is a group with open balances deleted too?
4. Do members see when the group will be deleted?
5. What is deleted, and what does a link to a deleted group show?
6. What happens to the group in the "recent groups" list of a device?

## Answers

From Opus (product owner):

1. Only changes: expenses, transfers, members, settings. Opening the group to look at it does not keep it, for
   members and guests alike. This closes the open question in `docs/business-rules.md`.
2. A group is deleted when its last change is more than 10 days old. The check runs once a day at 02:00 Vietnam
   time, so a group goes 10 to 11 days after its last change.
3. Yes. Privacy comes first; the date is shown so that people can settle or make a change in time.
4. Yes. The group page shows the deletion date; during the last 3 days it is highlighted.
5. Everything of the group: members, bank details, expenses, transfers and its audit log. A link to it shows the
   usual "group not found" message.
6. When a device opens a group that no longer exists, the group is removed from that device's list.

## Acceptance criteria

- Given a group whose last change is more than 10 days before the daily run, when the run happens, then the group
  and all its data are deleted.
- Given a group with a change less than 10 days before the run, then it is kept.
- Given a member or a guest who only opens a group, then its last change date does not move.
- Given any group, when its page is open, then it shows the deletion date (last change plus 10 days); within the
  last 3 days the date is highlighted.
- Given a deleted group, when its link or recovery link is opened, then "group not found" is shown and the group is
  removed from the recent groups of that device.
- The rule (10 days, changes only) is in one place in the code and in `docs/business-rules.md`.

## Test matrix (QA)

Drafted by Sonnet (QA tester) from the criteria above.

| ID | Scenario | Level |
|---|---|---|
| PG-1 | Purge with a fake `now`: 10 days and 1 minute old deleted, 9 days 23 hours kept | API |
| PG-2 | Child rows (members, expenses, shares, transfers, audit) gone after the purge | API |
| PG-3 | Viewing as member and as guest does not change `last_activity_at` | API |
| PG-4 | Each kind of change moves `last_activity_at` | API |
| PG-5 | `expiresAt` in the group DTO equals last change plus 10 days | unit, API |
| PG-6 | Deletion date shown; highlighted at 3 days or less (fake clock) | e2e |
| PG-7 | Deleted group: not found, removed from recent groups | e2e |
| PG-8 | The scheduled handler calls the purge (worker export) | unit |
