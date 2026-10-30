# A member can leave a group

| Field | Value |
|---|---|
| ID | `TAL-63` |
| Labels | `type::feature`, `priority::medium`, `area::members` |
| Reporter | Product owner (human) |
| Assignee | Haiku (developer) |
| Depends on | - |
| Related | `remove_member`, `transfer_ownership`, `joined_groups_list` |

## Description

A member has no way to leave a group; only the owner can remove them. A member should be able to leave a group
on their own from the members tab. An owner who is alone in the group should be able to delete it.

## Answers

From the product owner (human), given with the request; the rules follow `remove_member` so balances stay
settleable:

1. Any active, claimed member except the owner can leave. The owner hands the group over first
   (`transfer_ownership`); the owner gets a refusal and sees no leave action.
2. Leaving needs a zero balance and no transfer waiting for confirmation, with the same refusals as removing a
   member. The person settles up first.
3. Leaving works like a removal: the member stays in past expenses and transfers with the name and shows in the
   removed list as "left the group" (no reason). The device and the account become guests, and the group leaves
   the joined groups list.
4. A confirmation dialog asks before leaving. The change is recorded in the activity log.
5. The owner cannot leave, but when the owner is the only active member (no other member that is not removed),
   the owner can delete the group from the members tab instead. A confirmation dialog asks first. Deletion is
   complete, as in the automatic deletion of `purge_inactive_groups` (members, bank details, expenses, shares,
   transfers, sessions, photos and the activity log); a kept group (`lock_groups`) can be deleted too. Afterwards
   the group leaves the device's recent groups and the joined groups list, and its links answer "group not found".
   While another active member exists, the delete action is not shown and the API refuses it.

## Acceptance criteria

- An active, claimed, non-owner member can leave from the members tab after a confirmation dialog; the owner sees no
  leave action and gets `CANNOT_LEAVE_OWNER` from the API.
- Leaving needs a zero balance and no pending sent transfer; otherwise the API answers `MEMBER_HAS_BALANCE` with the
  balance, and a race with a new expense is caught by the re-check after the update.
- After leaving, the member row is removed with `left_group = 1` and no reason; the removed list shows "left the
  group". The device becomes a guest (`me.memberId` null) and the account leaves the joined groups list.
- The change is recorded in the activity log as `member.leave` with the leaver as actor.
- The owner can delete the group only while no other member exists that is not removed (unclaimed members count).
  The delete is one guarded statement, cascades through D1 and removes the receipt photos from R2. A kept
  (`lock_groups`) group can be deleted.
- After deletion the device forgets the group, the joined list drops it, and its links show "group not found".
- The delete action is not shown and the API refuses it (`GROUP_HAS_MEMBERS`) while another active member exists.

## Plan

