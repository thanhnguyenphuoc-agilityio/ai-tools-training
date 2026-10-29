# Messages stay in the previous language after switching

| Field | Value |
|---|---|
| ID | `TAL-24` |
| Labels | `type::bug`, `priority::low`, `area::ui` |
| Reporter | Opus (AI team lead, code review of `language_picker`) |
| Assignee | Haiku (developer) |
| Depends on | - |
| Related | `language_picker` |

## Description

Since `language_picker`, the interface language can change while a page is open. Most text follows the new language
at once, but a message already on screen does not: errors and status messages such as "Saved" stay in the language
that was active when they appeared, until the next action replaces them.

The reviewer expected every visible message to follow the language chosen in the header.

## Notes from the reporter

Seen in the code during review rather than through a user report. The components keep the translated text in state
(`setError(...)`, `setStatus(...)`), for example in `ExpenseForm`, `MembersPanel`, `SettlePanel`, `QrDialog`,
`GroupPage` and `HomePage`, so the text is fixed when the message is created.

## Analysis

Since `language_picker`, `setLocale()` re-renders the app with a new translator. Text computed during render follows the
new language at once. Text computed once and kept in component state does not.

Confirmation messages were moved to toasts in `ui_redesign`. A toast stores a message key and its variables
(`src/toast.tsx`), so the "Saved" status the reporter mentions already follows the language. What remains are the
**error messages**. Each component below keeps the translated sentence in state as `useState<string | null>`, so the
text is fixed when the error is set:

| File | Translated text stored in state |
|---|---|
| `src/components/AccountMenu.tsx` | `errorMessage(err)` (sign-in and account actions, two sites) |
| `src/components/AccountNameDialog.tsx` | `errorMessage(err)` (save name) |
| `src/components/DeleteAccountDialog.tsx` | `errorMessage(err)` (delete account) |
| `src/components/ExpenseForm.tsx` | `t('expenseForm.invalidAmount', { examples })`, `t('expenseForm.invalidShare', { name })`, `t('expenseForm.exactMismatch')`, `errorMessage(err)` |
| `src/components/ExpenseList.tsx` | `errorMessage(err)` (delete) |
| `src/components/InviteEmailDialog.tsx` | `errorMessage(err)` (invite) |
| `src/components/JoinPanel.tsx` | `errorMessage(err)` (join, claim) |
| `src/components/KeepGroup.tsx` | `errorMessage(err)` |
| `src/components/MembersPanel.tsx` | `errorMessage(err)` in `MembersPanel`, `BankForm` and `OwnerSettings` |
| `src/components/QrDialog.tsx` | `t('qr.renderError')` (two sites), `errorMessage(err)` |
| `src/components/RemoveMemberDialog.tsx` | `errorMessage(err)` (remove) |
| `src/components/SavedBankDialog.tsx` | `errorMessage(err)` (save bank) |
| `src/components/SettlePanel.tsx` | `errorMessage(err)` (confirm) |
| `src/components/TransferOwnerDialog.tsx` | `errorMessage(err)` (transfer) |
| `src/pages/GroupPage.tsx` | `t('group.notFound')` (two sites), `errorMessage(err)` (reload, link account), `t('group.badRecoveryLink', { message: errorMessage(err) })` kept in a local `refusal` variable across the reload |
| `src/pages/HomePage.tsx` | `t('home.join.invalidCode')`, `errorMessage(err)` (create group) |

The exact-split status line in `ExpenseForm` (`exactStatus()`) is computed during render and already follows the language.

`errorMessage()` itself is correct: it uses the active translator when called. The bug is only that its result is stored.

## Reproduce

Throwaway Playwright test on `develop` (desktop project; browser locale `vi-VN`; deleted after the run):

1. Open `/`.
2. Type `bad` in the "join a group" field and submit. The Vietnamese error `home.join.invalidCode` appears.
3. Choose English in the header language menu. The page heading switches to English.

Result: `.text--error` still reads "Mã nhóm không hợp lệ. Mã có dạng xxxx-xxxx-xxxx." It equals the Vietnamese message,
not the English one. Confirmed.

## Clarifying questions

1. Should a visible error be cleared when the language changes, or translated again?
2. Which messages are in scope? Errors only, or also the confirmation messages?
3. Some errors carry text from the server that is not a known `code` (an unexpected `ApiError` without a code). Should
   those change too?
