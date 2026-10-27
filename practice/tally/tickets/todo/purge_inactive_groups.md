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

## Clarifying questions (round 2, from the zero-questions test)

1. Today `last_activity_at` also moves when a member views a group. Would the first run delete groups that people
   kept alive only by viewing, without any warning?
2. Which actions exactly are changes? Opening a recovery link, claiming a name, saving settings with no
   difference, linking and locking are unclear.
3. What exactly is shown as the deletion date (date or time, which time zone), and when do "the last 3 days"
   start?
4. Where is the date shown, and with which wording?
5. Who deletes expired sign-in sessions?

## Answers (round 2)

From Opus (product owner), with the details agreed with the developer:

1. No group may disappear by surprise. The migration that ships this rule sets `last_activity_at` of every existing
   group to the time of the migration, so every group gets its full 10 days after the release.
2. Changes: adding or deleting an expense, recording or confirming a transfer, adding, editing, claiming or removing
   a member, saving group settings that differ from the current ones, and (later tickets) linking and locking. Not
   changes: viewing (anyone), opening a recovery link, signing in. They stay in the audit log where they are today,
   but only changes move `last_activity_at`.
3. The group DTO gains `expiresAt` = last change plus exactly 10 days. The page shows the date only, in the
   viewer's time zone and language: "Deleted if nothing changes by {date}". The highlight starts 72 hours before
   `expiresAt`. The actual deletion happens at the first daily run after `expiresAt`.
4. One line in the group header, under the summary row, muted; highlighted with the warning colors and the extra
   sentence "Add an expense or a transfer to keep it." during the last 72 hours.
5. `google_sign_in`. This ticket only provides the scheduled handler that later jobs join.

Boundary: a group whose last change is exactly 10 days before the run is kept; one minute more and it is deleted.

## Acceptance criteria

- Given a group whose last change is more than 10 days before the daily run, when the run happens, then the group
  and all its data are deleted.
- Given a group with a change less than 10 days before the run, then it is kept.
- Given a member or a guest who only opens a group, then its last change date does not move.
- Given any group, when its page is open, then it shows the deletion date (last change plus 10 days); within the
  last 72 hours the date is highlighted.
- Given a deleted group, when its link or recovery link is opened, then "group not found" is shown and the group is
  removed from the recent groups of that device.
- The rule (10 days, changes only) is in one place in the code and in `docs/business-rules.md`; the open question
  on viewing is closed there and in `docs/design.md`.
- Given existing groups, when the migration of this ticket runs, then each of them has 10 days from that moment.
- Given a recovery link opened or a sign-in, then the last change date does not move.

## Test matrix (QA)

Drafted by Sonnet (QA tester) from the criteria above.

| ID | Scenario | Level |
|---|---|---|
| PG-1 | Purge with a fake `now`: exactly 10 days kept, 10 days and 1 minute deleted, 9 days 23 hours kept | API |
| PG-2 | Child rows (members, expenses, shares, transfers, audit) gone after the purge | API |
| PG-3 | Viewing as member and as guest does not change `last_activity_at` | API |
| PG-4 | Each change in answer 2 (round 2) moves `last_activity_at`; recovery link, sign-in and unchanged settings do not | API |
| PG-9 | Migration gives existing groups 10 days from the migration time | API |
| PG-5 | `expiresAt` in the group DTO equals last change plus 10 days | unit, API |
| PG-6 | Deletion date shown; highlighted from 72 hours before `expiresAt` (fake clock) | e2e |
| PG-7 | Deleted group: not found, removed from recent groups | e2e |
| PG-8 | The scheduled handler calls the purge (worker export) | unit |
