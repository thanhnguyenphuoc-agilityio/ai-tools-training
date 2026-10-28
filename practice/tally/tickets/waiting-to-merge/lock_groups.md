# Keep selected groups

| Field | Value |
|---|---|
| ID | `TAL-10` |
| Labels | `type::feature`, `priority::low`, `area::data` |
| Reporter | Product owner (human) |
| Assignee | Haiku (developer) |
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

From the product owner (human):

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

From the product owner (human), with the details agreed with the developer:

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

From the product owner (human), after a second zero-questions test:

1. Locking a group that has no account yet links it exactly like "Link to my account" (`google_sign_in`): the group
   and the owner's member, with the same refusals (`409 ACCOUNT_ALREADY_MEMBER`, `409 MEMBER_LINKED_ELSEWHERE`).
   After that, "Link to my account" is no longer offered for that group.
2. Order of checks: someone who is not the owner gets `403 OWNER_ONLY` whether signed in or not; an owner who is
   not signed in gets `401 SIGN_IN_REQUIRED`.

## Answers (round 4)

From the product owner (human), after the review of the ticket pack against the current `develop`:

1. Keeping and no longer keeping a group show a confirmation toast, like other saves (`ui_redesign`). The "kept
   until the owner unlocks it" line takes the place of the deletion date below the summary bar.

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

## Plan

Branch `feat/lock_groups` from `develop`. Migration `0005_group_lock.sql`. Intake, criteria and test matrix above are kept as they are.

### Data

- `migrations/0005_group_lock.sql`: `ALTER TABLE groups ADD COLUMN locked_at TEXT;` (NULL = not locked). No index: the count uses the existing `idx_groups_owner_user`.
- `shared/rules.ts`: `export const MAX_LOCKED_GROUPS = 10;`.
- `worker/groupData.ts`: `GroupRow.locked_at: string | null`.
- `worker/cleanup.ts`: `purgeInactiveGroups` query becomes `DELETE FROM groups WHERE last_activity_at < ? AND locked_at IS NULL RETURNING code`.

### Policy

- `worker/policy.ts`: `requireOwnerAccount(me): string` = `requireOwner(me)` (403 `OWNER_ONLY`) then `requireAccount(me)` (401 `SIGN_IN_REQUIRED`), in that order (round 3, answer 2). Replace the header comment "a locked group becomes read-only" with a neutral example (for example "a closed group becomes read-only"), since a lock only stops deletion.
- `shared/errors.ts`: append `LOCK_LIMIT_REACHED`.

### Endpoints (in `worker/routes/groups.ts`, no change to `worker/app.ts`)

- `POST /groups/:code/lock`:
  1. `loadGroup`; `requireOwnerAccount(me)`.
  2. If `group.owner_user_id !== me.userId`: `requireGroupNotOwnedByOther(me, group)` (403), then `linkToAccount(db, group, me)` (an owner whose group is not on this account necessarily holds the owner key, so the owner branch runs: both rows or nothing, refusals `409 ACCOUNT_ALREADY_MEMBER`, `409 MEMBER_LINKED_ELSEWHERE`). When it reports `changed`, `recordChange(..., 'group.link', memberId)` exactly like `worker/routes/link.ts`.
  3. If `locked_at` is already set: `200 { ok: true, changed: false }`, nothing written.
  4. `SELECT COUNT(*) FROM groups WHERE owner_user_id = ? AND locked_at IS NOT NULL`; `>= MAX_LOCKED_GROUPS` gives `409 LOCK_LIMIT_REACHED` with params `{ max: 10 }`. A link done in step 2 stays (it is its own audited change).
  5. `UPDATE groups SET locked_at = ? WHERE code = ? AND locked_at IS NULL`; `recordChange(..., 'group.lock', null)`; `200 { ok: true, changed: true }`.
- `DELETE /groups/:code/lock`: `requireOwnerAccount(me)`; `requireGroupNotOwnedByOther(me, group)`; not locked gives `200 { changed: false }`; otherwise `UPDATE groups SET locked_at = NULL`, `recordChange(..., 'group.unlock', null)`, so `last_activity_at` = unlock time and the expiry is unlock + 10 days.
- `GET /groups/:code`: `locked: group.locked_at !== null`, `expiresAt: locked ? null : expiresAt(group.last_activity_at)`.

### Types and client

- `shared/types.ts` (`GroupDto` only): `locked: boolean`; `expiresAt: string | null` with the comment updated.
- `src/api.ts`: `lockGroup(code)` (`POST`) and `unlockGroup(code)` (`DELETE`), both `{ ok: true; changed: boolean }`, placed right after `updateGroup`.
- `src/components/GroupExpiry.tsx`: takes `Pick<GroupDto, 'expiresAt' | 'locked'>`; when locked renders `t('group.expiry.kept')` without the warning modifier; `isExpiringSoon` only with a non-null date.
- `src/account.tsx`: context gains `requestSignIn(): void` and `signInRequest: number` (counter). `src/components/AccountMenu.tsx`: one `useEffect` near the top that opens the sign-in panel and focuses the button when `signInRequest` changes (no JSX changes there; the menu JSX is edited by `saved_bank_details`).
- New `src/components/KeepGroup.tsx` (+ `KeepGroup.scss`, BEM block `keep-group`, mobile first, theme tokens only), rendered at the end of the `OwnerSettings` card in `MembersPanel.tsx` (owner only):
  - signed in (`useAccount().user`): a switch/checkbox "Keep this group" with a hint; toggling calls `lockGroup`/`unlockGroup`, then reloads the group; confirmation `notify('keepGroup.kept' | 'keepGroup.released')` only when `changed`; errors shown under the control with `message({ error })` (covers `LOCK_LIMIT_REACHED` with `{max}`).
  - not signed in: the control disabled, the note `keepGroup.signInNote` and a button `keepGroup.signIn` that calls `requestSignIn()`.