4. Should the fix cover future components as well?

## Answers

From Opus (AI team lead, reporter) and the product owner (human):

1. Translate it again. The message stays until the next attempt, as "Interface preferences" already says; only its
   language changes. (product owner)
2. Every message on screen. Confirmations are toasts and already follow the language (checked by
   `tests/unit/toast.test.ts`). This ticket covers the error messages kept by forms and pages. (AI team lead)
3. A known `code` and the network error (`common.networkError`) must follow the language. Raw server text without a
   code has no translation and stays as received. (AI team lead)
4. Yes. Components store what to say (a message key and its variables, or the error that was thrown), never the
   translated sentence. design.md states this as the rule. (product owner)

## Acceptance criteria

- Every error message on screen re-translates on a language change.
- A raw server text without a code stays as received.
- No component keeps translated text in state.
- No new i18n key, no API change, no migration.

## Test matrix (QA)

| Case | Level | Expected |
|---|---|---|
| Home page, invalid group code, then switch language | e2e | The error reads in the new language |
| Members tab, add a name already in use (`DUPLICATE_NAME`), then switch language | e2e | The server error reads in the new language |
| Expense form, invalid amount with examples, then switch language | e2e | The sentence and its examples both read in the new language |
| QR render error (`qr.renderError`) | unit | Translates in both locales |
| `group.badRecoveryLink` with a nested error | unit | The outer sentence and the nested error both translate |
| Network `TypeError` | unit | `common.networkError` in both locales |
| Known `ApiError` code with params | unit | The code's sentence with its params, in both locales |

## Plan

Branch: `fix/stale_language_messages` from `develop`. Assignee set; ticket moved to `in-progress/`.

1. **Types** in `src/i18n/types.ts`: add `MessageVar` (a variable that is a message: `{ key, vars? }`), `MessageVars`
   (`Vars` whose values may be a `MessageVar`) and the `UiMessage` union: either `{ key, vars?, error? }` or
   `{ error }`. A `UiMessage` without a key and without an error does not compile.
2. **Translator** in `src/i18n/index.tsx` `createTranslator()`: add `message(m: UiMessage): string`, next to
   `errorMessage`.
   - Without a key: `errorMessage(m.error)`.
   - With a key: each variable that is a `MessageVar` is translated with `t(value.key, value.vars)`; `m.error` fills
     `{message}` through `errorMessage`; the result is `t(m.key, vars)`.
   - Re-export the types from `src/i18n/index.tsx` so components import them from `../i18n`.
   - `message` runs on render, so the result follows the active language.
3. **Components**: change each error state to `UiMessage | null` and store either `{ key, vars? }` or `{ error: err }`.
   Render with `message(error)`. Touch only the error lines of each file, so later merges conflict only there.
   - Reuse each component's existing error state. Add no new `useState<string | null>`.
   - `ExpenseForm`: store `{ key: 'expenseForm.invalidAmount', vars: { examples: { key: examplesKey } } }`, where
     `examplesKey` is `expenseForm.amountExamplesDecimal` or `expenseForm.amountExamples` by `currency.minorDigits`.
     The examples then follow the language too.
   - `QrDialog`: the render error is stored as `{ key: 'qr.renderError' }`. The component already has a local
     `const message` (the VietQR transfer text). Destructure the helper as `message: formatMessage` rather than
     shadowing or renaming the local.
   - `GroupPage`:
     - `refusal` becomes a `UiMessage`: `{ key: 'group.badRecoveryLink', error: err }`.
     - `reload` no longer uses `t` or `errorMessage`, so its dependencies become `[code]`.
     - Keep the existing order: the refusal is set after `reload()` clears the error.
     - Keep the `version` effect unchanged.
   - Other `GroupPage` state (`newOwnerKey`, `showOwnerNote`) is not touched.
   - Keep each file's other code unchanged. The format-on-edit hook formats only the edited files.
