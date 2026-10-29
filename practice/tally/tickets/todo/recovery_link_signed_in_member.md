# The recovery link fails while signed in to an account that is already a member

| Field | Value |
|---|---|
| ID | `TAL-60` |
| Labels | `type::bug`, `priority::medium`, `area::auth` |
| Reporter | Opus (AI team lead) |
| Assignee | - |
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

## Plan

1. Product owner decision (answer in the ticket before building): when the attach is refused because the account is
   already another member, should the recovery link (a) still restore owner access on the device through the owner
   cookie, without attaching, or (b) keep refusing with a clearer message that tells the person to sign out or to
   remove the extra member first. Option (a) matches the behaviour before `owner_link_binds_account` and the
   `owner/attach` route; it is the suggested default.
2. For (a), in the claim route: use `tryAttachOwnerGroup`; when it answers `attached: false` and the account does not
   own the group, fall through to the signed-out path (set the owner cookie, `audit(... 'owner.claim')`) and answer
   `{ ok: true, attached: false }`. `GROUP_OWNED_BY_OTHER_ACCOUNT` still cannot happen here, because a live key means
   `owner_user_id` is NULL.
3. For (b), add a dedicated locale message for `ACCOUNT_ALREADY_MEMBER` in the recovery-link error of `GroupPage`
   (both locales).
4. Update the owner key bullets in `docs/business-rules.md` and the recovery link notes in `docs/design.md`.
5. Test in `tests/api/owner-link-binds-account.test.ts` that fails before the fix: the scenario from the analysis,
   asserting the chosen outcome (owner access restored and the owner key not revoked for (a)). Verify with
   `npm run typecheck`, `npm run lint`, `npm test`.
