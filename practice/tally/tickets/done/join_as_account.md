# Join a group with the account name

| Field | Value |
|---|---|
| ID | `TAL-48` |
| Labels | `type::improvement`, `priority::medium`, `area::auth` |
| Reporter | Product owner (human) |
| Assignee | Haiku (developer) |
| Depends on | `google_sign_in` |
| Related | `member_email_invite`, `saved_bank_details`, `joined_groups_list` |

## Description

Signing in should save the person from typing the same details in every group. The account already keeps the
display name from Google and, with `saved_bank_details`, one set of bank details. A signed-in person who opens a new
group link should be able to join in one step with the account name instead of typing a name again. The account
menu should let the person change the name the account uses.

## Notes from the reporter

- The reporter expects the account to hold the person's name, bank details and the groups they joined, marked as
  owner or not. Bank details are covered by `saved_bank_details` and the groups list by `joined_groups_list`; this
  ticket covers the name.
- Open points: whether the name can still be edited before joining, what happens when the account name is already
  taken in the group, whether changing the account name renames existing members or only applies to new joins, and
  limits on the name (length, empty).

## Answers

From the product owner (human):

1. When a signed-in person joins, the name field is prefilled with the account name and stays editable. Joining
   remains one step.
2. When the name is already taken in the group, `DUPLICATE_NAME` is returned as today and the person edits the name.
3. The account menu has a "My name" dialog to change the account name, 1 to 40 characters like a member name.
4. Changing the account name does not rename members in groups already joined; it only applies to later joins. It is
   not a change of any group.
5. Signing in with Google again does not overwrite a name the person has set themselves (today every Google sign-in
   overwrites the name).

## Analysis

- `upsertUser` in `worker/routes/account.ts` overwrites `users.name` on every sign-in
  (`ON CONFLICT ... DO UPDATE SET name = excluded.name`). Answer 5 needs to know whether the name was set by the
  person: new column `users.name_custom` in migration `0008_user_name_custom.sql`.
- `PATCH /api/me` handles bank details only. `bankDetails()` keeps the current values for absent fields, so a body
  with only `name` leaves the bank details unchanged.
- `JoinPanel` starts with an empty name. The prefill comes from `useAccount().user.name`, cut to 40 characters, because
  Google or development names can be longer than the member name limit.
- Changing the account name touches no group (Answer 4): no `recordChange`, no `audit_log` row, no change of
  `last_activity_at`.
- The dialog follows the `useDialog` pattern (`SavedBankDialog`, `RemoveMemberDialog`): focus, `Tab` containment,
  `Escape` and focus return come from the hook, and the Save and Cancel controls are disabled while a save runs.

## Acceptance criteria

- Migration `0008_user_name_custom.sql` adds `users.name_custom INTEGER NOT NULL DEFAULT 0`. Existing rows get 0.
- `PATCH /api/me` accepts `name`: trimmed, 1 to 40 characters. Empty or spaces answer `400 FIELD_REQUIRED`; more than
  40 characters answer `400 FIELD_TOO_LONG` with `max: 40`. A valid name is stored with `name_custom = 1` and the
  updated user is returned. Bank-only bodies keep working and do not change the name. No session answers
  `401 SIGN_IN_REQUIRED`.
- Google and development sign-in do not overwrite the name when `name_custom = 1`. The email is still refreshed. A name
  never set by the person still follows the name in the token.
- Changing the name does not rename any member and does not change `last_activity_at` or `audit_log` of any group.
- A signed-in visitor on a group sees the join field prefilled with the account name. The field stays editable and
  joining stays one step. A taken name answers `409 DUPLICATE_NAME`, shown as the translated error, and the person
  edits the name.
- The account menu has "My name", which opens a dialog with the current name, a 40-character limit, Save and Cancel.
  A successful save shows a toast.

## Test matrix (QA)

