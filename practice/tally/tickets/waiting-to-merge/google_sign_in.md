# Sign in with Google

| Field | Value |
|---|---|
| ID | `TAL-6` |
| Labels | `type::feature`, `priority::high`, `area::auth` |
| Reporter | Product owner (human) |
| Assignee | Haiku (developer) |
| Depends on | - |
| Related | - |

## Description

Owners who change devices lose owner access to their groups. The recovery link shown at group creation is often
acknowledged without being saved. Google sign-in should restore access after signing in on any device.

## Notes from the reporter

- Signing in must stay optional. Occasional members only open the link to pay.

## Analysis

Today access lives on the device: the owner key (recovery link) and the member device token (cookie). Losing the
device loses the access unless the recovery link was saved. An account gives a second way back that does not
depend on the device. The request names owners; the same problem exists for members, whose device token is lost
with the device. The design in `docs/design.md` (`google_sign_in`) covers both, plus dev sign-in for tests.

Points the request leaves open: which access an account restores, what happens to groups created before signing in,
what is stored about the person, how long a sign-in lasts, and what signing out removes.

## Clarifying questions

1. Should an account restore only owner access, or also "I am this member" on a new device?
2. How does a group created before signing in get attached to the account?
3. Which data from Google may be stored, and who may see it?
4. How long does a sign-in last on a device?
5. What does signing out remove: the account session only, or also the access the device had from links?
6. Can one account be two members of the same group?
7. Can developers and tests sign in without a real Google account?

## Answers

From the product owner (human):

1. Both. A group created while signed in belongs to the account; joining or claiming a name while signed in links
   that member to the account.
2. The owner, signed in on a device that has owner access, uses "Link to my account" on the group. A member can do
   the same for their own member.
3. The Google account id, the email and the display name. The email is never shown to other members; the group
   shows the member name as today.
4. 30 days, then the person signs in again.
5. Only the account session. Access the device has from a recovery link or a device token stays.
6. No. One account is at most one member per group.
7. Yes, through the development sign-in in the design, which must be impossible to enable in production.

## Clarifying questions (round 2, from the zero-questions test)

1. A removed member linked to an account: does the account still resolve to that member, and can the account join
   the group again?
2. What does "Link to my account" change for an owner: the group only, or also the owner's member?
3. A device cookie and an account can point to different members. Which wins, and what happens on join, claim or
   link when the account already has a member in the group?
4. Which error codes do the new refusals use?
5. Where are the sign-in button, the account menu and "Link to my account"? What does the UI show when no Google
   client id is configured, and how do e2e tests sign in on a fresh clone?
6. Is the 30-day session fixed or extended by use?
7. Do signing in and linking count as a change of the group (`purge_inactive_groups`)?
8. Does `GET /api/me` also return the groups of the account?

## Answers (round 2)

From the product owner (human), with the error codes agreed with the developer:

1. No. A removed member resolves from neither a device token nor an account. Removing a member clears its
   `user_id`, so the account can join the group again as a new member.
2. Both: the group gets `owner_user_id`, and the owner's member is linked to the account. If the
   account is already another member of the group, the whole link is refused (`409 ACCOUNT_ALREADY_MEMBER`).
3. The device cookie wins, as in the design. Join, claim or link is refused with `409 ACCOUNT_ALREADY_MEMBER` when
   the account already has a member in the group, and with `409 MEMBER_LINKED_ELSEWHERE` when the member is linked
   to another account.
4. `401 SIGN_IN_REQUIRED` for an action that needs an account; `401 INVALID_GOOGLE_TOKEN` for a rejected token;
   `403 GROUP_OWNED_BY_OTHER_ACCOUNT`; the two `409` codes above. An expired or unknown session is treated as not
   signed in (no error) and its cookie is cleared.
5. "Sign in" sits in the header before the language picker; once signed in it becomes an account menu with the
   person's name, "My bank details" (`saved_bank_details`) and "Sign out". "Link to my account" is in the group
   header actions, shown only to a signed-in person whose device has owner or member access not yet linked. Without
   a Google client id the Google button is not shown; when the development sign-in is enabled, a small email form
   replaces it. The e2e suite must run on a fresh clone with no manual step: the Playwright web server enables the
   development sign-in for its own process only; no committed production setting enables it, and the host check
   stays.
