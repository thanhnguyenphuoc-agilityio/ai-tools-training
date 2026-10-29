# Name claimed by someone else

| Field | Value |
|---|---|
| ID | `TAL-18` |
| Labels | `type::bug`, `priority::high`, `area::members` |
| Reporter | Haiku (end user, group member) |
| Assignee | Haiku (developer) |
| Depends on | - |
| Related | `group_link_guessing`, `member_email_invite` |

## Description

The owner added the reporter to the group by name. When the reporter opened the link, someone had already clicked
"I am <name>" for that name, so the reporter can no longer join under it. It is not known who claimed it.

## Reproduce

Reproduced with a throwaway API test (Vitest + Miniflare, `tests/api/helpers.ts`), not committed:

1. Owner Alex creates a group and adds Jamie by name (`POST /api/groups/<code>/members` with `{ name: 'Jamie' }`).
2. A second browser with no cookies sends `POST /api/groups/<code>/members/<jamieId>/claim`.
3. A third browser (the real Jamie) sends the same claim, then tries to join as a new member named `Jamie`.

- Observed on `develop`: step 2 answers `200 {"ok":true}`. Step 3 answers `409 MEMBER_ALREADY_CLAIMED` for the claim
  and `409 DUPLICATE_NAME` for the join. `POST .../members/<id>/release` answers `404 NOT_FOUND`, so no route can undo
  the claim and the name is lost for good.
- Already fixed on `develop`: a browser that has already joined as Sam and claims Jamie is refused with
  `409 ALREADY_MEMBER`, and Sam's device keeps its identity. A device cannot take a second name.
- Expected: the name stays recoverable for the real person, and a claim is confirmed before it is sent.

## Analysis

`POST /groups/:code/members/:id/claim` in `worker/routes/members.ts` accepts any caller, as
`docs/business-rules.md` allows ("anyone with the link ... if nobody has claimed it yet"). Nothing reverses a claim
afterwards: `members.token_hash` is set once and no route clears it. The rule itself is listed as an OPEN QUESTION in
`docs/business-rules.md` ("anyone with the link can claim an unclaimed name. Is this risk acceptable?"); this ticket
answers it.

Of the three gaps first identified:

1. No way back: neither the owner nor anyone else can release a claimed name. **Open.**
2. No trace: the claim was audited with the caller's identity, which for a visitor is `anonymous`. **Closed on
   `develop`:** `member.claim` is recorded with the claimed member as actor (`{ ...me, memberId }`).
3. No limit per device: a device that already acts as a member could claim another name or join again. **Closed on
   `develop`:** `requireNotMember` refuses a device (`ALREADY_MEMBER`) or an account (`ACCOUNT_ALREADY_MEMBER`) that is
   already a member, in both join and claim.

A fourth gap is found while analysing: the claim has no confirmation step, so a misclick on "I am <name>" takes the
name at once. **Open.**

Accounts exist (`google_sign_in`), so a claimed member can be bound in three ways:

- `token_hash`: the device token, set by a claim or by a join while the device is not signed in.
- `user_id`: the account, set by a join while signed in, by the invite auto-link (`member_email_invite`), or by the
  device account link (`linkToAccount` in `worker/accountLink.ts`).
- both, for a member who joined while signed in.

A release must therefore cut all of them: clear `token_hash`, `user_id` and `invite_email`. `docs/design.md`
(`google_sign_in` section, point 2) already states that release clears `members.user_id`. The "Release note (future)"
in `docs/design.md` and the "Known limit" in `docs/business-rules.md` require that release also clears `invite_email`.

A release is a change of the group: it is recorded through `recordChange`, moves `last_activity_at`, and
`docs/business-rules.md` already lists "releasing a member" as activity.

## Clarifying questions