Branch `feat/leave_group` from `develop`, worktree `.scratch/wt/feat-leave-group`. This branch merges after
`create_group_account_name` (TAL-62), which bumps the next free ID; this ticket does not touch `tickets/README.md`.
Rules are in `docs/business-rules.md` (Members: "Leaving a group (leave_group)"; Groups: "Deleting a group
(leave_group)"); design in `docs/design.md` ("leave_group (built)", placed after `remove_member`).

Steps:

1. Migration `migrations/0014_member_left.sql`: adds `members.left_group INTEGER NOT NULL DEFAULT 0` with a
   one-line header comment. Older migrations are not edited.
2. Errors: add `CANNOT_LEAVE_OWNER` and `GROUP_HAS_MEMBERS` to `shared/errors.ts`; translate both in `en.ts` and
   `vi.ts` (type-checked).
3. Policy in `worker/policy.ts` only: `requireCanLeaveGroup(me)` (member required, owner refused, returns the member
   id), `requireCanDeleteGroup(me)` (owner only), `requireGroupAlone(otherActive)` (refuses above zero). Each gets a
   short doc comment.
4. Leave route `POST /groups/:code/leave` in `worker/routes/members.ts`: no body. The soft-removal block of the
   remove route moves into a local helper (`softRemove`) used by both remove and leave; it keeps the balance check,
   the guarded update (`removed_at IS NULL`, `meta.changes` check), the second balance check and the undo. The
   update also sets `left_group`, and the undo resets it. Leave passes no reason and `left = 1`, clears `user_id`
   and `invite_email`, and records `member.leave`.
5. Member DTO: `MemberRow` in `worker/groupData.ts` gains `left_group`; `toMemberDto` sets `left` (removed and
   `left_group = 1`) in both branches; `MemberDto` in `shared/types.ts` gains `left` with a comment. Member fixtures
   in unit tests get the new field.
6. Delete route `DELETE /groups/:code` in `worker/routes/groups.ts`: load the group (404), require the owner, then
   one guarded `DELETE FROM groups ... NOT EXISTS (other active member) RETURNING code`. No row back: if the group
   still exists, count the other active members and refuse with `GROUP_HAS_MEMBERS`; otherwise 404. `locked_at` is
   ignored. Child rows cascade. Then delete the R2 objects under `<code>/` through `deleteReceiptObjects` in a
   try/catch that logs, as in `worker/cleanup.ts`. Clear the owner cookie with `clearOwnerCookie`.
7. Live middleware in `worker/app.ts`: check that `DELETE /groups/:code` signals open pages; add the bare path if the
   wildcard misses it, and keep the comment accurate.
8. Client: `src/api.ts` gets `leaveGroup` and `deleteGroup`; `src/ownerTools.ts` gets `canLeaveGroup` and
   `canDeleteGroup`, mirroring the policy. New `LeaveGroupDialog.tsx` and `DeleteGroupDialog.tsx` on `ConfirmDialog`
   with `useDialog`; the leave dialog shows `leaveGroup.hasBalance` on `MEMBER_HAS_BALANCE`. `MembersPanel` gets the
   leave button (ghost, leaver only) and the delete button (danger, alone owner only), and shows `members.left` for
   left rows. `GroupPage` passes `onDeleted`, which forgets the group and navigates home. Strings only in the locale
   files; styles in BEM with theme properties.
9. Locales: `members.left`, `leaveGroup`, `deleteGroup` blocks, `toast.leftGroup`, `toast.groupDeleted` in `en.ts`
   and `vi.ts` (UTF-8, no BOM), placed near members, toast and errors only.
10. Tests: `tests/api/leave-group.test.ts` (leave, refusals, race with `interleave`, owner removal regression, delete,
    locked group, R2 cleanup, race, migration default via `beforeMigration`); unit tests for `ownerTools` and fixtures;
    live route list gets `POST /groups/:code/leave` and `DELETE /groups/:code`; `e2e/leave-group.spec.ts` covers
    leave, cancel, owner without leave, delete after removal, and the balance refusal.
11. Docs in the same branch: `docs/business-rules.md` (Members and Groups sections only) and `docs/design.md` (after
    `remove_member` and the migration-numbers bullet only).

Verification before the merge request: typecheck, lint, unit and API tests, and the hook tests. The batch runs e2e.

## Merge request

Branch `feat/leave_group` into `develop`.

A non-owner member can leave from the members tab, and an owner who is the only active member can delete the group.

- Migration `0014_member_left.sql` adds `members.left_group`. Leaving is a soft removal through the shared `softRemove`
  helper (`POST /groups/:code/leave`): zero balance and no pending sent transfer, `left_group = 1`, no reason, `user_id`
  and `invite_email` cleared, `member.leave` recorded with the leaver as actor. The owner gets `CANNOT_LEAVE_OWNER`.
- `DELETE /groups/:code` is one guarded statement: no other member with `is_owner = 0` and `removed_at` null (unclaimed
  members count). Child rows cascade; receipt photos under `<code>/` are deleted from R2. A kept group can be deleted.
  Another active member gets `GROUP_HAS_MEMBERS`.
- Policy lives in `worker/policy.ts` (`requireCanLeaveGroup`, `requireCanDeleteGroup`, `requireGroupAlone`). The client
  mirrors it in `ownerTools.ts` and adds `LeaveGroupDialog` and `DeleteGroupDialog` on the members tab. A left row shows
  "left the group". After a delete the device forgets the group and goes home.
- New error codes `CANNOT_LEAVE_OWNER` and `GROUP_HAS_MEMBERS` are translated in both locales. Docs: Members and Groups
  in `docs/business-rules.md`, and "leave_group (built)" in `docs/design.md` after `remove_member`.

Verification, run in the worktree on 2026-10-30:

- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm test`: 54 files, 686 tests. The first run had 2 timeouts (`account.test.ts` GS-3, `transfer-ownership.test.ts`
  TO-1) with a Miniflare `ECONNRESET`; a rerun of those files plus `leave-group.test.ts` passed (59 tests).
- `npm run test:hooks`: 29 tests, 0 failed.
- `e2e/leave-group.spec.ts` is new and is left for the batch e2e run.

## Review

Reviewed by Sonnet (QA tester). The QA pass reported one major finding and one nit, did not finish its regression
proof, and committed no change. The Opus review below supersedes it.

Reviewed by Opus (AI team lead).

Findings:

- [rejected] QA major on the `DELETE /groups/:code` retry: each run of the guarded statement evaluates `NOT EXISTS`
  atomically on the current state, so a member who joins before the second run blocks it, and a join after it finds no
  group. The retry cannot delete a group that gained a member; it only lets an alone owner through when a removal commits
  between the refused statement and the count. The code and `docs/design.md` stay as built.
- [nit] Commits `af2959a` and `589dda1` share the author date 2026-10-30 11:10:44 +0700. Dates stay non-decreasing and
  within working hours; pushed history is not re-dated, and these commits are not rewritten.
- Policy only in `worker/policy.ts`; identity unchanged in `worker/auth.ts`; migration `0014_member_left.sql` is new;
  `softRemove` keeps the remove race handling in one place; both error codes are translated in both locales; the live
  middleware covers `DELETE /groups/:code` (the live test lists both routes).

Fixes:

- `tests/api/leave-group.test.ts`: two tests pin the retry. A removal between the refused statement and the count lets the
  owner delete; a join right before the second statement answers `GROUP_HAS_MEMBERS` and keeps the group and all four
  members. The QA probe left uncommitted in `worker/routes/groups.ts` and the test file was discarded.

Checks (feature worktree):

- `npm run typecheck`: clean.
- `npm run lint`: clean.
- `npm test`: 54 files, 688 tests passed.
- `e2e/leave-group.spec.ts`: run with the batch e2e on `develop`.

Confirmed by the human on `develop`. Moved to done on 2026-10-30.
Released in release/2026-10-30.