6. Fixed: 30 days from sign-in.
7. Signing in is not a change. Linking a group or a member is a change (audited as `group.link` or `member.link`).
8. Only `{ user }`. The list of groups is `joined_groups_list`, which stays in the backlog.

Also in scope (from the design): expired sessions are deleted by the daily job. If `purge_inactive_groups` has not
merged yet, this ticket adds the scheduled handler with that job only.

## Answers (round 3)

From the product owner (human), after a second zero-questions test:

1. Locking an unlinked group (`lock_groups`) performs "Link to my account" first, with the same rules and refusals,
   so that both ways of attaching a group behave the same.
2. The e2e suite runs on its own server (a separate port) started by Playwright with the development sign-in
   enabled, and never reuses a dev server started by hand.
3. "When possible" is dropped: linking an owner links both the group and the owner's member, or nothing.
4. The feature branch moves the round 2 and 3 decisions (removal clears `user_id`, error codes, `group.link` and
   `member.link`) into `docs/design.md` and `docs/business-rules.md`.

## Answers (round 4)

From the product owner (human), after the review of the ticket pack against the current `develop`:

1. `POST /groups/:code/link` is the only link endpoint. For the owner it links the group and the owner's member
   (`group.link`); for any other member it links that member only (`member.link`); a visitor who has not joined gets
   `401 JOIN_FIRST`. "Link to my account" is hidden once everything this device can link is linked.
2. The header keeps the one-row rule of `header_controls_icons` from 360px up. Below `sm` the sign-in button and the
   account menu show an icon only; the person's name appears inside the open menu. GS-11 checks 360px.
3. Linking a group or a member shows a confirmation toast, like other saves (`ui_redesign`). Signing in and signing
   out do not.

## Acceptance criteria

- Given a person who is not signed in, when they open a group link, then they can view, join and pay exactly as
  before; nothing asks them to sign in.
- Given a signed-in person, when they create a group, then the group belongs to their account; when they open the
  group on another device and sign in there, then they are the owner without the recovery link.
- Given a signed-in person, when they join a group or claim a name, then on another device, after signing in, they
  are that member.
- Given an owner with access from a recovery link on this device, when they choose "Link to my account" while signed
  in, then the group belongs to the account. Given a group that already belongs to another account, then linking is
  refused.
- Given an account that is already a member of a group, when it joins, claims or links another member of the same
  group, then the request is refused.
- Given a signed-in person, when they sign out, then the account session ends and the access from links or device
  tokens on that device remains.
- Given a session older than 30 days, then it no longer identifies the person.
- Given the development sign-in, when it is not enabled in the local configuration or the host is not `localhost`,
  then the endpoint answers 404.
- The email of a person is never returned in a group's data.
- Given a member linked to an account, when the owner removes the member, then the account no longer resolves to
  it and can join the group again.
- Given expired sessions, when the daily job runs, then they are deleted.
- Given a signed-in member who is not the owner, when they choose "Link to my account", then only their member is
  linked; a visitor who has not joined is refused.
- Given a phone 360px wide, then the header with the sign-in control stays on one row.

## Test matrix (QA)

Drafted by Sonnet (QA tester) from the criteria above.

