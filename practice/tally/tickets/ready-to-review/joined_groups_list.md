# List of joined groups on every device

| Field | Value |
|---|---|
| ID | `TAL-8` |
| Labels | `type::feature`, `priority::medium`, `area::auth` |
| Reporter | Haiku (end user, group member) |
| Assignee | Haiku (developer) |
| Depends on | `google_sign_in` |
| Related | - |

## Description

Members who join many groups cannot tell the links apart. The home page lists recently opened groups, but only on
the device that opened them. The same list should be available on every device.

## Analysis

The home page list (`src/history.ts`, `localStorage` key `tally.history`) is per browser by design. An account (`google_sign_in`) already ties members and owned groups to a person: `members.user_id` (set on create, join, claim and "Link to my account") and `groups.owner_user_id`. A list built from those rows is available on every device after signing in, without storing visits. Open points: which groups count (opened or joined), ordering without visit tracking, what happens to groups the person left or was removed from, how the two lists combine on the home page, and what is shown to a person who is not signed in.

## Clarifying questions

1. Which groups are listed: every group opened while signed in, or only groups in which the account is a member or the owner?
2. How is the list ordered, given that viewing a group writes nothing?
3. Are groups listed in which the member was removed or released?
4. What does each entry show?
5. How do the account list and the device list appear together on the home page?
6. What does a person who is not signed in see, and what does the API answer without a session?
7. Can a group be hidden from the account list?

## Answers

From the product owner (human):

1. Only groups in which the account has an active member (`members.user_id`, not removed) or which the account owns (`groups.owner_user_id`). Opening a link as a guest does not add the group; groups joined before signing in appear after "Link to my account".
2. By the latest change in the group (`last_activity_at`, newest first), then by code. Visits are not recorded: viewing stays a read with no write.
3. No. A removed or released member no longer resolves to the account, so the group leaves the list. Deleted groups disappear with the group.
4. Group name, currency and an owner badge when the account owns the group. No member names, balances or bank details.
5. Signed in: a card "Your groups" from the account above the existing "Groups opened on this device" card; the device card leaves out groups already in the account list. Signed out: only the device card, as today. Signing in or out refreshes the home page lists.
6. Signed out: no account card. `GET /api/me/groups` without a session answers `401 SIGN_IN_REQUIRED`.
7. No. The list mirrors membership; removing a group from the device list stays a device-only action.

## Acceptance criteria

- Given a signed-in person who joined, claimed or created groups while signed in (or linked them), when they open the home page on any device, then those groups are listed with name, currency and an owner badge for owned groups.
- Given a group opened only as a guest, then it is not in the account list.
- Given a member who was removed or released, then that group is no longer listed.
- Given several groups, then the list is ordered by the latest change, newest first.
- Given a group in both lists, then it appears only in the account list.
- Given a person who is not signed in, then only the device list is shown and `GET /api/me/groups` answers `401 SIGN_IN_REQUIRED`.
- Given the account list, then it contains no member names, balances, bank details or email.
- Given a list entry, when it is opened on a new device, then the group opens with the person acting as their member (or owner) without claiming again.

## Test matrix (QA)

Drafted by Sonnet (QA tester) from the criteria above.

| ID | Scenario | Level |
|---|---|---|
| JG-1 | Create, join, claim and link while signed in: all four groups listed with `isOwner` correct | API |
| JG-2 | Guest view while signed in: group not listed | API |
| JG-3 | Removed member and released member: group no longer listed | API |
| JG-4 | Order follows `last_activity_at` after a new expense in an older group | API |
| JG-5 | `GET /api/me/groups` without a session: `401 SIGN_IN_REQUIRED` | API |
| JG-6 | Response has only `code`, `name`, `currency`, `isOwner`, `lastActivityAt`; another account's groups absent | API |
| JG-7 | Second browser context: dev sign-in shows the groups, opening one acts as the member | e2e |
| JG-8 | Group in both lists shown once; signed out shows only the device list; both themes, 375px and 1366px | e2e |

## Plan

Branch `feat/joined_groups_list` from `develop`. No migration, no new error code, no policy rule change.