4. **Toasts**: no change. They already store keys (`src/toast.tsx`); `tests/unit/toast.test.ts` covers this.
5. **i18n**: no new keys. No API change, no error code, no migration.
6. **Tests**, with the failing tests committed first:
   - `tests/unit/uiMessage.test.ts`: `createTranslator('vi')` and `createTranslator('en')` call `message()` for a key
     with variables, an `ApiError` with a known code and params (`FIELD_TOO_LONG`, `max: 40`), a `TypeError`
     (`common.networkError`), `group.badRecoveryLink` with an error, and a `MessageVar` variable
     (`expenseForm.invalidAmount` with `expenseForm.amountExamples`). Keys are checked against `en.ts` before use.
     Non-ASCII test input uses `\uXXXX` escapes.
   - `e2e/language-picker.spec.ts`: three tests, one per e2e row of the test matrix. All text comes from `t()` and
     `en` from `e2e/i18n.ts`. Names are synthetic (`Jamie`). Each test fails before the fix.
7. **Docs**:
   - `docs/business-rules.md`, "Interface language": add "Messages already on screen (errors and confirmations) switch
     to the new language at once."
   - `docs/design.md`, section 2, `src/i18n/` row: add `message`.
   - `docs/design.md`, section 5 Language: add a bullet on `UiMessage` and `message()`. Components store what to say,
     never the translated sentence.
   - `docs/design.md`, `ui_redesign`: replace "and the remaining in-form status texts (`stale_language_messages`)" with
     a pointer to section 5.
8. **Checks**: `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:hooks`, and
   `npx playwright test --config playwright.local.config.ts` (port 5192). A known launch timeout may be rerun once.

## Commits

1. `docs(tickets): start stale_language_messages with a plan`
2. `test: cover re-translation of stored messages`
3. `fix: re-translate stored messages when the language changes`
4. `docs: document stored messages re-translating on language change`
5. `docs(tickets): move stale_language_messages to waiting-to-merge`

## Merge request

- Branch: `fix/stale_language_messages` into `develop`.
- Summary of changes:
  - No new i18n key, no API change, no migration. `src/i18n/types.ts` adds `MessageVar`, `MessageVars` and the `UiMessage` union. `createTranslator()` adds `message()`, re-exported from `src/i18n/index.tsx`.
  - Every stored error is a `UiMessage` (`{ key, vars? }` or `{ error }`) and is rendered with `message()`, so it follows the active language. A raw server text without a code stays as received.
  - `ExpenseForm` stores the invalid-amount examples as a nested `MessageVar`. `QrDialog` reads the helper as `message: formatMessage` so the VietQR transfer text keeps its local name. `GroupPage` keeps the refusal set after reload, now as `{ key: 'group.badRecoveryLink', error }`, and `reload` depends only on `[code]`.
  - Tests: `tests/unit/uiMessage.test.ts` and three cases in `e2e/language-picker.spec.ts` (invalid group code, `DUPLICATE_NAME` on the members tab, invalid amount with examples).
  - Docs: `docs/business-rules.md` (Interface language) and `docs/design.md` (section 2 `message`, section 5 `UiMessage`, `ui_redesign` points at section 5).
- Commands run and results (port 5192 for Playwright):
  - `npm run typecheck`: clean.
  - `npm run lint`: clean.
  - `npm test`: 41 files, 452 tests passed.
  - `npm run test:hooks`: 29 of 29 passed.
  - `npx playwright test --config playwright.local.config.ts`: 134 passed, 2 skipped (the existing saved-bank keyboard test and the existing My name Escape test, both on the mobile project).

## Review

Reviewed by Opus (AI team lead).

- Every component that kept a translated error in state now keeps a `UiMessage` (a key with variables, or the
  thrown error) and renders it with `message()`, so a visible error follows a language change (answers 1 and 4).
- Raw server text without a code goes through `errorMessage()` unchanged (answer 3). The nested amount examples
  are a `MessageVar`, so no part of the sentence keeps the old language.
- Tests: `tests/unit/uiMessage.test.ts` and three e2e cases in `e2e/language-picker.spec.ts`; the e2e cases fail on
  the previous code (the error text stays Vietnamese).
- Note for the batch: `wrong_name_claim`, `owner_member_tools` and `edit_expense` were branched before this fix; their
  new or changed error states are moved to `UiMessage` when they are merged. No changes needed on this branch.
- Checks: typecheck and lint clean, 452 unit and API tests, 29 hook tests, e2e 134 passed and 2 skipped.