- Members and guests see no control; everyone sees the kept line from `GroupExpiry`.

### i18n (`en.ts` and `vi.ts`, same places)

- `group.expiry.kept`: "Kept until the owner stops keeping it".
- New namespace `keepGroup` after `members`: `title`, `label` ("Keep this group"), `hint` ("A kept group is not deleted after inactivity. You can keep up to 10 groups."), `signInNote` ("Sign in to keep this group"), `signIn`, `kept` ("This group is kept."), `released` ("This group is no longer kept. It is deleted after 10 days without changes.").
- `errors.LOCK_LIMIT_REACHED`: "You already keep {max} groups. Stop keeping one first."

### Tests (all fail before the branch: no column, no route, no field)

- `tests/api/lock-groups.test.ts`: LG-1 (lock, then `purgeInactiveGroups` at last activity + 10 days + 1 minute and + 30 days keeps it; an unlocked group at the same time is deleted), LG-2 (lock 10 groups of one account, 11th gives `409 LOCK_LIMIT_REACHED` with `params.max === 10`, unlock one, lock succeeds), LG-3 (owner key without session: 401), LG-4 (group owned by account A, owner key used by signed-in B: 403 `GROUP_OWNED_BY_OTHER_ACCOUNT`), LG-5 (unlock at a known time: `expiresAt` = unlock + 10 days, `last_activity_at` updated), LG-8 (lock twice, unlock twice: `changed` false on repeats, audit has exactly one `group.lock` and one `group.unlock`), LG-9 (locked group accepts an expense; DTO `locked: true`, `expiresAt: null`). Extra: LG-10 lock on a group without account links group and owner member (`owner_user_id`, `members.user_id` set, `canLinkAccount: false`, audit has `group.link` then `group.lock`); LG-11 check order: guest signed out and member signed in both get 403 `OWNER_ONLY`; also `ACCOUNT_ALREADY_MEMBER` when the account already has another member in the group.
- `tests/api/purge.test.ts`: keep existing cases green (locked_at NULL by default).
- `e2e/lock-groups.spec.ts`: LG-6 (member and guest: kept line visible, no control) and LG-7 (owner signed out sees the note, clicks sign in, dev sign-in, keeps the group, kept line shown, stops keeping, deletion date shown; light and dark, 375px and 1366px).

### Docs (same branch)

- `docs/business-rules.md`, Groups > Automatic deletion: add "Kept groups" (owner signed in, up to 10 per account, linking on first keep, kept groups never purged, unlocking restarts the 10 days, keeping and unlocking are changes audited as `group.lock`/`group.unlock`, a kept group stays fully editable, everyone sees the kept line instead of the date).
- `docs/design.md`: section 3 adds `requireOwnerAccount` to the policy list and keeps the `requireWritable` sentence accurate; `lock_groups` section heading gets "(built)" with the final endpoint/response shapes and the known limit (two simultaneous locks); purge section "Migration numbers": `0005_group_lock.sql` is now the newest, `0006` stays reserved for `receipt_photos`.
- Do not edit `README.md` "Not in the MVP" (done by `delete_account`).

### Commits

`docs(tickets): start lock_groups with a plan`, `feat: add group lock column and purge exemption`, `feat: add lock and unlock endpoints`, `feat: keep this group control and kept line`, `test: add API and e2e tests for group locking`, `docs: describe kept groups`.

## Merge request

- Branch: `feat/lock_groups` into `develop`.
- The merge request is opened on GitLab from this branch; its link is added when it exists.
- Summary of changes:
  - Added migration `0005_group_lock.sql` adding `locked_at` to `groups`.
  - Updated `worker/cleanup.ts` to exempt kept groups from inactivity purge (`locked_at IS NULL`).
  - Added policy `requireOwnerAccount` in `worker/policy.ts` (checks `OWNER_ONLY` before `SIGN_IN_REQUIRED`).
  - Added endpoints `POST /groups/:code/lock` and `DELETE /groups/:code/lock` in `worker/routes/groups.ts`. Locking links unlinked owner account via `linkToAccount`, enforces `MAX_LOCKED_GROUPS = 10`, audits `group.lock`. Unlocking resets `locked_at` and updates `last_activity_at` via `recordChange(..., 'group.unlock')`.
  - Added `KeepGroup` UI component with keep checkbox, dev sign-in helper when unsigned, and toast notifications.
  - Updated `GroupExpiry` to display "Kept until the owner stops keeping it" without warning highlight.
  - Added comprehensive Vitest API test suite covering LG-1 to LG-5, LG-8 to LG-11 (10 test cases).
  - Added Playwright e2e test suite covering LG-6 and LG-7 (guest/member view and owner flow across themes and viewports).
  - Updated `docs/business-rules.md` and `docs/design.md`.
- What was adapted vs the draft:
  - Migration numbered `0005_group_lock.sql` (draft used `0006_group_lock.sql` due to draft's additional migrations).
  - Adapted against existing develop changes (`saved_bank_details`, `google_sign_in`, `purge_inactive_groups`).
  - Left out draft references to `delete_account`.
  - Handled `GroupExpiry` React impure Date warning cleanly with component state.
- Commands run and results:
  - `npm run typecheck`: clean (0 errors).
  - `npm run lint`: clean (0 errors, 0 warnings).
  - `npx vitest run`: 32 test files, 372 tests passed.
  - `npx playwright test`: 92 passed across desktop and mobile Chrome projects.
  - `npm run test:hooks`: 29 passed.