| Case | Expected |
|---|---|
| `PATCH /api/me {name: 'Alex Kim'}` | 200, name updated, bank unchanged |
| Name empty or only spaces | `400 FIELD_REQUIRED` |
| 41 characters | `400 FIELD_TOO_LONG` with `max: 40` |
| 40 characters | 200 |
| Signed out | `401 SIGN_IN_REQUIRED` |
| Name `Đạt`, written as `Đạt` in the test | stored and returned as typed |
| Sign in again with another Google name after a custom name | custom name kept, email refreshed |
| Sign in again with another development name after a custom name | custom name kept |
| Sign in again without a custom name | name follows the token |
| Rename account while a member of a group | member name, `last_activity_at` and `audit_log` count unchanged |
| Bank-only `PATCH` after a custom name | name kept, `name_custom` stays 1 |
| Existing user row before migration `0008` | `name_custom` is 0 after migration |
| Join with prefilled name, submit | member named after the account, linked to the account |
| Prefilled name taken | translated `DUPLICATE_NAME` message, field editable, edit and join |
| Escape in "My name" dialog | dialog closes, focus returns to the account menu button |

## Plan

1. Migration `migrations/0008_user_name_custom.sql`: a comment line and
   `ALTER TABLE users ADD COLUMN name_custom INTEGER NOT NULL DEFAULT 0`.
2. `worker/http.ts`: add `name_custom: number` to `UserRow`.
3. `worker/routes/account.ts`:
   - `upsertUser`: on conflict, `email = excluded.email` and
     `name = CASE WHEN users.name_custom = 1 THEN users.name ELSE excluded.name END`.
   - `PATCH /me`: when `body.name` is not `undefined`, validate it with `text(body.name, 'name', 40)` and set
     `name_custom = 1`; otherwise keep `account.name` and `account.name_custom`. One
     `UPDATE users SET name = ?, name_custom = ?, bank_bin = ?, account_no = ?, account_name = ? WHERE id = ? RETURNING *`.
   - Do not touch `DELETE /me` or the `accountDelete` import (TAL-46 edits them).
4. `src/api.ts`: change only the `updateMe` line to `updateMe(patch: Partial<BankDetails> & { name?: string })`.
   `SavedBankDialog` stays unchanged.
5. New `src/components/AccountNameDialog.tsx` and `AccountNameDialog.scss` (block `account-name-dialog`, mobile first,
   theme custom properties only):
   - `useDialog(onClose, { canClose: !saving })`, the ref on the `dialog__panel` element, `tabIndex={-1}`, and
     `data-autofocus` on the input; the backdrop click is ignored while saving.
   - A `saving` state; Save and Cancel are disabled while saving.
   - Initial value `user?.name.slice(0, 40) ?? ''`, input `maxLength={40}`, `required`.
   - Send the trimmed value through `api.updateMe({ name })`.
   - Errors as a string from `errorMessage(err)`.
   - On success: `await refresh()`, `notify('accountName.saved')`, `onClose()`.
6. `src/components/AccountMenu.tsx`: add the `t('account.name')` menu item above "My bank details" (role `menuitem`,
   class `account-menu__item`, closes the menu and opens the dialog), the state `nameOpen`, and the dialog render next to
   `SavedBankDialog`. The `onClose` handler refocuses the menu button, as the bank details dialog does. The sign-in
   handlers and the `useAccount` destructure are not touched (TAL-46 changes them).
7. `src/components/JoinPanel.tsx`:
   - `useAccount()`; initial name `user?.name.slice(0, 40) ?? ''`.
   - A `touched` flag set on input change; a `useEffect` fills the field from the account when it loads later and the
     field was not touched.
   - Errors stay a translated string from `errorMessage(err)`. Submit is unchanged; `DUPLICATE_NAME` shows the translated
     error and the field stays editable.
8. Locales `src/i18n/locales/en.ts` and `vi.ts`: `account.name`, and an `accountName` block (`title`, `label`, `hint`,
   `save`, `cancel`, `saved`) placed right after the `savedBank` block. No new error code. `vi.ts` stays UTF-8 without BOM,
   and non-ASCII text uses the locale file only.
9. Tests:
   - New `tests/api/account-name.test.ts`: the PATCH cases, the sign-in cases (dev sign-in and Google through
     `createGoogleKey` and `GOOGLE_CLIENT_ID`), the no-group-change case (`audit_log` count and `last_activity_at`
     before and after), the bank-only case, and the diacritics case written with `\uXXXX` escapes.
   - Migration default: `createTestEnv({ beforeMigration: '0008_user_name_custom.sql', seed })`, where the seed inserts a
     `users` row with the columns that exist before `0008`; after the migration, `name_custom` is 0.
   - New `e2e/join-as-account.spec.ts`:
     - dev sign-in as a synthetic email, open "My name", set a name, save and check the toast;
     - a group created by another context; open its link, check the prefilled field, join, check the member name;
     - a second case where the prefilled name is taken: assert the translated `errors.DUPLICATE_NAME` text, edit, join;
     - press Escape in the "My name" dialog once and check that it closes.
