# Hand over a group to another owner

| Field | Value |
|---|---|
| ID | `TAL-47` |
| Labels | `type::feature`, `priority::medium`, `area::members` |
| Reporter | Product owner (human) |
| Assignee | Haiku (developer) |
| Depends on | `google_sign_in`, `owner_link_binds_account` |
| Related | `delete_account`, `remove_member`, `lock_groups` |

## Description

A group has exactly one owner and there is no way to change it. With `owner_link_binds_account`, owner access is
tied to the owner's account, and deleting an account is refused while the account owns a group with other members.
The owner needs a way to hand the group over to another member, who then becomes the owner with all owner rights.

## Notes from the reporter

- The previous owner stays in the group as a normal member, with their expenses and history.
- Open points:
  - Who can receive ownership: any active member, or only a member linked to an account (owner access is tied to an
    account, and a member without one has no recovery link).
  - Whether the new owner must accept, or the hand-over takes effect at once.
  - What happens to the recovery link and to owner key cookies on the previous owner's devices.
  - Whether a hand-over is a change of the group (activity and `audit_log`).
  - How a kept group (`lock_groups`) behaves when its owner changes.

## Answers

From the product owner (human):

1. Only an active member linked to an account can receive ownership. Owner access is tied to an account, so a
   member without one could not keep it.
2. On hand-over, the previous owner's owner access outside the account is removed: the group's owner key (recovery
   link) is revoked and owner key cookies on the previous owner's devices no longer grant owner access (cleared on
   their next request to the group).
3. A hand-over is not a change of the group: `last_activity_at` does not move.
4. The new owner does not have to accept. The owner confirms once in a dialog and the hand-over takes effect at
   once.
5. The hand-over is recorded in `audit_log` as `owner.transfer` (target: the new owner member) without moving
   `last_activity_at`, like `owner.claim` today.
6. A hand-over does not keep the group for the new owner: a kept group stops being kept (recorded as `group.unlock`, its
   10 days restart), and the new owner can keep it again. (Changed by the product owner on 2026-10-28; it was: A kept
   group (`lock_groups`) stays kept; the new owner can stop keeping it.)

## Feedback

From the product owner (human), 2026-10-28:

- A hand-over no longer keeps the group. A kept group stops being kept when its owner changes. The new owner gets a
  fresh 10-day window and can keep the group again, within `MAX_LOCKED_GROUPS`.
- Reason: a kept group handed over with its old `last_activity_at` would be purged at the next 02:00 cleanup. Clearing
  `locked_at` alone is not enough, so the hand-over moves `last_activity_at` to the hand-over time.

## Analysis

- Ownership is `groups.owner_user_id` plus `members.is_owner = 1` on exactly one active member. A hand-over moves both.
- The previous owner's recovery link and owner cookies are revoked with the sentinel `REVOKED_OWNER_KEY` from
  `worker/auth.ts` (set by `owner_link_binds_account`). The caller's own owner cookie is cleared on success; other
  devices holding the old cookie are cleared on their next request, because `resolveIdentity` ignores a revoked key.
- The receiver must be an active member linked to an account (Answer 1). The Members tab needs to know which members
  have an account, so `MemberDto.hasAccount` is a boolean only; no account id or email is returned.
- Not a change (Answer 3): the hand-over writes `audit_log` through `audit()` only, with action `owner.transfer`,
  target the new owner member and actor the previous owner member. `recordChange()` is not called.
- A kept group stops being kept (Answer 6). The unlock cannot go through `recordChange()`, because that opens its own
  batch and the unlock must apply only when the guarded ownership move won the race. The hand-over therefore clears
  `locked_at`, moves `last_activity_at` to the hand-over time and writes `group.unlock` with details
  `{"reason":"owner.transfer"}` (actor the previous owner member) in the same `db.batch` as the ownership move.
- The previous owner stays an active member with `user_id`, expenses and history. `countSharedOwnedGroups` counts groups
  by `owner_user_id`, so the previous owner's `delete_account` is no longer refused by this group.
- No migration: the change is a few statements on existing columns.

## Acceptance criteria

