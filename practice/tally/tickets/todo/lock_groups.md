# Keep selected groups

| Field | Value |
|---|---|
| ID | `TAL-10` |
| Labels | `type::feature`, `priority::low`, `area::data` |
| Reporter | Opus (product owner) |
| Assignee | - |
| Depends on | `google_sign_in`, `purge_inactive_groups` |
| Related | - |

## Description

If inactive groups are deleted automatically, long-running groups such as a year-long shared fund must be kept.
The owner should be able to lock a group so it is never deleted.

## Notes from the reporter

- A limit of about 10 locked groups per owner is acceptable, so that not every group gets locked.

## Analysis

A lock exempts a group from `purge_inactive_groups`. The limit is "per owner", but an owner is only a device with
the owner key until `google_sign_in` exists; a limit per device could be bypassed by opening the recovery link on
another browser. Counting per account makes the limit real, which is why the ticket depends on both others.

## Clarifying questions

1. Is the limit exactly 10, and per account?
2. Who can lock and unlock a group?
3. What does an owner who is not signed in see?
4. What happens to the deletion date when a group is unlocked?
5. Who sees that a group is locked?

## Answers

From Opus (product owner):

1. Exactly 10 locked groups per account.
2. The owner, signed in. If the group does not belong to an account yet, locking links it to the owner's account.
   If it belongs to another account, the owner here cannot lock it.
3. The lock action, with a note that signing in is needed.
4. It restarts: the group is deleted 10 days after the unlock unless something changes.
5. Everyone who can view the group: the page says it is kept until the owner unlocks it, instead of a deletion date.

## Acceptance criteria

- Given a signed-in owner with fewer than 10 locked groups, when they lock a group, then it is never deleted by the
  daily run and the page shows that it is kept until unlocked.
- Given a signed-in owner with 10 locked groups, when they lock another one, then it is refused with a message that
  names the limit.
- Given an owner who is not signed in, when they open the lock action, then they are asked to sign in first.
- Given a group that belongs to another account, when an owner here tries to lock it, then it is refused.
- Given a locked group, when the owner unlocks it, then the deletion date is 10 days after the unlock.
- Given a member or a guest, then they see the locked state but no lock action.

## Test matrix (QA)

Drafted by Sonnet (QA tester) from the criteria above.

| ID | Scenario | Level |
|---|---|---|
| LG-1 | Locked group survives a purge 30 days later (fake `now`) | API |
| LG-2 | 11th lock refused with its error code; unlocking one allows another | API |
| LG-3 | Lock without an account session: refused | API |
| LG-4 | Lock a group owned by another account: 403 | API |
| LG-5 | Unlock sets the deletion date to unlock time plus 10 days | API |
| LG-6 | Member and guest: no lock action, locked state shown | e2e |
| LG-7 | Owner flow: sign in (dev), lock, unlock, both themes, 375px and 1366px | e2e |
