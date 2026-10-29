# Invite a member by email

| Field | Value |
|---|---|
| ID | `TAL-49` |
| Labels | `type::feature`, `priority::medium`, `area::members` |
| Reporter | Product owner (human) |
| Assignee | Haiku (developer) |
| Depends on | `google_sign_in` |
| Related | `joined_groups_list`, `join_as_account` |

## Description

When a member adds another person by name, they can also enter that person's email address (optional). When the
invited person opens the group link while signed in with an account that has the same email, the group recognises
them: they are not asked to join or to pick "I am <name>", and they act as the invited member right away. The group
then also appears in their list of joined groups.

## Notes from the reporter

- The email stays optional; adding a person by name only keeps working as today.
- Other members must not see the email of an invited person. Today the email of an account is never returned in
  group data.
- Open points: who can enter or change the email (any member, or only the owner), what happens when the invited
  member was already claimed on another device, when the email matches but the account already has another member
  in the group, whether the email must be verified by Google, whether the match is a change of the group (activity
  and audit log), and what happens to the stored email when the member is removed or released.

## Answers

From the product owner (human):

1. The member who adds a person by name can enter the email at that moment. Afterwards only the owner can set or
   change it, and only while the member is not claimed.
2. Nobody sees the email: the API never returns it, not even to the owner. The interface only shows an "Invited by
   email" badge.
3. Matching compares the account's Google email with the stored email, ignoring case. Only verified Google emails
   (`email_verified`, already checked at sign-in) count; development sign-in counts as verified.
4. When a signed-in person opens the group, a member that matches the email, is not claimed and is not removed is
   linked to the account automatically, provided the account has no other member in the group. No "Who are you"
   step and no "I am <name>" click.
5. When the member is already claimed on another device, or the account already has another member in the group,
   nothing happens and no error is shown; the group opens as today.
6. The automatic link is a change of the group, like a claim: recorded in `audit_log` as `member.link` and
   `last_activity_at` moves.
7. The stored email is cleared when the member is linked, removed or released. It is not kept longer than needed.
8. A new migration adds `invite_email` to `members`.

## Analysis

- `POST /groups/:code/members` with `claim: false` adds a member by name (`worker/routes/members.ts`). Sign-in already
  refuses unverified Google emails (`worker/google.ts`), so every stored `users.email` counts as verified, and
  development sign-in counts as verified too (Answer 3).
- The automatic link runs on `GET /groups/:code` while signed in. It is a change (Answer 6), so this GET writes, but
  only when a link actually happens. Every other GET writes nothing.
- Not covered by the Answers, decided here: when the device already acts as a member, nothing happens (same as
  Answer 5). When two unclaimed members carry the same email, the oldest (`created_at`, then `id`) is linked.
- The email is stored trimmed and lowercased. Matching uses `lower()` on both sides.
- The real repository has no release route for a name yet (`wrong_name_claim` is in the backlog). Answer 7's
  "released" part therefore applies when that route lands. Known limit: until then, only claim, device link and
  removal clear the stored email. `docs/design.md` tells the future release route to clear `invite_email`.
- The migration is `0009_member_invite_email.sql`. Migrations `0007` and `0008` belong to `owner_link_binds_account`
  (TAL-46) and `join_as_account` (TAL-48), which are built in parallel; this ticket does not depend on their code.
- The add-person form gets its own phone layout: name, email and the add button stack on a phone and sit in one row
  from the `sm` breakpoint up.

## Acceptance criteria

- Migration `0009_member_invite_email.sql` adds `members.invite_email TEXT` (NULL means no invite). No index.
- `POST /groups/:code/members` with `claim: false` accepts an optional `inviteEmail`. Empty or spaces-only means none.
  Anything else must be a string of at most 254 characters, with no whitespace inside and exactly one `@` with text on
  both sides, else `400 INVALID_EMAIL`. Joining (`claim: true`) ignores the field. The error never contains the value.
- `PATCH /groups/:code/members/:id` with `inviteEmail` is allowed only for the owner (`403 OWNER_ONLY` otherwise), and
  only for an active member that is not claimed (`409 MEMBER_ALREADY_CLAIMED` when `token_hash` or `user_id` is set,
  `409 MEMBER_REMOVED` when removed). An empty string clears the email. The change is recorded as `member.update`.
  A body without `inviteEmail` leaves the stored email unchanged.
- The API never returns the email: no field in `MemberDto`, `GroupDto`, or error params. `MemberDto.invited` is true
  for an active, unclaimed member with an email. The members list shows an "Invited by email" badge.
- `GET /groups/:code` by a signed-in account with no member in the group and no device member: an active, unclaimed
  member whose `invite_email` equals the account email (ignoring case) gets `user_id` set to the account and
  `invite_email` cleared, in one guarded `UPDATE ... RETURNING`. The link is recorded with `recordChange` as
  `member.link`, with the linked member as target. The response shows `me.memberId` as that member, so no join panel.