10. Docs, in the same branch:
    - `docs/business-rules.md` Accounts: one "Account name" bullet after the saved bank details bullet, and a sign-in
      note on `name_custom`. Members: the join prefill.
    - `docs/design.md`: a `join_as_account (built)` subsection as the last part of section 6, before `## 7. Ticket workflow`
      (migration `0008`, the upsert `CASE`, the `PATCH /api/me` fields). Edit only the google_sign_in upsert bullet.
11. Merge order: this branch merges after TAL-46 (`feat/owner_link_binds_account`) and TAL-47; expected conflicts are in
    `AccountMenu.tsx`, `worker/routes/account.ts`, the locale files and the docs.

## Merge request

Branch `feat/join_as_account` into `develop`. Merge after `feat/owner_link_binds_account` (TAL-46) and `feat/transfer_ownership` (TAL-47). Expected conflicts: `AccountMenu.tsx`, `worker/routes/account.ts`, the locale files and the docs (both branches add lines to the same blocks). The merge request link is added when it exists.

What changed:

- `migrations/0008_user_name_custom.sql` (new): adds `users.name_custom INTEGER NOT NULL DEFAULT 0`.
- `worker/routes/account.ts`: `upsertUser` keeps `users.name` when `name_custom = 1` and always refreshes the email; `PATCH /api/me` accepts `name` (trimmed, 1 to 40 characters) and sets `name_custom = 1`. Bank-only bodies keep the name.
- `worker/http.ts`: `UserRow.name_custom`.
- `src/api.ts`: `updateMe` takes `Partial<BankDetails> & { name?: string }`.
- `src/components/AccountNameDialog.tsx` and `.scss` (new): "My name" dialog on `useDialog`, with a saving state, a 40-character limit and the trimmed name sent.
- `src/components/AccountMenu.tsx`: "My name" menu item and dialog render.
- `src/components/JoinPanel.tsx`: prefills the join name from the account (cut to 40 characters), stays editable, and refills when the account loads later until the person types.
- `src/i18n/locales/en.ts`, `vi.ts`: `account.name` and the `accountName` block. No new error code.
- `docs/business-rules.md`: "Account name" bullets, join prefill in Members. `docs/design.md`: the upsert bullet in section 6 and the `join_as_account (built)` subsection.
- `tests/api/account-name.test.ts` (new): AN-1 to AN-6 and AN-5b (development sign-in), plus the migration default on a row that existed before `0008`.
- `e2e/join-as-account.spec.ts` (new): My name saved and prefilled join; taken prefilled name shows `errors.DUPLICATE_NAME`, then the edited name joins; Escape closes My name (desktop only). Each test uses unique synthetic emails.

Commands and results (run in the feature worktree; e2e on port 5193):

- `npm run typecheck`: clean.
- `npm run lint`: clean.
- `npm test`: 35 files, 397 tests passed.
- `npm run test:hooks`: 29 passed, 0 failed.
- `npx playwright test --config playwright.local.config.ts`: 116 passed, 2 skipped (desktop-only keyboard checks on the mobile project).

The first full e2e run failed 4 older tests (`account.spec.ts` at 360px and `saved-bank.spec.ts` SB-6) because the new spec had saved a custom name for the shared dev email `sam@example.com` in the worktree's local dev database. The fix is in the spec, which now uses unique emails. The local `.wrangler/state` was cleared (git-ignored) and the full suite was rerun green.

## Review

Reviewed by Opus (AI team lead).

- `users.name_custom` (migration `0008`) keeps a name set by the person when Google sign-in runs again; the email is still refreshed.
- `PATCH /api/me` accepts `name` (1 to 40 characters) and leaves the name alone for bank-only bodies.
- The "My name" dialog uses `useDialog` with a saving state; the join field is prefilled from the account and stays editable.
- No changes needed.
- Checks: typecheck and lint clean, 397 unit and API tests, 29 hook tests, e2e 116 passed and 2 skipped.

Confirmed by the human on local `develop`. Released in release/2026-10-29.