- `POST /api/groups/:code/owner/transfer` with body `{ memberId }`:
  - caller not owner: `403 OWNER_ONLY`;
  - unknown member: `404 MEMBER_NOT_FOUND`;
  - removed member: `409 MEMBER_REMOVED`;
  - the current owner member: `409 OWNER_TRANSFER_SELF`;
  - member without an account: `409 OWNER_TRANSFER_NOT_LINKED`;
  - success: `{ ok: true }`, `groups.owner_user_id` is the receiver's account, `owner_key_hash` is `'revoked'`,
    `is_owner` is on the receiver only, and the previous owner stays an active member with expenses and history.
- A hand-over of a group that is not kept keeps `last_activity_at` and writes exactly one `audit_log` row
  `owner.transfer` with the receiver as target and the previous owner as actor.
- The previous owner (account, and devices holding the old owner cookie) loses owner rights at once. Old owner cookies
  are cleared on their next request.
- The old recovery link answers `403 OWNER_KEY_REVOKED` when anonymous, and `403 GROUP_OWNED_BY_OTHER_ACCOUNT` when
  signed in as another account.
- A kept group is no longer kept after the hand-over (`locked` is false, `last_activity_at` is the hand-over time,
  one `group.unlock` row with `{"reason":"owner.transfer"}`). The new owner can keep it again through `POST /lock`.
- A kept group whose `last_activity_at` was 30 days old survives `purgeInactiveGroups` after the hand-over.
- Members tab: "Make owner" is shown only to the owner, only for active, non-owner members with an account. It opens
  one confirmation dialog. Success shows a toast.
- `delete_account` of the previous owner is allowed once the hand-over is done.

## Test matrix (QA)

| Case | Expected |
|---|---|
| Alex (owner) hands over to Sam (linked) | Sam is owner, Alex is a member, one `owner.transfer` row, `last_activity_at` unchanged |
| To Jamie (no account) | `409 OWNER_TRANSFER_NOT_LINKED` |
| To a removed member | `409 MEMBER_REMOVED` |
| To self | `409 OWNER_TRANSFER_SELF` |
| Non-owner calls | `403 OWNER_ONLY` |
| Anonymous key owner hands over | works; the recovery link is revoked |
| Device with the old owner cookie | not owner; cookie cleared on the next request |
| Old recovery link after hand-over | `403 OWNER_KEY_REVOKED` when anonymous; `403 GROUP_OWNED_BY_OTHER_ACCOUNT` when signed in as another account |
| Kept group | not kept after; `last_activity_at` is the hand-over time; one `group.unlock` row (`owner.transfer`); Sam can keep it again |
| Kept group, 30 days inactive, hand-over, then purge | group survives the purge |
| Not-kept group | no `group.unlock` row |
| Two simultaneous hand-overs | one succeeds, the other is refused; one owner; the losing race writes no `group.unlock` |
| Alex deletes account after hand-over | allowed |
| Sam opens the group | owner badge, owner tools and the deletion-date line; no kept line |

## Plan

1. No migration.
2. `worker/policy.ts`, at the end of the file: `requireCanTransferOwnership(me)` (owner only, `OWNER_ONLY`) and
   `requireTransferTarget(member)`. The target must not be the current owner (`OWNER_TRANSFER_SELF`) and must have a
   `user_id` (`OWNER_TRANSFER_NOT_LINKED`). Removed members are refused earlier by `loadActiveMember`.
3. `worker/routes/groups.ts`: new route `POST /:code/owner/transfer` after `owner/attach`.
   - Load the group, check `requireCanTransferOwnership`, read `memberId`, load the active member, check
     `requireTransferTarget`, and find the current owner member (`is_owner = 1`, not removed).
   - One `db.batch` of four statements sharing one hand-over timestamp: (a) the group takes the receiver's account as
     `owner_user_id` and `REVOKED_OWNER_KEY` as `owner_key_hash`, guarded by the previous owner still being the active
     owner member and the receiver still being an active member with that account; (b) `is_owner` moves to the receiver
     and off the previous owner, guarded by the group now being owned by the receiver with the revoked hash and the
     previous owner still being the owner; (c) the `group.unlock` audit row, inserted only while the group is kept and
     the ownership move applied; (d) `locked_at` is cleared and `last_activity_at` set to the timestamp, with the same
     guards. Statement (c) runs before (d), because it selects on `locked_at IS NOT NULL`.
   - Read back the receiver's member row. If it is not the owner: removed gives `MEMBER_REMOVED`, no account gives
     `OWNER_TRANSFER_NOT_LINKED`, otherwise the caller lost a race and gets `403 OWNER_ONLY`.
   - On success: `clearOwnerCookie` for the caller, then `audit(db, code, me, 'owner.transfer', receiverMemberId)`.
     `recordChange` is not used. Response `{ ok: true }`.