- New `worker/routes/myGroups.ts` (`myGroupRoutes`), mounted in `worker/app.ts` with one line right after `app.route('/', accountRoutes)`. `GET /me/groups`: `requireSignedIn(await resolveAccount(c))` in `worker/policy.ts` and `worker/auth.ts`; no session gives `401 SIGN_IN_REQUIRED`. One SELECT over `groups`: groups where `owner_user_id` is the account, or where an active member (`removed_at IS NULL`) has `user_id` = the account. Order `last_activity_at DESC`, then `code`. Answers `{ groups: MyGroupDto[] }`. Writes nothing.
- `worker/policy.ts`: only the doc comment of `requireSignedIn` is extended to name `/me/groups` as well.
- `shared/types.ts`: append at the end of the file `MyGroupDto { code; name; currency; isOwner: boolean; lastActivityAt: string }` and `MyGroupsResponse { groups: MyGroupDto[] }`.
- `src/api.ts`: add `MyGroupsResponse` to the type import; `getMyGroups()` as the last entry, after `linkAccount`.
- `src/pages/HomePage.tsx`: with `useAccount()` (`user`, `version`), fetch `getMyGroups()` when `user` or `version` changes. The account list is cleared to null first on every change, so a list for a previous account is never shown. Fetch errors are ignored. Device history entries whose code is in the account list are filtered out. The "Your groups" card (`card` block, `list list--divided`, owner badge through `t('common.ownerBadge')`, currency code, links through `navigate()`) sits above the device card. Existing `errorMessage(err)` handling in the page stays unchanged.
- `src/pages/HomePage.scss`: `&__hint` inside the `home-page` block (margin only, mobile first, no colors).
- i18n (`en.ts`, `vi.ts`): `home.accountGroups` with `title`, `hint`, `empty`, placed right after `home.history`. `vi.ts` stays UTF-8 without BOM; non-ASCII test input uses `\uXXXX`.
- Tests (fail before the route exists: 404): `tests/api/joined-groups.test.ts` covers JG-1 to JG-6 with the helpers in `tests/api/helpers.ts`. `e2e/joined-groups.spec.ts` covers JG-7 and JG-8 (two browser contexts, dev sign-in through `.account-menu__button`, both themes, 375px and 1366px).
- Docs (same branch): `docs/business-rules.md`, Accounts: "Groups list (`joined_groups_list`)" sub-list as the last bullet group under "What an account restores". `docs/design.md`: heading of the roadmap section marks `joined_groups_list (built)`, the `joined_groups_list` bullet points to its own section, and a `### joined_groups_list (built)` subsection sits before `### language_picker, theme_picker`. The "Signing out", "Kept groups" and saved-details lines and `README.md` are not touched.
- Commits: `docs(tickets): start joined_groups_list with a plan`, `feat: list the groups of the signed-in account`, `feat: show account groups on the home page`, `test: cover the account groups list`, `docs: describe the account groups list`, `docs(tickets): move joined_groups_list to waiting-to-merge`.

## Merge request

- Branch: `feat/joined_groups_list` into `develop`.
- The merge request is opened on GitLab from this branch; its link is added when it exists.
- Summary of changes:
  - New `worker/routes/myGroups.ts` with `GET /api/me/groups`: `requireSignedIn(await resolveAccount(c))`, one query
    over `groups` (owned by the account, or an active member linked to it), ordered by `last_activity_at` DESC, then
    `code`. Writes nothing.
  - Mounted in `worker/app.ts` right after `accountRoutes`.
  - `worker/policy.ts`: `requireSignedIn` doc comment now names `/me/groups`. No rule change.
  - `shared/types.ts`: `MyGroupDto` and `MyGroupsResponse` appended at the end.
  - `src/api.ts`: `getMyGroups()` added after `linkAccount`.
  - `src/pages/HomePage.tsx` and `HomePage.scss`: "Your groups" card above the device history card. The account list
    is cleared on every user or version change; device entries already in the account list are hidden.
  - `src/i18n/locales/en.ts` and `vi.ts`: `home.accountGroups` (`title`, `hint`, `empty`).
  - Tests: `tests/api/joined-groups.test.ts` (JG-1 to JG-6) and `e2e/joined-groups.spec.ts` (JG-7, JG-8).
  - Docs: `docs/business-rules.md` (Groups list sub-list) and `docs/design.md` (`joined_groups_list (built)` section,
    roadmap heading and bullet updated).
- What was adapted vs the draft:
  - No migration. `requireSignedIn` already existed on develop; only its doc comment changed.
  - `HomePage` keeps the existing `errorMessage(err)` handling instead of the draft's `message(UiMessage)`.
  - JG-3 covers removal only. The draft also tested member release through `POST /groups/:code/members/:id/release`;
    that endpoint is not on develop (it came from a draft commit that was not ported), so the release half of JG-3
    is not in this branch.
- Commands run and results:
  - `npm run typecheck`: passed with no errors.
  - `npm run lint`: passed (oxlint and stylelint).
  - `npm test`: 33 files, 379 tests passed (6 of them are this ticket's API tests).
  - `npx playwright test --config playwright.local.config.ts`: 102 tests passed (desktop and mobile, port 5191); 10
    of them are this ticket's e2e tests.
  - Failing-first: before the route was mounted, all 6 API tests failed with `404` (`expected 404 to be 200`).

## Review

Reviewed by Opus (AI team lead) with the `review-checklist` lens, against the draft merge `09f796a`.

Findings:

- **Checked, no change:** every Answer is honoured. `GET /api/me/groups` is a read with no write, uses
  `resolveAccount` (`worker/auth.ts`) and `requireSignedIn` (`worker/policy.ts`), returns only `code`, `name`,
  `currency`, `isOwner` and `lastActivityAt`, and excludes removed members. The route, query and DTO match the draft.
  The home page clears the account list on every account change and hides device entries already listed. No migration.
- **Skipped (accepted gap):** JG-3 covers removal only. Member release (`POST .../members/:id/release`) is not on
  `develop`, so there is nothing to test; when it is ported, it must clear `members.user_id` (as removal does) and
  JG-3 should gain the release case.
- **Skipped (accepted):** the product owner Answers line reads "From the product owner (human):" instead of the draft's
  Opus line; the answer text is verbatim.
- **Skipped (flaky, rerun green):** one Playwright run under parallel load failed `account.spec.ts` GS-11 at 360px
  (desktop); the rerun of `account.spec.ts` and `joined-groups.spec.ts` passed 24 of 24.

Checks on this branch (worktree): `npm run typecheck` and `npm run lint` clean; `npm test` 33 files, 379 passed;
`npx playwright test --config playwright.local.config.ts` (port 5191) 101 passed and 1 flaky failure, then 24 of 24 on
rerun.