| ID    | Scenario                                                                                                                                                       | Level             |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| GS-1  | Guest and device-token flows unchanged (existing API and e2e suites)                                                                                           | API, e2e          |
| GS-2  | Create while signed in, then sign in on a second browser context: owner                                                                                        | API, e2e          |
| GS-3  | Join, then claim, while signed in; second context signed in: same member                                                                                       | API               |
| GS-4  | Link a group with the owner key; link a group owned by another account: 403                                                                                    | API               |
| GS-5  | Same account as a second member of one group: refused                                                                                                          | API               |
| GS-6  | Sign out keeps the owner key access of the device                                                                                                              | API               |
| GS-7  | Expired session (fake clock) does not identify                                                                                                                 | API               |
| GS-8  | Dev sign-in: 404 without the flag, 404 with the flag on another host                                                                                           | API               |
| GS-9  | Group DTO never contains an email                                                                                                                              | API               |
| GS-10 | Google ID token check: wrong audience, wrong issuer, unverified email, expired: all refused                                                                    | unit              |
| GS-11 | Sign-in button and account menu at 360px (one header row) and 1366px, both themes                                                                              | e2e (dev sign-in) |
| GS-12 | Removed linked member: account resolves to nothing, joins again as a new member                                                                                | API               |
| GS-13 | Each refusal returns its code: `SIGN_IN_REQUIRED`, `ACCOUNT_ALREADY_MEMBER`, `MEMBER_LINKED_ELSEWHERE`, `GROUP_OWNED_BY_OTHER_ACCOUNT`, `INVALID_GOOGLE_TOKEN` | API               |
| GS-14 | Daily job deletes expired sessions only                                                                                                                        | API               |
| GS-15 | e2e sign-in works on a fresh clone (no `.dev.vars`)                                                                                                            | e2e               |
| GS-16 | Link as a non-owner member: only the member is linked (`member.link`); as a visitor: `401 JOIN_FIRST`                                                          | API               |

## Plan

Build `google_sign_in` on branch `feat/google_sign_in` off `develop`. Add optional Google sign-in with a dev sign-in stub for tests, migration `0004_accounts.sql`, account sessions in `auth.ts`, policies in `policy.ts`, linking endpoints, UI components, tests, and documentation.

### 1. Database schema (`migrations/0004_accounts.sql`)

- Create `users` table: id, google_sub, email, name, bank_bin, account_no, account_name, created_at.
- Create `sessions` table: token_hash, user_id (cascade delete), created_at, expires_at; index on expires_at.
- Add `user_id` column to `members` with foreign key to users, set null on delete; partial unique index on (group_code, user_id) where user_id is not null.
- Add `owner_user_id` column to `groups` with foreign key to users, set null on delete; index on owner_user_id.

### 2. Shared contracts

- `shared/errors.ts`: add error codes `SIGN_IN_REQUIRED`, `INVALID_GOOGLE_TOKEN`, `GROUP_OWNED_BY_OTHER_ACCOUNT`, `ACCOUNT_ALREADY_MEMBER`, `MEMBER_LINKED_ELSEWHERE`.
- `shared/types.ts`: add `UserDto`, `MeResponse`, `ConfigResponse`; add `canLinkAccount` to `GroupDto`.
- `src/i18n/locales/*.ts`: translate new error codes and UI strings for `account.*` in both `en.ts` and `vi.ts`.

### 3. Identity and permissions

- `worker/auth.ts`: add session management (`createSession`, `endSession`, `resolveAccount`, `deleteExpiredSessions`, `clearSessionCookie`). Update `Identity` to track `userId`, `hasOwnerKey`, `deviceMemberId`, `accountMemberId`. Update `resolveIdentity` so device token wins over account, and account resolves owner and member.
- `worker/policy.ts`: add `requireAccount`, `requireSignedIn`, `requireGroupNotOwnedByOther`, `requireMemberLinkable`, `canLinkToAccount`. Update `requireNotMember` to check `accountMemberId` first (`ACCOUNT_ALREADY_MEMBER`), then `memberId` (`ALREADY_MEMBER`).
- `worker/http.ts`: add `GOOGLE_CLIENT_ID` and `DEV_LOGIN` to `Env`, update `AppEnv` variables for user caching.

### 4. Google token verification and routes

- `worker/google.ts`: verify RS256 Google ID tokens via WebCrypto SubtleCrypto with public certs fetching and caching.
- `worker/routes/account.ts`: endpoints `/config`, `/auth/google`, `/auth/dev` (localhost and dev flag only), `/auth/logout`, `/me`.
- `worker/accountLink.ts`: pure linking logic for groups and members with race handling.
- `worker/routes/link.ts`: `POST /groups/:code/link` route.
- `worker/routes/groups.ts`: pass `owner_user_id` on create; build `me` and `canLinkAccount` in GET.
- `worker/routes/members.ts`: attach `user_id` on join/claim; clear `user_id` on remove and release.
- `worker/cleanup.ts`: scheduled handler to delete expired sessions.
- `worker/app.ts`: mount account and link routes.