4. `worker/groupData.ts` `toMemberDto`: `hasAccount` is `false` for removed members and `user_id !== null` for active
   members. `shared/types.ts`: `MemberDto.hasAccount: boolean`. `shared/errors.ts`: append `OWNER_TRANSFER_NOT_LINKED`
   and `OWNER_TRANSFER_SELF` at the end of the list.
5. Frontend:
   - `src/api.ts`: `transferOwner(code, memberId)`.
   - New `src/ownerTools.ts`: `canTransferTo(me, member)` is true when the caller is the owner, the member is not
     removed, not the owner and has an account.
   - New `src/components/TransferOwnerDialog.tsx` and `.scss` (block `transfer-owner-dialog`, theme custom properties
     only, mobile first). The dialog uses `useDialog(onClose, { canClose: !busy })`, like `RemoveMemberDialog`. The
     panel carries the ref and `tabIndex={-1}`, the backdrop click is ignored while busy, and `data-autofocus` is on the
     Cancel button. The body says that no acceptance is needed, that the recovery link stops working and that the
     previous owner stays a member. `ownerTransfer.stopsKeeping` is shown only when the group is kept. One confirm
     button in the existing negative button style. Errors are shown through `errorMessage`. On success a toast
     (`ownerTransfer.done`) is shown, then the group reloads.
   - `src/components/MembersPanel.tsx`: a "Make owner" ghost small button in the member row action cluster next to
     Remove, shown when `canTransferTo`, with its own `aria-label`; the dialog is rendered next to `RemoveMemberDialog`.
6. i18n (`en.ts`, `vi.ts`; `vi.ts` stays UTF-8 without BOM, non-ASCII test input uses `\uXXXX`): block `ownerTransfer`
   with `action`, `actionLabel`, `title`, `body`, `stopsKeeping`, `confirm`, `cancel`, `done`, placed after
   `deleteAccount`; errors `OWNER_TRANSFER_NOT_LINKED` and `OWNER_TRANSFER_SELF` in both locales.
7. Tests:
   - API: new `tests/api/transfer-ownership.test.ts` covering each matrix row, the owner.transfer row and its actor and
     target, the `last_activity_at` equality, the cleared cookie, the revoked recovery link, the kept-group behaviour,
     the purge survival, two simultaneous hand-overs through `interleave` from `tests/api/helpers.ts`, and the
     `delete_account` of the previous owner afterwards. Long tests use a 30 s timeout.
   - Unit: new `tests/unit/ownerTools.test.ts` for `canTransferTo`. Existing `MemberDto` fixtures in
     `tests/unit/expenseRow.test.ts`, `groupCsv.test.ts`, `groupSummary.test.ts` and `settleView.test.ts` get
     `hasAccount: false`.
   - E2E: new `e2e/transfer-ownership.spec.ts`. Alex creates the group signed in, Sam joins signed in, Alex keeps the
     group and opens "Make owner" (the `stopsKeeping` text is visible), then confirms. Sam sees the owner badge, the
     owner tools and the deletion-date line, not the kept line. Alex no longer sees owner tools. Escape closes the
     dialog once.
8. Docs in the same branch:
   - `docs/business-rules.md`: Groups gets a "Handing over the group" bullet; the activity "Not changes" list adds a
     hand-over of a group that is not kept (audited as `owner.transfer`); the kept-groups list says a hand-over stops
     keeping the group (`group.unlock`, fresh 10 days); Accounts `delete_account` gets a cross-reference.
   - `docs/design.md`: section 3 policy list gets `requireCanTransferOwnership` and `requireTransferTarget`; a new
     subsection `transfer_ownership (built)` after `owner_link_binds_account` covers the endpoint, the four batch
     statements and their guards, why `recordChange` cannot be used for the unlock, the `hasAccount` DTO and the tests.

## Known limits (deferred)

- Device tokens of the previous owner member keep member-level access. Revoking them is not covered by the Answers;
  proposed as a backlog ticket.
- `delete_account` checks the owned groups and then deletes in a separate batch. A member joining in between can leave
  a shared group without an owner (D1 has no interactive transaction). Documented in `docs/design.md`.