1. Is it acceptable that anyone with the link can claim an unclaimed name, or must a claim be approved first?
2. When a name was claimed by the wrong person, who may fix it, and what happens to that person's device?
3. What happens to expenses or transfers recorded by the wrong person while they used the name?
4. Should the app show who claimed a name?
5. May a device that has already joined claim a second name?

## Answers

From the product owner (human), after checking with Haiku (reporter):

1. The risk is accepted: groups are small and the link is shared privately. There is no approval step; a claim
   stays instant. The visitor is asked to confirm "I am <name>" before the claim is sent, so a misclick does not
   take a name.
2. The **owner** can **release** a claimed name (not the owner's own member, not a removed member). The member,
   with its name, history and bank details, stays as it is; only the link to the device is cut, so that device
   becomes a guest (view only) and the name can be claimed again with "I am <name>". Releasing does not depend on
   the balance, because no money moves. Releasing a name that is not claimed is refused.
3. They stay, under the member's name; the owner can already edit or delete them. The release itself is recorded
   in the audit log.
4. No. A claim through the link does not prove who the person is, so the app does not show it. The audit log records
   the claim with the claimed member as the actor (not `anonymous`) and the release with the owner as the actor.
5. No. A device acts as at most one member per group: a device that is already a member gets
   `409 ALREADY_MEMBER` when it claims a name or joins again. Haiku (reporter): "That would have stopped it; it
   was another member who tapped my name by mistake."

## Acceptance criteria

- `POST /groups/:code/members/:id/release` is owner only (`403 OWNER_ONLY` for a member or a guest).
- It clears `token_hash`, `user_id` and `invite_email` of the member, and nothing else of the member (name, bank
  details, history).
- Refusals: `404 MEMBER_NOT_FOUND`; `409 MEMBER_REMOVED` for a removed member; `409 CANNOT_RELEASE_OWNER` for the
  owner member; `409 MEMBER_NOT_CLAIMED` when neither `token_hash` nor `user_id` is set (an invited but unclaimed
  member keeps its `invite_email`).
- The release is recorded as `member.release` through `recordChange`, with the owner member as actor and the released
  member as target, and it moves `last_activity_at`.
- The released device becomes a guest. The released account no longer resolves to the member, and the group leaves
  `GET /api/me/groups` for that account.
- The released name can be claimed again with "I am <name>".
- The claim button asks for confirmation first; Cancel sends nothing.
- The owner's release button asks for confirmation first, and shows a toast with the released name.

## Test matrix (QA)

| Case | Expected |
|---|---|
| Owner releases a member claimed by a device token | `200`; that device's `me.memberId` is `null`; DTO `claimed` is `false`; the real person claims with `200` |
| An expense under the released member | keeps `createdBy` and its shares |
| Audit after release | one `member.release` row with the owner member as actor; `last_activity_at` moved |
| Member linked by account only (invite auto-link, no device token) | `200`; `user_id` and `invite_email` are `NULL`; the account no longer resolves to the member; the group is gone from `GET /api/me/groups` |
| Invited but unclaimed member | `409 MEMBER_NOT_CLAIMED`; `invite_email` unchanged |
| Plain member or guest releases | `403 OWNER_ONLY` |
| Owner releases the owner member | `409 CANNOT_RELEASE_OWNER` |
| Removed member | `409 MEMBER_REMOVED` |
| Unknown member id | `404 MEMBER_NOT_FOUND` |
| Two simultaneous releases of one member (interleaved) | one `200`, one `409 MEMBER_NOT_CLAIMED`; a single `member.release` row |
| `canReleaseMember` (unit) | true only for an owner, a claimed, active, non-owner member |
| Claim confirmation (e2e) | Cancel: still a guest; Confirm: joins as Jamie |
| Release through the dialog (e2e) | toast shown; the row shows "not claimed yet"; after a reload the second browser sees "I am Jamie" again |

## Plan

Branch `fix/wrong_name_claim` off `develop`. No migration: a released member has `token_hash`, `user_id` and
`invite_email` set to NULL, the same state as a member added by name.

- `shared/errors.ts`: append `MEMBER_NOT_CLAIMED` and `CANNOT_RELEASE_OWNER` at the end of `ERROR_CODES`.
- `src/i18n/locales/en.ts` and `vi.ts`: translate both codes in `errors`.
- `worker/policy.ts`: add `requireCanReleaseMember(me)`, which is `requireOwner(me)`, after
  `requireCanRemoveMember`, with a doc comment. Add it to the `docs/design.md` section 3 list.
- `worker/routes/members.ts`: new route `POST /:code/members/:id/release` after the remove route. Order:
  `loadGroup`, `requireCanReleaseMember`, `loadActiveMember`, `CANNOT_RELEASE_OWNER` for the owner member, then one
  guarded `UPDATE` that clears the three columns where the member is active and has `token_hash` or `user_id` set.
  When no row changes, the member is read again: removed gives `MEMBER_REMOVED`, otherwise `MEMBER_NOT_CLAIMED`.
  Then `recordChange` with `member.release` and the member id, and `{ ok: true }`. Update the file header comment.
  No change to `worker/auth.ts`: a cleared `token_hash` or `user_id` already resolves to no member.
- `src/api.ts`: `releaseMember(code, id)`, after `removeMember`.
- `src/ownerTools.ts`: `canReleaseMember(me, member)`, after `canSetInviteEmail`. It is owner, not removed, not the
  owner member, and claimed.
- `src/components/ReleaseMemberDialog.tsx`: modelled on `RemoveMemberDialog`. Title is the release label with the
  name; body is the confirmation text; Release submits, Cancel closes. `useDialog` with `canClose` false while busy.
  Its own error state.
- `src/components/ClaimMemberDialog.tsx`: `useDialog`. Title and body from `join.confirmClaim`; Confirm sends
  `api.claimMember`, then closes and reports done; Cancel sends nothing. Its own error state.
- `src/components/JoinPanel.tsx`: "I am <name>" opens `ClaimMemberDialog` instead of sending the claim. The
  account-name prefill is not touched.
- `src/components/MembersPanel.tsx`: for the owner, a ghost small button `members.release` with aria-label
  `members.releaseLabel`, gated by `canReleaseMember`, placed before Remove. On success: toast `toast.memberReleased`,
  then `onChanged`. The existing Make owner, invite email and Remove buttons stay as they are.
- i18n: `join.confirmClaim`, `join.confirmClaimSubmit`, `members.release`, `members.releaseLabel`,
  `members.releaseConfirm`, `toast.memberReleased` in `en.ts` first, then `vi.ts`. Reuse `common.cancel`.
- Tests, committed as failing tests first:
  - `tests/api/claim-member.test.ts`: the matrix rows above, split across short tests so each stays within the Vitest
    timeout. Uses `tests/api/helpers.ts` (`createTestEnv`, `Browser`, `signIn`, `interleave`).
  - `tests/unit/ownerTools.test.ts`: `canReleaseMember` cases.
  - `e2e/claim-member.spec.ts`: the claim confirmation and the release through the dialog, with fake names and
    text from `t()`.
- Docs, in the same branch:
  - `docs/business-rules.md`: replace the OPEN QUESTION line on claiming with the rules (confirmation before a claim,
    owner release and what it keeps and clears, refusals, audit actors). In the Members section, replace the "Known
    limit" with "Releasing a member clears `invite_email` as well." In "Interface preferences", add a released name
    to the confirmation messages.
  - `docs/design.md`: section 3 list gets `requireCanReleaseMember`; a new `### wrong_name_claim (built)` section
    before `member_email_invite`; the `member_email_invite` "Release note (future)" is marked done.
  - `README.md`, Concepts table, Member row: the owner can release a wrongly claimed name.
- Verify: `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:hooks`, and
  `npx playwright test --config playwright.local.config.ts`.
