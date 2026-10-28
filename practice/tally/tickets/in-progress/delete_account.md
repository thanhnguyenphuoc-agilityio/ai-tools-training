# Deleting an account

| Field | Value |
|---|---|
| ID | `TAL-40` |
| Labels | `type::feature`, `priority::low`, `area::auth` |
| Reporter | Product owner (human) |
| Assignee | Haiku (developer) |
| Depends on | `google_sign_in`, `saved_bank_details`, `lock_groups` |
| Related | `purge_inactive_groups` |

## Description

Groups are deleted after inactivity, but an account and the bank details saved in it are kept until the person
clears them. A signed-in person should be able to delete their account and everything stored with it.

## Notes from the reporter

- Raised during the capstone intake (`saved_bank_details`, round 2 answer 2).

## Analysis

An account stores the Google account id, email, display name, saved bank details (`saved_bank_details`) and sessions, and is referenced by `members.user_id` and `groups.owner_user_id`. Group data (members, expenses, transfers, bank details entered in a group, audit log) belongs to the group and is shared with other people, so it is not personal account data and is removed by `purge_inactive_groups`. One interaction needs care: a group kept with `lock_groups` is never purged, and its lock is counted per account; if the account disappears, the group would be kept forever with no account able to stop keeping it. The ticket therefore also depends on `lock_groups` (Depends on row updated to `google_sign_in`, `saved_bank_details`, `lock_groups`).

## Clarifying questions

1. What exactly is deleted, and what stays?
2. What happens to groups the person owns, and to groups they keep?
3. What happens to the members linked to the account?
4. Are the person's other devices signed out?
5. How is the deletion confirmed, and where is the action?
6. Does the deletion count as a change of the groups?
7. What happens if the person signs in again with the same Google account?
8. What does the API answer without a session?

## Answers

From the product owner (human):

1. Deleted: the account row (Google account id, email, name, saved bank details) and every session of the account. Stays: groups and everything in them, including bank details entered in a group, which are removed with the group by the inactivity rule or can be cleared in the group.
2. Owned groups are detached (`owner_user_id` cleared) and keep working; owner access remains through the owner key on devices that hold it or the recovery link. Kept groups owned by the account stop being kept: the 10 days restart at the deletion time.
3. They are detached (`user_id` cleared). The member, its name and history stay; devices with a device token keep acting as that member.
4. Yes, all sessions of the account end. Device tokens and owner keys on the devices are not touched.
5. "Delete account" in the account menu opens a dialog that lists what is deleted and what stays, warns that owner access then depends on recovery links, and has a "Delete my account" button and a Cancel button. No typed confirmation.
6. Only for kept groups: each one is audited as `group.unlock` (actor `owner`, details `{ "reason": "account.delete" }`) and its `last_activity_at` moves to the deletion time. Detaching owners and members is not a change.
7. A new, empty account is created; earlier groups are not reattached automatically ("Link to my account" works where the person still holds the owner key or a device token).
8. `DELETE /api/me` without a session answers `401 SIGN_IN_REQUIRED`.

## Acceptance criteria

- Given a signed-in person, when they confirm "Delete my account", then the account row, its saved bank details and all its sessions are deleted, the session cookie is cleared and the interface is signed out.
- Given groups that used the saved bank details, then those members show no bank details afterwards (group details, when entered, stay).
- Given groups owned by the account, then they keep working, `owner_user_id` is cleared and the owner key still gives owner access.
- Given members linked to the account, then `user_id` is cleared and the members and their history stay.
- Given groups kept by the account, then they are no longer kept, their deletion date is 10 days after the account deletion, and each has a `group.unlock` audit entry.
- Given other groups, then `last_activity_at` does not move.
- Given a second signed-in device, then its session no longer identifies the person.
- Given a person who is not signed in, then there is no delete action and `DELETE /api/me` answers `401 SIGN_IN_REQUIRED`.
- Given the same Google account signing in again, then a new empty account is created.

## Test matrix (QA)

Drafted by Sonnet (QA tester) from the criteria above.

| ID | Scenario | Level |
|---|---|---|
| DA-1 | Delete: `users` row gone, all sessions gone, cookie cleared, `GET /api/me` returns `user: null` | API |
| DA-2 | Second session of the same account no longer resolves after the deletion | API |
| DA-3 | Member using saved details: `bankSource: null`; member with group details keeps them | API |
| DA-4 | Owned group: `owner_user_id` NULL, owner key still passes owner checks; linked members have `user_id` NULL | API |
| DA-5 | Kept group: `locked: false`, `expiresAt` = deletion + 10 days, audit `group.unlock`; purge at deletion + 10 days + 1 minute deletes it | API |
| DA-6 | Non-kept groups: `last_activity_at` unchanged, no audit rows | API |
| DA-7 | `DELETE /api/me` without a session: `401 SIGN_IN_REQUIRED` | API |
| DA-8 | Sign in again with the same email (dev): new account id, no saved details, no linked groups | API |
| DA-9 | Menu item, dialog text, cancel keeps the account, confirm signs out; both themes, 375px and 1366px | e2e |

## Plan