- No match, a member claimed elsewhere, or an account that already has another member: nothing is written and no
  error is shown.
- `invite_email` is cleared on claim, on the device-member account link (`linkToAccount`), and on removal.
- After the automatic link, the group appears in `GET /api/me/groups`.
- `INVALID_EMAIL` is translated in `en` and `vi`.

## Test matrix (QA)

| Case | Expected |
|---|---|
| Alex adds Sam with `sam@example.com` | `201`, GET JSON has `invited: true` and no email string |
| Add with `not-an-email`, with a space inside, with two `@` | `400 INVALID_EMAIL`, value not in the error body |
| Owner sets email on unclaimed Jamie | ok, `member.update` audit row |
| Non-owner member sets email | `403 OWNER_ONLY` |
| Owner sets email on claimed member | `409 MEMBER_ALREADY_CLAIMED` |
| Owner edits bank details of an invited member, no `inviteEmail` sent | stored email unchanged |
| Sam signs in as `SAM@EXAMPLE.COM`, opens group | linked, `member.link` row, `last_activity_at` moved, `invite_email` NULL, `me.memberId` set, group in `GET /api/me/groups` |
| Second GET by Sam | no new audit row |
| Sam already claimed on another device | nothing written, no error |
| Account already has another member in the group | nothing written, no error |
| Signed-out visitor opens the group | no change, join panel as today |
| Remove or claim an invited member | `invite_email` NULL |
| Device account link clears the email | `invite_email` NULL |
| Two unclaimed members with the same email | the oldest is linked |
| Member name with a diacritic (`René`) invited with `Sam@Example.com`; Sam signs in as `sam@example.com` | linked, name shown as `René` |
| Migration on a group with a pre-existing member row | row keeps its data, `invite_email` is NULL |

## Plan

1. Migration `migrations/0009_member_invite_email.sql`: a comment, then `ALTER TABLE members ADD COLUMN invite_email TEXT`.
   No index, since lookups are per group.
2. `worker/http.ts`: add `optionalEmail(value, field)`. It returns null for undefined, null, an empty string or spaces
   only, and otherwise the trimmed lowercase string. It throws `400 INVALID_EMAIL` for a non-string, more than 254
   characters, whitespace inside, or not exactly one `@` with text on both sides. The message and params never
   contain the value.
3. `worker/policy.ts`: add `requireCanSetInviteEmail(me)` (owner only, via `requireOwner`) and `canAutoLinkInvite(me)`
   (`userId` set, `memberId` null, `accountMemberId` null), both right after `requireCanEditMember`.
4. `worker/routes/members.ts`:
   - Add: read `inviteEmail` only when `claim` is false, and add the column to the `INSERT`.
   - Patch: only when `inviteEmail` is in the body, call `requireCanSetInviteEmail`, refuse a claimed member, and add
     `invite_email = ?` to the `UPDATE`. Without the field the `UPDATE` text stays as it is.
   - Claim and remove: add `invite_email = NULL` to their guarded `UPDATE`. The remove rollback restores the name
     and account only; the email stays cleared.
5. `worker/accountLink.ts`: the device-member `UPDATE` also sets `invite_email = NULL`. One line.
6. New `worker/inviteLink.ts`: `linkInvitedMember(db, group, me, email)` runs one guarded `UPDATE ... RETURNING id`.
   It picks the oldest active, unclaimed member with `lower(invite_email) = lower(?)`, and requires `user_id IS NULL`
   and that no active member of this account exists in the group. A unique violation returns null. It returns the
   linked member id, or null.
7. `worker/routes/groups.ts` `GET /:code`: at the top, when `canAutoLinkInvite(me)`, read the account with
   `resolveAccount(c)` (cached) and call `linkInvitedMember`. On a link, call `recordChange` with `member.link` and the
   member id, then set `me.memberId` and `me.accountMemberId` before the members are loaded. This is the only GET
   that writes, and only when a link happens.
8. `worker/groupData.ts`: `MemberRow.invite_email` (optional). `toMemberDto` sets `invited` to false for a removed
   member and to `!claimed && !!invite_email` for an active one. The row is never spread into the DTO.
   `shared/types.ts`: `MemberDto.invited: boolean`. `shared/errors.ts`: `INVALID_EMAIL` after `INVALID_ACCOUNT_NO`.
