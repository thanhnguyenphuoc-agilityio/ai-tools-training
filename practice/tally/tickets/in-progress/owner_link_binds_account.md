# Owner recovery link binds the group to the account

| Field | Value |
|---|---|
| ID | `TAL-46` |
| Labels | `type::improvement`, `priority::medium`, `area::auth` |
| Reporter | Product owner (human) |
| Assignee | Haiku (developer) |
| Depends on | `google_sign_in` |
| Related | `delete_account`, `joined_groups_list`, `member_email_invite`, `transfer_ownership` |

## Description

The owner recovery link is meant for people who use the app without an account. A signed-in owner does not need it:
the account already gives owner access on every device. Today an owner key keeps working next to the account, so
anyone who gets hold of the recovery link can still take owner access.

The request:

- A group created while signed in belongs to the account; no recovery link is needed for it.
- When a signed-in person opens an owner recovery link of a group that no account owns yet, the group and the owner
  member are attached to their account automatically, without the "Link to my account" step.
- The same applies to an owner who created a group without an account and signs in later on the same device: the
  owner access held on that device (owner key cookie) attaches the group and the owner member to the account
  automatically, as if the recovery link had been opened.
- From then on the recovery link no longer works. Owner access is tied to the account (its Google email), and nobody
  else can take it with an old link.

## Notes from the reporter

- Anonymous use stays as today: a group created without an account keeps its recovery link until the owner signs in
  and opens it.
- Open points:
  - Whether a group created while signed in shows a recovery link at all, and what the interface shows instead.
  - What happens on other devices that already hold the owner key cookie of that group when the key is revoked.
  - Whether the owner still needs a confirmation before an opened recovery link attaches the group, or it is fully
    automatic.
  - What an opened recovery link answers after it was revoked (error code and message), and when the group belongs
    to another account.
  - How this fits `delete_account`, which today detaches owned groups and relies on the owner key for continued
    owner access: a group whose key was revoked would have no owner left.
  - Whether attaching is a change of the group (activity and `audit_log`), as "Link to my account" is today.
  - Whether existing groups that are already linked to an account lose their key in a migration or only on the next
    use.

## Answers

From the product owner (human):

1. A group created before signing in is attached right after sign-in, not on the next visit. Owner key cookies are
   sent only to the API path of their own group, so the sign-in request cannot see them; the interface therefore
   goes through the groups in the device history after a successful sign-in and asks each group to attach it.
   Groups where the device holds no owner key, or that another account already owns, are skipped silently.
2. Deleting the account (`delete_account`) is refused while the account owns a group that has other members (not
   removed). The owner first hands the group over to another member (`transfer_ownership`) or removes the other
   members. A group where the owner is the only active member does not block the deletion; it stays without an
   owner and is deleted by the inactivity rule.
3. A group created while signed in gets no owner key and shows no recovery link; the interface shows "Owner access is
   tied to your account" instead.
4. Opening a recovery link while signed in attaches the group without a confirmation step and shows a toast.
5. Attaching revokes the owner key of the group. Owner key cookies on every device stop granting owner access and are
   cleared on their next request to the group.
6. A revoked recovery link answers `OWNER_KEY_REVOKED` (a new error code translated in every locale). A group owned
   by another account still answers `GROUP_OWNED_BY_OTHER_ACCOUNT`.
7. Attaching is a change of the group, like "Link to my account" today: audited as `group.link` and `member.link`,
   and `last_activity_at` moves.
8. A new migration revokes the owner key of every group that already has `owner_user_id`; it does not wait for the
   next use.
9. "Link to my account" stays for members with a device token; the owner part is no longer needed because owners
   attach automatically.

## Analysis

- Today `resolveIdentity` (`worker/auth.ts`) grants `isOwner` to any holder of the owner key cookie next to the account, and `POST /groups/:code` always issues a key. `groups.owner_key_hash` is `NOT NULL` (`0001_init.sql`).
- Revoked or absent key: sentinel value `revoked` (constant `REVOKED_OWNER_KEY` in `worker/auth.ts`). `sha256Hex` always yields 64 lowercase hex characters, so no key can match it; every comparison also checks the constant explicitly. A table rebuild was rejected: D1 enforces foreign keys and ignores `PRAGMA foreign_keys=OFF` in migrations, and the implicit delete of `DROP TABLE groups` would fire the `ON DELETE CASCADE` of every child table even with `defer_foreign_keys`. The sentinel is one reversible `UPDATE` with no schema change.
- Migration `0007_owner_key_revoke.sql` is the next free number after `0006_audit_details.sql`.
- Reading of Answer 7: attaching the owner records `group.link` (target: owner member) through `recordChange`, as "Link to my account" does today for an owner; device member links keep `member.link`.
- Answer 2 (`delete_account`) and Answer 9 (owner part of "Link to my account" removed) change existing rules; the old texts in `docs/business-rules.md` are rewritten.
- A signed-in claim refused by attach checks (account already another member, owner member linked elsewhere) answers today's codes and sets no cookie: a signed-in person never gets key-only owner access.
- Known limit: the account delete check (`countSharedOwnedGroups`) and the delete batch are two statements. A member that joins between them is detached with the group; the window is small and is documented in `docs/design.md`.