Branch `feat/delete_account` from `develop` (a1fed94), in parallel with `joined_groups_list`. The two branches share only the anchors listed below and are merged in the order `joined_groups_list` first, then `delete_account`.

Migration: the real `audit_log` has no `details` column. `migrations/0006_audit_details.sql` adds `details TEXT` (JSON text explaining an entry, NULL for entries that record only their target). `audit()` and `recordChange()` keep their signatures; no caller needs `details` yet except the account deletion batch. No new error code and no shared-group check.

- Migration `migrations/0006_audit_details.sql`: `ALTER TABLE audit_log ADD COLUMN details TEXT;` with the comment. The migration numbers used in the docs are the real ones: `0004_accounts.sql` (not `0005`), `0005_group_lock.sql`.
- New `worker/accountDelete.ts`: `deleteAccount(db, userId, now: string)` runs one `db.batch` (one transaction) of six explicit statements, in this order:
  1. `INSERT INTO audit_log (group_code, actor, action, target, details, at) SELECT code, 'owner', 'group.unlock', NULL, '{"reason":"account.delete"}', ?2 FROM groups WHERE owner_user_id = ?1 AND locked_at IS NOT NULL`
  2. `UPDATE groups SET locked_at = NULL, last_activity_at = ?2 WHERE owner_user_id = ?1 AND locked_at IS NOT NULL`
  3. `UPDATE groups SET owner_user_id = NULL WHERE owner_user_id = ?1`
  4. `UPDATE members SET user_id = NULL WHERE user_id = ?1`
  5. `DELETE FROM sessions WHERE user_id = ?1`
  6. `DELETE FROM users WHERE id = ?1`

  Statement 1 runs before statement 2 because it selects on `locked_at IS NOT NULL`. Explicit statements are used instead of the `ON DELETE` actions of `0004_accounts.sql`.
- `worker/routes/account.ts`: `DELETE /me` resolves the account with `resolveAccount`, then `requireSignedIn` (from `worker/policy.ts`, already present) gives `401 SIGN_IN_REQUIRED` without a session; calls `deleteAccount(c.env.DB, userId, now())`; clears the cookie with `clearSessionCookie(c)` (already present in `worker/auth.ts`, not changed); answers `{ ok: true }`.
- `src/api.ts`: `deleteMe()` right after `updateMe`.
- `src/account.tsx`: `deleteAccount()` in the context (calls `api.deleteMe()`, sets `user` to null, bumps `version`).
- `src/components/AccountMenu.tsx`: item `account.deleteAccount` between "My bank details" and sign out. It closes the menu and opens `DeleteAccountDialog` next to `SavedBankDialog`.
- New `src/components/DeleteAccountDialog.tsx` and `.scss` (block `delete-account`, danger button with `--color-negative` and `--color-surface` only): `useDialog(onClose, { canClose: !deleting })` on the panel ref; errors shown with `errorMessage(err)`; text from `deleteAccount.*`; Cancel uses `common.cancel`; on success `notify('deleteAccount.done')`.
- i18n (`en.ts`, `vi.ts`): `account.deleteAccount` after `account.bankDetails`; namespace `deleteAccount` (`title`, `deleted`, `kept`, `ownerWarning`, `confirm`, `done`) after `savedBank`. Vietnamese uses "Xoá" and "khoá" spelling as already used in `vi.ts`. Nothing added under `home`.
- Tests (failing first: `DELETE /api/me` answers 404 before the route exists, recorded before implementing):
  - `tests/api/delete-account.test.ts`: DA-1..DA-8. DA-5 uses `purgeInactiveGroups` from `worker/cleanup` and `INACTIVE_MS` from `shared/rules`, and asserts the audit `details` equals `{"reason":"account.delete"}`. DA-6 asserts no audit rows and unchanged `last_activity_at` for non-kept groups. Fake accounts `0123456789`, `9876543210`; names Alex and Sam.
  - `e2e/delete-account.spec.ts`: DA-9, both themes, 375px and 1366px, dev sign-in through `.account-menu__button`.
- Docs (same branch):
  - `docs/business-rules.md`: kept-groups bullet under Groups; "Deleting the account (`delete_account`)" sub-list after "Signing out" under Accounts; the saved-details line points to the new section. "What an account restores" is not touched.
  - `docs/design.md`: `### delete_account (built)` placed before `### purge_inactive_groups`; migration numbers bullet updated (`0006_audit_details.sql` is the newest and holds `delete_account`, `receipt_photos` moves to `0007_attachments.sql`, a later `edit_expense` migration must not add `audit_log.details` again); receipt_photos section updated to `0007_attachments.sql`. The `google_sign_in` heading and the `joined_groups_list` bullet are not changed.
- `README.md`: "Not in the MVP" drops "a per-account group list, saved bank details, locked groups", rewrapped.
- `tickets/README.md` Dependencies: `lock_groups` also needs `purge_inactive_groups`; `delete_account` also needs `saved_bank_details` and `lock_groups`.

Commits: `docs(tickets): start delete_account with a plan`, `feat: add the audit details column`, `feat: delete the signed-in account`, `feat: delete account dialog`, `test: cover deleting an account`, `docs: describe account deletion`, `docs(tickets): move delete_account to waiting-to-merge`.