9. Frontend:
   - `src/api.ts`: `addMember(code, name, inviteEmail?)`; the `updateMember` patch type gains `inviteEmail`.
   - New `src/ownerTools.ts` with `canSetInviteEmail(me, member)`: owner, not removed, not claimed, not the owner.
   - `src/components/MembersPanel.tsx`: an optional email input (`type="email"`, `maxLength` 254, label via `t()`) in
     the add form, the badge when `m.invited`, and an owner button `memberInvite.set` on rows that pass
     `canSetInviteEmail`, which opens the dialog.
   - `src/components/MembersPanel.scss`: block `member-add`, stacked on a phone and a row from `up(sm)`, theme
     tokens only. The add form uses `member-add` instead of `cluster cluster--nowrap`.
   - New `src/components/InviteEmailDialog.tsx` and `.scss` (block `invite-email-dialog`): `useDialog(onClose,
     { canClose: !busy })`, the panel has the ref and `tabIndex={-1}`, the input has `data-autofocus`, the backdrop
     click is guarded. Save sends the typed value; Clear sends an empty string. Errors go through `errorMessage`.
     Success shows the `memberInvite.saved` toast.
10. i18n: a `memberInvite` block (`emailLabel`, `emailHint`, `badge`, `set`, `title` with `{name}`, `save`, `clear`,
    `saved`) and `errors.INVALID_EMAIL`, in `en.ts` and `vi.ts`. `vi.ts` stays UTF-8 without BOM.
11. Tests:
    - `tests/api/member-invite.test.ts`: the API rows of the matrix, including that the raw GET body contains no email.
    - `tests/unit/ownerTools.test.ts`: `canSetInviteEmail`.
    - `invited: false` added to the `MemberDto` fixtures in `tests/unit/expenseRow.test.ts`, `groupCsv.test.ts`,
      `groupSummary.test.ts` and `settleView.test.ts`.
    - `e2e/member-invite.spec.ts`: Alex adds Sam with an email and the badge shows. Sam signs in with dev sign-in in
      another context, opens the link, sees no join panel, and the payer of a new expense defaults to Sam.
    - `e2e/lock-groups.spec.ts`: scope its dev-login email field to the account menu form, because the add form now
      has an email input too.
12. Docs: `docs/business-rules.md`: a new "Invite by email" bullet in Members; the activity list gets the automatic
    link; the Accounts stored-data line says the email is used for invites and never returned. `docs/design.md`: a new
    subsection "member_email_invite (built)" as the last subsection of section 6, with the migration, the matching
    query, the GET write exception, the Known limit and the release note; the two policy names are added to the
    section 3 list.

## Merge request

- Branch: `feat/member_email_invite` into `develop`.
- The merge request is opened on GitLab from this branch; its link is added when it exists.
- Summary of changes:
  - `migrations/0009_member_invite_email.sql`: adds `members.invite_email` (`TEXT`, NULL means no invite, no index).
  - `worker/http.ts`: `optionalEmail` returns null or a trimmed lowercase address and throws `400 INVALID_EMAIL` without
    the value.
  - `worker/policy.ts`: `requireCanSetInviteEmail` (owner) and `canAutoLinkInvite` (signed in, no member in the group).
  - `worker/inviteLink.ts`: `linkInvitedMember`, one guarded `UPDATE ... RETURNING` that picks the oldest match.
  - `worker/routes/members.ts`: add stores the email only for `claim: false`; patch writes it only when the body carries
    `inviteEmail`; claim and remove clear it.
  - `worker/accountLink.ts`: the device-member link clears `invite_email`.
  - `worker/routes/groups.ts`: `GET /groups/:code` links and calls `recordChange` (`member.link`) only when a link happens.
  - `worker/groupData.ts`: `MemberDto.invited`, derived, never the email.
  - UI: optional email in the add form (`member-add`), the badge, and `InviteEmailDialog` (`useDialog`, focus trap,
    Escape, `data-autofocus`) opened by the owner.
  - i18n: the `memberInvite` block and `errors.INVALID_EMAIL` in `en.ts` and `vi.ts`.
  - Tests: `tests/api/member-invite.test.ts` (MEI-1..MEI-12), `tests/unit/ownerTools.test.ts`, `e2e/member-invite.spec.ts`.
  - Docs: `docs/business-rules.md`, `docs/design.md`.
- Commands run and results:
  - `npm run typecheck`: clean.
  - `npm run lint`: clean.
  - `npm test`: 36 files, 404 tests passed (MEI-12 migration included).
  - `npm run test:hooks`: 29 passed.
  - `npx playwright test --config playwright.local.config.ts` (port 5194): 113 passed, 1 skipped.

## Review

Reviewed by Opus (AI team lead).

- `members.invite_email` (migration `0009`) is never returned; the DTO exposes only `invited` for an active unclaimed member.
- `GET /api/groups/:code` writes only when a link happens: one guarded `UPDATE` links the oldest matching unclaimed member, refuses when the account already has a member, and records `member.link` through `recordChange`.
- The owner alone sets the email (`requireCanSetInviteEmail`); a claimed member answers `MEMBER_ALREADY_CLAIMED`. Claim, link and remove clear the email.
- The invite dialog uses `useDialog`. No changes needed.
- Checks: typecheck and lint clean, 404 unit and API tests, 29 hook tests, e2e 113 passed and 1 skipped.

Confirmed by the human on local `develop`. Released in release/2026-10-29.