### 5. Frontend UI

- `src/api.ts`: API methods for config, me, google sign-in, dev sign-in, sign-out, link account.
- `src/account.tsx`: `AccountProvider` and `useAccount` hook providing auth state and reload triggering.
- `src/components/AccountMenu.tsx` & `.scss`: header control with sign-in button (dev email form or Google GIS button) and account dropdown. Compact icon-only on mobile (<= 360px).
- `src/components/Icon.tsx`: add `user` icon SVG.
- `src/pages/GroupPage.tsx`: "Link to my account" button when `canLinkAccount` is true.
- `src/App.tsx` & `src/main.tsx`: wrap with `AccountProvider` and place `AccountMenu` in header controls.

### 6. Tests and tooling

- `vite.config.ts`: support `TALLY_PORT` and `TALLY_DEV_LOGIN`.
- `tests/unit/google.test.ts`: test Google token verification with mock RS256 keys.
- `tests/api/account.test.ts`: API tests covering all GS matrix scenarios (GS-1 to GS-9, GS-12 to GS-14, GS-16).
- `e2e/account.spec.ts`: Playwright tests for dev sign-in, account menu at 360px and desktop, linking account.
- `docs/business-rules.md` and `docs/design.md`: document account rules, design decisions, and status.

## Merge request

- Branch: `feat/google_sign_in` into `develop`.
- The merge request is opened on GitLab from this branch; its link is added when it exists.
- Built against `develop` (at `0f689e9`) with migration `0004_accounts.sql`. Token verification uses native WebCrypto without external dependencies (`jose`).
- Unrelated features (`edit_expense`, `purge_inactive_groups`, `lock_groups`, `saved_bank_details`, `delete_account`) omitted. Daily session cleanup ready in `worker/cleanup.ts`.
- Verified with Vitest (26 test files, 320 unit/API tests passing; 34 new tests across `tests/unit/google.test.ts` and `tests/api/account.test.ts`), CSS linting (`npm run lint:css`), and full Playwright e2e test suite (70 tests passing across desktop and mobile, including 14 tests in `e2e/account.spec.ts`).
- Known limits: real Google sign-in requires `GOOGLE_CLIENT_ID` and is not exercised in automated tests; verified end-to-end via the dev sign-in form.

## Review

Reviewer: Sonnet (QA tester). Reviewed after rebasing onto `develop` (which now includes `purge_inactive_groups`).

Findings:

- [major] `worker/routes/link.ts`: linking used `audit`, which writes the audit log but does not move `last_activity_at`. Business rules say linking a group or a member is a change. Switched to `recordChange`.
- [major] `worker/google.ts`: the `aud` claim was compared as a string. Google sends an array when a token names more than one audience, so a genuine token would be refused. The check now accepts either form. Covered by two unit tests, one of which failed before the fix.
- [minor] Rebase conflict resolution: `worker/cleanup.ts` now runs both daily jobs in `runDailyJobs` and returns `{ groups, sessions }`. Viewing a group no longer calls `touch` (removed by `purge_inactive_groups`); member add, claim, update and remove keep `recordChange`.
- [minor] `worker/routes/members.ts`: a claimed name is recorded with the claimer's member id as the actor, matching the behaviour before the rebase.
- [nit] Prettier re-padded the README Concepts and Structure tables, the identity table in `docs/design.md`, and the ticket header. The padding was reverted; the header change also broke `tests/unit/board-sync.test.ts`, which reads the `| ID |` cell literally.
- [nit] `playwright.config.ts` serves e2e on port 5174 with `TALLY_DEV_LOGIN` and `reuseExistingServer: false`. Acceptable: CI runs `npx playwright test` with no fixed port, and a dev server started by hand on 5173 is left alone. Noted in the README.

Checks after the fixes: `npm run typecheck` clean, `npm run lint` clean (oxlint and stylelint), `npm test` 30 files and 352 tests passing, `npm run e2e` 76 tests passing.