## Acceptance criteria

- Migration `0007_owner_key_revoke.sql` sets `owner_key_hash = 'revoked'` for every group with `owner_user_id IS NOT NULL`; other groups keep their hash.
- Creating a group while signed in stores the sentinel, sets no owner cookie, answers `ownerKey: null`; the page shows "Owner access is tied to your account" instead of the recovery link. Anonymous creation is unchanged.
- `POST /groups/:code/owner/claim` with a valid key:
  - anonymous: unchanged (cookie set, `owner.claim` via `audit()`, `attached: false`);
  - signed in, group not owned: attaches group and owner member to the account, revokes the key, clears the owner cookie, `recordChange` `group.link`, answers `attached: true`; the UI shows a toast without a confirmation step.
- Claim on a revoked group: signed in and owner is the caller: `{ ok: true, attached: false }`; owned by another account: `403 GROUP_OWNED_BY_OTHER_ACCOUNT`; otherwise `403 OWNER_KEY_REVOKED`.
- `POST /groups/:code/owner/attach` (signed in, `401 SIGN_IN_REQUIRED` otherwise) attaches when the device owner cookie matches a live key; answers `{ ok: true, attached: false }` without writing for no key, revoked key, group owned by another account, account already another member, owner member linked elsewhere.
- After a successful sign-in, the UI calls attach for each group in the device history, sequentially, ignoring failures, then refreshes.
- A request with an owner cookie for a revoked group gets no owner access and a `Set-Cookie` clearing `tally_owner_<code>`; a GET still writes nothing to the DB.
- `canLinkAccount` is true only for a device token of a non-owner member not linked to any account, with no other member for the account; `linkToAccount` has no owner branch.
- `POST /groups/:code/lock` on a group owned through the key still attaches first (now revoking the key). The order of the checks stays: `OWNER_ONLY` first, then `GROUP_OWNED_BY_OTHER_ACCOUNT`.
- `DELETE /api/me` answers `409 ACCOUNT_OWNS_SHARED_GROUP` (params `{ count }`) while the account owns a group with at least one active non-owner member; a solo owned group does not block, it ends without owner (key already revoked) and is purged by inactivity.
- New codes translated in `en` and `vi`.

## Test matrix (QA)

| Case | Expected |
|---|---|
| Create signed in | `ownerKey` null, no owner cookie, hash = sentinel, owner via account |
| Create anonymous, open recovery link anonymous elsewhere | owner, `owner.claim` audited, activity unchanged |
| Open recovery link signed in, group free | attached, toast, key revoked, `group.link`, `last_activity_at` moved |
| Old recovery link after attach, anonymous | `403 OWNER_KEY_REVOKED`, translated message |
| Old recovery link, signed in as another account | `403 GROUP_OWNED_BY_OTHER_ACCOUNT` |
| Other device holding old owner cookie | not owner, cookie cleared on next request |
| Create anonymous, sign in on same device | group attached right after sign-in, appears as owned in groups list |
| History group owned by someone else / no key | skipped silently |
| Migration with linked and unlinked groups | only linked groups revoked |
| Delete account owning a group with Sam active | `409 ACCOUNT_OWNS_SHARED_GROUP` |
| Delete account owning solo group | succeeds; group has no owner |
| Member device token, signed in | "Link to my account" shown, `member.link` |
| Owner member device token without key | no "Link to my account" |

## Plan

1. Migration `migrations/0007_owner_key_revoke.sql`: one comment line plus one `UPDATE groups SET owner_key_hash = 'revoked' WHERE owner_user_id IS NOT NULL`. No schema change.
2. `worker/auth.ts`: export `REVOKED_OWNER_KEY`; in `resolveIdentity`, `hasOwnerKey` requires `group.owner_key_hash` not the sentinel and a match; when the owner cookie is present and the group is revoked, the cookie is cleared; export `clearOwnerCookie(c, code)` next to `clearSessionCookie`, reused by the routes.
3. `worker/accountLink.ts`: move the owner branch of `linkToAccount` into `attachOwnerGroup(db, group, me)`. Its groups `UPDATE` also sets `owner_key_hash` to the sentinel, in the same statement with the same `EXISTS` guards (both or nothing); the read-back refusals and the unique-violation mapping stay. Add `tryAttachOwnerGroup`, which maps `GROUP_OWNED_BY_OTHER_ACCOUNT`, `MEMBER_LINKED_ELSEWHERE` and `ACCOUNT_ALREADY_MEMBER` to `attached: false`. `linkToAccount` keeps only the device member branch and refuses an owner member.
4. `worker/policy.ts`: `canLinkToAccount(me, deviceMember)` without the owner branch, requiring a non-owner device member; add `requireNoSharedOwnedGroups(count)` throwing `409 ACCOUNT_OWNS_SHARED_GROUP` with params `{ count }`.
5. `worker/routes/groups.ts`:
   - `POST /`: when signed in, store the sentinel, set no owner cookie, answer `ownerKey: null`.
   - `GET /:code`: call `canLinkToAccount` with the device member, drop the owner member lookup, add `ownedByAccount`.
   - `POST /:code/owner/claim`: body-first order and its comment stay; revoked branch as in the criteria; signed in with a valid key: `attachOwnerGroup`, `clearOwnerCookie`, `recordChange` `group.link`; anonymous path unchanged plus `attached: false`.
   - New `POST /:code/owner/attach`: `requireAccount`, then `tryAttachOwnerGroup`; on attach `clearOwnerCookie` and `recordChange` `group.link`.
   - `POST /:code/lock`: `requireOwnerAccount` first, then `requireGroupNotOwnedByOther`, then `attachOwnerGroup` and `clearOwnerCookie` in place of `linkToAccount`. The `lock_limit_race` UPDATE and its read-back stay as they are.
   - `DELETE /:code/lock`: unchanged.
   - `worker/routes/link.ts`: unchanged except types (the action is now only `member.link`).
