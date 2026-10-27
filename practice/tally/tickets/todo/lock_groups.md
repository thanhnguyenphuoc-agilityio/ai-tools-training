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

## Clarifying questions (round 2, from the zero-questions test)

1. A comment in `worker/policy.ts` and `docs/design.md` (section 3) mention a locked or closed group becoming
   read-only. Does a lock stop changes, or only stop the deletion?
2. When locking links the group to the account, are members changed too?
3. Which status codes and error codes do the refusals use?
4. What does locking a locked group, or unlocking an unlocked one, do? Is a lock a change?
5. Where is the action, and what exactly happens when the owner is not signed in?
6. What does the group DTO return for a locked group?
7. Two locks at the same moment could pass the limit of 10. Is that acceptable?

## Answers (round 2)

From Opus (product owner), with the details agreed with the developer:

1. Only the deletion. A locked group works as before. To avoid the confusion, the interface says "Keep this group"
   instead of "lock"; the code keeps the name `lock`. The read-only wording in `policy.ts` changes in this
   ticket's branch.
2. Superseded by round 3, answer 1.
3. `401 SIGN_IN_REQUIRED` without an account session; `403 OWNER_ONLY` for someone who is not the owner;
   `403 GROUP_OWNED_BY_OTHER_ACCOUNT`; `409 LOCK_LIMIT_REACHED` with `{ max: 10 }`.
4. Both answer `200` and change nothing. Locking and unlocking are changes (audited as `group.lock` and
   `group.unlock`).
5. In the group settings card of the members tab, visible to the owner. When the owner is not signed in, the action
   is shown with the note "Sign in to keep this group" and the sign-in button next to it.
6. `locked: boolean`, and `expiresAt: null` while locked.
7. Yes. The window is a few milliseconds for one person; it is recorded as a known limit in `docs/design.md`.

## Answers (round 3)

From Opus (product owner), after a second zero-questions test:

1. Locking a group that has no account yet links it exactly like "Link to my account" (`google_sign_in`): the group
   and the owner's member, with the same refusals (`409 ACCOUNT_ALREADY_MEMBER`, `409 MEMBER_LINKED_ELSEWHERE`).
   After that, "Link to my account" is no longer offered for that group.
2. Order of checks: someone who is not the owner gets `403 OWNER_ONLY` whether signed in or not; an owner who is
   not signed in gets `401 SIGN_IN_REQUIRED`.

## Acceptance criteria

- Given a signed-in owner with fewer than 10 locked groups, when they lock a group, then it is never deleted by the
  daily run and the page shows that it is kept until unlocked.
- Given a signed-in owner with 10 locked groups, when they lock another one, then it is refused with a message that
  names the limit.
- Given an owner who is not signed in, when they open the lock action, then they are asked to sign in first.
- Given a group that belongs to another account, when an owner here tries to lock it, then it is refused.
- Given a locked group, when the owner unlocks it, then the deletion date is 10 days after the unlock.
- Given a member or a guest, then they see the locked state but no lock action.
- Given a locked group, then expenses, transfers and members can still be changed.
- Given a locked group, then the group DTO has `locked: true` and `expiresAt: null`.

## Test matrix (QA)

Drafted by Sonnet (QA tester) from the criteria above.

| ID | Scenario | Level |
|---|---|---|
| LG-1 | Locked group survives purges at 10 days and 1 minute and at 30 days (fake `now`) | API |
| LG-8 | Lock twice and unlock twice: `200`, no change; audit has `group.lock` and `group.unlock` | API |
| LG-9 | Locked group still accepts an expense; DTO `locked: true`, `expiresAt: null` | API |
| LG-2 | 11th lock: `409 LOCK_LIMIT_REACHED` with `{ max: 10 }`; unlocking one allows another | API |
| LG-3 | Lock without an account session: `401 SIGN_IN_REQUIRED` | API |
| LG-4 | Lock a group owned by another account: `403 GROUP_OWNED_BY_OTHER_ACCOUNT` | API |
| LG-5 | Unlock sets the deletion date to unlock time plus 10 days | API |
| LG-6 | Member and guest: no lock action, locked state shown | e2e |
| LG-7 | Owner flow: sign in (dev), lock, unlock, both themes, 375px and 1366px | e2e |
