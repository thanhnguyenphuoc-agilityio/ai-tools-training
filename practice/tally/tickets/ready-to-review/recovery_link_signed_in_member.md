# The recovery link fails while signed in to an account that is already a member

| Field | Value |
|---|---|
| ID | `TAL-60` |
| Labels | `type::bug`, `priority::medium`, `area::auth` |
| Reporter | Opus (AI team lead) |
| Assignee | Haiku (developer) |
| Depends on | - |
| Related | `owner_link_binds_account`, `join_as_account` |

## Description

Found in the daily review of 2026-10-29. Since `owner_link_binds_account`, opening a recovery link while signed in
attaches the group to the account (`docs/business-rules.md`, owner key bullets). When the account is already another
member of the group, the attach is refused with `409 ACCOUNT_ALREADY_MEMBER`, and the claim stops there: no owner
cookie is set, so the owner gets no owner access on that device. The same link works when signed out. The rules list
only `OWNER_KEY_REVOKED` and `GROUP_OWNED_BY_OTHER_ACCOUNT` as answers of the recovery link, and no test covers a
signed-in member opening it, so the suites pass.

A typical case: the owner created the group without an account on a laptop, later joined it from a phone while
signed in (so the account is linked to a second member), then opens the recovery link on the phone to get owner
access back. The page shows "This recovery link is not valid: your account is already a member of this group".

## Analysis

- Commit `c894c41`, `worker/routes/groups.ts:199` (`POST /:code/owner/claim`): with `me.userId` set, the route calls
  `attachOwnerGroup`, which throws through `requireMemberLinkable` (`worker/accountLink.ts:30`) when
  `me.accountMemberId` is another member. The owner cookie is only set on the signed-out path below it.
- `POST /:code/owner/attach` (`worker/routes/groups.ts:213`) already uses `tryAttachOwnerGroup`, which maps the same
  refusal to `attached: false`.
- Reproduced with a throwaway API test on `develop` (`298c8cf`): anonymous create, `signIn(phone)`, phone joins with
  `claim: true` (201), phone `POST /owner/claim` with the key answers 409 `ACCOUNT_ALREADY_MEMBER`, `GET` shows
  `me.isOwner === false` and no owner cookie; a signed-out browser with the same key answers 200.

## Decision

The AI team lead applied the suggested default (a), because the batch request asked for the full implementation. A
signed-in account that is already another member of the group still gets owner access on the device through the owner
cookie. The group is not attached to the account and the owner key stays valid. The product owner can revisit this at
ready-to-review.

## Plan

1. Claim route (`worker/routes/groups.ts`, `POST /:code/owner/claim`, signed-in branch): call `attachOwnerGroup` in a
   try/catch. When the group is attached, clear the owner cookie, record `group.link` and answer
   `{ ok: true, attached: true }` as today. When the refusal is `ACCOUNT_ALREADY_MEMBER` only, fall through to the
   signed-out path: set the owner cookie, `audit(... 'owner.claim')` and answer `{ ok: true, attached: false }`. Other
   refusals are rethrown unchanged, so `MEMBER_LINKED_ELSEWHERE` and `GROUP_OWNED_BY_OTHER_ACCOUNT` still answer 409 and
   403. A short code comment explains the fall-through. `worker/accountLink.ts`, `worker/policy.ts` and `worker/auth.ts`
   are not changed. (`tryAttachOwnerGroup` maps all three refusals to `attached: false`, which would hide the
   `MEMBER_LINKED_ELSEWHERE` answer covered by `account.test.ts`, so the route does not use it.)
2. Test `OL-7b` in `tests/api/owner-link-binds-account.test.ts`, placed after OL-7: a signed-in member opens a valid
   recovery link. It fails on `develop` with 409 `ACCOUNT_ALREADY_MEMBER` and passes after step 1.
3. Docs: `docs/business-rules.md` (owner key bullets: the refused attach falls back to the owner cookie, and
   `ACCOUNT_ALREADY_MEMBER` is not an answer of the recovery link) and `docs/design.md` (`owner_link_binds_account`
   section, "Recovery link" note, and the `attachOwnerGroup` callers: the claim route falls back only for
   `ACCOUNT_ALREADY_MEMBER`).
4. UI: no change. `GroupPage.tsx` shows the attach toast only when `attached` is true, and `reload()` then shows owner
   access. No locale change.
5. Verify with `npm run typecheck`, `npm run lint`, `npm test`. The e2e spec `e2e/owner-link-binds-account.spec.ts`
   is a regression check and needs no change.

## Acceptance criteria

- Signed in as another member of the group, opening a valid recovery link answers 200 with `attached: false`.
- That device then has owner access through the owner cookie; the group stays unattached and the owner key is not
  revoked.
- The claim is audited as `owner.claim` and does not move `last_activity_at`.
- The signed-out path and the attachable signed-in path are unchanged.
- The new API test fails before the fix.

## Merge request

Branch `fix/recovery_link_signed_in_member` into `develop`.

`POST /groups/:code/owner/claim` now calls `attachOwnerGroup` in a try/catch. A signed-in account that is already
another member of the group is not attached: the route falls through to the signed-out path, sets the owner cookie,
audits `owner.claim` and answers `{ ok: true, attached: false }`. The owner key stays valid and `last_activity_at` does
not move. `MEMBER_LINKED_ELSEWHERE` and `GROUP_OWNED_BY_OTHER_ACCOUNT` still answer 409 and 403. The new API test is
`OL-7b` in `tests/api/owner-link-binds-account.test.ts`. No UI or locale change.

Verification, run in the worktree on 2026-10-30:

- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm test`: 50 files, 626 tests passed.
- `npm run test:hooks`: 29 tests, 0 failed.
- `e2e/owner-link-binds-account.spec.ts` is unchanged and is left for the batch e2e run.

## Review

Reviewed by Opus (AI team lead).

Findings:

- The claim route keeps `attachOwnerGroup` in a try/catch instead of `tryAttachOwnerGroup` as first planned. This is
  correct: `tryAttachOwnerGroup` also maps `MEMBER_LINKED_ELSEWHERE` and `GROUP_OWNED_BY_OTHER_ACCOUNT` to
  `attached: false`, which would hide answers covered by `account.test.ts`. Docs and the plan describe the narrowed catch.
- The new test is `OL-7b` (`OL-8` already existed). It covers every acceptance criterion and fails on `develop` with
  409 `ACCOUNT_ALREADY_MEMBER`.
- The ticket carried a section that attributed option (a) to the product owner, which contradicted the Decision (the
  AI team lead applied the default; the product owner may revisit it at ready-to-review). That section was removed.
- No policy, auth, UI or locale change; the owner cookie stays HttpOnly and the key stays in the URL fragment.

Checks in the worktree: `npm run typecheck` passed, `npm run lint` passed, `npm test` 50 files, 626 tests passed (a
first run had 3 Miniflare timeouts under load and passed on rerun). The batch runs the full e2e suite on `develop`.