6. `worker/accountDelete.ts`: add `countSharedOwnedGroups(db, userId)`, counting owned groups with an active member where `is_owner = 0`. `worker/routes/account.ts` `DELETE /me` calls it and `requireNoSharedOwnedGroups` before `deleteAccount`; only that handler and the imports change.
7. `shared/types.ts`: `CreateGroupResponse.ownerKey` becomes `string | null`; add `GroupDto.ownedByAccount`. `shared/errors.ts`: add `OWNER_KEY_REVOKED` and `ACCOUNT_OWNS_SHARED_GROUP` after `MEMBER_LINKED_ELSEWHERE`.
8. Frontend:
   - `src/api.ts`: `claimOwner` typed `{ ok: true; attached: boolean }`; add `attachOwner(code)`.
   - New `src/ownerAttach.ts`: `attachDeviceGroups(api, history)`, sequential, swallows errors.
   - `src/account.tsx`: `afterSignIn()` runs `attachDeviceGroups(readHistory())` then `refresh()`, exposed in the context; `src/components/AccountMenu.tsx` calls it after Google sign-in and dev sign-in.
   - `src/pages/GroupPage.tsx`: a claim that answers `attached: true` shows the `ownerAccess.attached` toast. The refused-link message is kept in a local variable and set as the error after reload, because reload clears the error on success.
   - `src/components/OwnerKeyBanner.tsx`: new `OwnerAccessNote` card (text through `t()` only). `GroupPage` shows it when the navigate state has `created` and no owner key, and the visitor is the owner; `HomePage` passes `created: true` in the navigate state.
   - `src/components/MembersPanel.tsx` `OwnerSettings`: one line `ownerAccess.tied` when `group.ownedByAccount`.
   - `DeleteAccountDialog`: only the `deleteAccount.ownerWarning` text changes.
9. i18n `en.ts` and `vi.ts`: `ownerAccess.title`, `ownerAccess.tied`, `ownerAccess.attached`; errors `OWNER_KEY_REVOKED` and `ACCOUNT_OWNS_SHARED_GROUP` (with `{count}`); reworded `deleteAccount.ownerWarning`. `vi.ts` stays UTF-8 without BOM.
10. Tests:
    - New `tests/api/owner-link-binds-account.test.ts`: every matrix row; the migration through `createTestEnv({ beforeMigration: '0007_owner_key_revoke.sql', seed })` with one linked and one unlinked group; the `Set-Cookie` clearing header for a revoked group; GET writes nothing (audit count and `last_activity_at` unchanged); attach skip cases; delete refusal and solo deletion.
    - `tests/api/lock-groups.test.ts`: LG-4 expects `OWNER_ONLY` for lock and unlock of a group owned by another account, and the claim answers `GROUP_OWNED_BY_OTHER_ACCOUNT`; new LG-12 (a signed-in member of an account-owned group gets `OWNER_ONLY` for lock and unlock).
    - `tests/api/delete-account.test.ts`: DA-4 rewritten so a solo owned group is detached and has no owner access; DA-5 kept group must be solo; refusal case added.
    - `tests/api/account.test.ts`, `tests/api/groups.test.ts`, `tests/api/joined-groups.test.ts`: wherever they expect an owner key next to an account or the owner "Link to my account".
    - Unit: new `tests/unit/ownerAttach.test.ts`; `GroupDto` fixture in `tests/unit/groupCsv.test.ts` gets `ownedByAccount`.
    - E2E: new `e2e/owner-link-binds-account.spec.ts` (OL-7 sign-in attaches, OL-8 recovery link opened while signed in shows the toast, OL-9 revoked link shows the translated message after the group loads); `e2e/account.spec.ts`, `delete-account.spec.ts` and `lock-groups.spec.ts` updated where they rely on the old flow. Dev sign-in and synthetic emails only.
11. Docs in the same branch: `docs/business-rules.md` (Groups owner key, "Not changes", lock link bullet, Accounts "Link to my account", "Deleting the account", data and safety); `docs/design.md` (section 3 identity table and policy list, `google_sign_in` account linking bullets, `delete_account` section, purge recovery link bullet, `lock_groups` link bullet), and a new subsection `owner_link_binds_account (built)` before section 7 with the sentinel decision, migration `0007` and the known limit.
