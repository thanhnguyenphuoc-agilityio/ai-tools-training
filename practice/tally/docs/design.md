# Design: Tally

Purpose: every backlog feature is a small ticket, and whoever picks up a ticket knows in advance which parts of the
system it touches. The design aims to make **extension easy**, not to build everything up front.

## 1. Overview

```
Browser (React SPA)                      Cloudflare Worker (Hono)                 D1 (SQLite)
+----------------------+   fetch /api/*  +------------------------------+        +-----------+
| src/pages, components| --------------> | app.ts -> routes/*.ts        | -----> | groups    |
| src/api.ts (typed)   | <-------------- |   loadGroup -> auth.ts (who?)|        | members   |
| shared/* (pure logic)|   JSON + cookie |   policy.ts (may they?)      |        | expenses  |
|  money, settle, QR   |                 |   groupData.ts (rows -> DTO) |        | transfers |
+----------------------+                 +------------------------------+        | audit_log |
          ^  static assets (dist/client) served by the same Worker              +-----------+
```

- **Single deployment:** the Worker serves both `/api/*` and the SPA's static files
  (`assets.run_worker_first: ["/api/*"]`; other paths fall back to the SPA).
- **`shared/`** is pure logic with no I/O: money, debt simplification, VietQR, group codes, JSON types.
  The UI and the API import the same code, so one set of tests covers both.
- Money calculations run on **both sides**: the UI uses them for previews, the API when saving. The stored result
  (`expense_shares.amount`) is the source of truth. Balances are recomputed from the stored shares.

## 2. Folders

| Path | Role | When adding a feature |
|---|---|---|
| `shared/*.ts` | Pure logic, DTO types, error codes (`errors.ts`), currencies (`currency.ts`) | New rules (calculations, limits) go here, with unit tests |
| `worker/app.ts` | Middleware and route wiring | Mount the new route file |
| `worker/routes/*.ts` | One file per resource | Add a new file rather than growing an existing one |
| `worker/auth.ts` | **The only place** that answers "who is calling" | Add identity sources (for example a Google session) |
| `worker/policy.ts` | **The only place** that answers "may they do this" | Add new permission rules |
| `worker/groupData.ts` | Reads groups and members, `audit`, `recordChange` | Add columns to DTOs |
| `worker/http.ts` | `Env`, `ApiError`, input validation | Add new bindings to `Env` |
| `migrations/NNNN_*.sql` | Schema, numbered in order | **One new migration per feature**; existing migrations are never edited |
| `src/api.ts` | Typed client for every endpoint | Add a function per new endpoint |
| `src/i18n/` | `useI18n()`: `t`, `tp`, `money`, `parseMoney`, `day`, `errorMessage`. User-facing text lives only in `locales/*.ts` | Add keys to `en.ts` first (it defines the types), then to the other locales |
| `src/styles/` | SCSS: `abstracts/` (tokens, mixins), `base/` (themes, reset), `blocks/` (shared BEM blocks) | Shared blocks go in `blocks/`; component-specific blocks sit next to the component |
| `src/components/*` | One component per UI block, with a `.scss` file of the same name when it has its own block | |
| `tests/unit`, `tests/api`, `e2e/` | Vitest (logic), Vitest + Miniflare (API), Playwright (UI) | A bug fix comes with a test that fails first |

## 3. Identity and permissions

There are three identity sources, all resolved in `resolveIdentity()`:

| Source | Client storage | Server storage | Provides |
|---|---|---|---|
| Owner key | cookie `tally_owner_<code>` (HttpOnly, path `/api/groups/<code>`) | `groups.owner_key_hash` | `isOwner` |
| Device token | cookie `tally_member_<code>` = `<memberId>.<token>` | `members.token_hash` | `memberId` |
| Google session | cookie `tally_session` (path `/api`) | `sessions.token_hash` -> `users` | `userId`, from which `memberId`/`isOwner` are derived |

Routes never compare ids directly. All rules live in `policy.ts`: `requireMember`, `requireOwner`,
`requireCanEditMember`, `requireCanDeleteExpense`, `requireCanRecordTransfer`, `requireCanConfirmTransfer`.
A future rule such as "a closed group is read-only" (not planned; `lock_groups` does not do this) only needs
`requireWritable(group)`, called from the write routes.

## 4. Data

- Money: `INTEGER` in the **minor unit** of the group currency (dong, cent, yen). Weights: `REAL` with at most two
  decimal places, converted to integer hundredths before calculation.
- Timestamps: ISO-8601 UTC strings (`created_at`...). Expense dates: `YYYY-MM-DD` without a time zone.
- Ids: `crypto.randomUUID()`. Group codes: `shared/groupCode.ts`.
- Expenses are soft-deleted. Hard deletes (cascade) are reserved for purging a whole group (`purge_inactive_groups`).
- No `CHECK (x IN (...))` for extensible enum-like values, because SQLite has to rebuild the table to change one.
  Values are validated in code.
- `last_activity_at` tracks the time of the last change (through `recordChange` in `worker/groupData.ts`). Viewing does not move it. Used by `purge_inactive_groups`.

## 5. Language, currency and interface

### Language (i18n)

- Source code is English only. All user-facing text lives in `src/i18n/locales/<lang>.ts`.
- `en.ts` defines the keys; the `Messages` type forces every other locale to provide them.
  `tests/unit/i18n.test.ts` also checks that all locales have the same keys and the same `{placeholder}`s.
- Keys are type-checked dot paths, for example `t('expenseForm.title')`.
- Plurals use `tp('expenseList.people', n)` with `Intl.PluralRules`. Vietnamese needs only the `other` form.
- Each locale also declares:
  - `intl`: the tag passed to `Intl`.
  - `amountInput`: how users type amounts (decimal separator, `k`/`tr`/`m` suffixes, currency marks).
  - `defaultCurrency`: the suggested currency for new groups.
- Locale detection order: the stored choice (`localStorage` `tally.locale`), then `navigator.languages`, then `vi`.
- Language picker (`language_picker`, restyled in `header_controls_icons`): `src/components/LanguagePicker.tsx`
  (+ `.scss`, block `language-picker`) is rendered in `.app__controls` inside `.app__header` in `src/App.tsx`, so it
  is on every page. It is a menu button (`aria-haspopup="listbox"`) that shows the flag and the name of the current
  language, and a `listbox` built from `localeOptions()` (each `LOCALES[x].label`, the language named in itself)
  with a flag per option. A native `<select>` cannot show images in its options, hence the custom menu; its keyboard
  rules follow a native select: arrows and Home/End move the highlight (`src/components/listboxKeys.ts`, unit
  tested), Enter or Space chooses, Escape closes and returns focus to the button, Tab closes and moves on. Choosing calls
  `setLocale()`, which writes the choice with `saveLocale()` to `localStorage` only; nothing is sent to the API.
  Flags are inline SVGs in `src/components/Flag.tsx`, typed `Record<Locale, ...>`: a new locale needs a flag
  there before it type-checks, then appears in the menu without other changes.
- Changing the language re-renders the app with the new translator. The "new group" form in `HomePage` keeps its
  selected currency in component state initialised once from `defaultCurrency`, so an open form keeps its currency
  and only a newly opened form takes the default of the current language.
- The API never returns user-facing sentences. Error bodies have the form `{ error, code, params }`, and the UI
  translates `code` through `errors.<CODE>`. A new code in `shared/errors.ts` causes a type error in every locale
  until it is translated.
- Adding a language means one new locale file and one entry in `LOCALES` (`src/i18n/index.tsx`).

### Currency

- Each group has a `currency` (ISO 4217) chosen by the owner at creation. The default follows the interface language
  (vi: VND, en: USD).
- `shared/currency.ts` lists the supported currencies with their `minorDigits` and valid rounding steps, in minor
  units: VND `[1, 1000]`, USD `[1, 100]`, JPY `[1, 100]`...
- The currency can be changed only while the group has **no** expenses or transfers (`CURRENCY_LOCKED`), so no stored
  amount is ever reinterpreted.
- VietQR is available only for VND groups. Other groups show the account number without a QR code. Currency
  conversion is `currency_conversion`.
- Adding a currency means one entry in `CURRENCIES`. A unit test checks `minorDigits` against `Intl`.

### Interface (SCSS + BEM)

- BEM naming: `.block`, `.block__element`, `.block--modifier`. Selectors are nested at most one level.
  Mixing classes is allowed, for example `class="card stack"`.
- Component stylesheets load before the shared blocks (`src/main.tsx` imports `./App` first), so a component
  class cannot override a block property, such as the width of `field__control`, at the same specificity. Scope
  the component selector to its row or element instead (see `.expense-form__participant .expense-form__share-input`).
- System fonts differ per OS: the Linux fonts on the GitHub Actions runner are wider than Segoe UI. Text next to a
  fixed-width control must be able to wrap (`overflow-wrap: anywhere`, as on `.expense-form__name`), and layout
  checks in e2e must pass on Linux, not only on the developer's machine. The CI `e2e` job runs in the Playwright
  image (`mcr.microsoft.com/playwright:v<version>-noble`), so its fonts are fixed by the image tag; the tag changes
  together with `@playwright/test` in `package-lock.json` (a unit test checks that they match).
- Tokens (spacing, radius, font sizes, breakpoints) live in `abstracts/_tokens.scss` and are used through
  `space(4)`, `font-size(sm)` and `@include up(md)`.
- Mobile first: base styles target phones. Breakpoints are `sm` 520px, `md` 768px and `lg` 1024px.
  From `lg` up, the group page shows the form and the list in two columns.
- Colors come only from the CSS custom properties in `base/_themes.scss`:
  - The default follows `prefers-color-scheme`.
  - `<html data-theme="light|dark">` overrides it. `src/theme.ts` owns the preference (`system`, `light`,
    `dark`) and stores light/dark in `localStorage` (`tally.theme`); `system` removes the key.
  - The choice is applied before first paint by an inline script in `index.html` (same key, checked by a unit
    test), then again in `main.tsx`.
  - The picker is `src/components/ThemePicker.tsx` (BEM block `theme-picker`) in `.app__header`: a `fieldset`
    of native radios styled as a segmented control (built in `theme_picker`). Each option shows an icon (monitor,
    sun, moon) from `src/components/Icon.tsx`; its name is visually hidden text (the accessible name) and the
    `title` tooltip (`header_controls_icons`).
- Icons are inline SVGs in `src/components/Icon.tsx`, drawn with `currentColor` and `aria-hidden`; the control
  around an icon provides the accessible name.
  - A new theme means one palette mixin and one `[data-theme='...']` selector.
- Built in `ui_redesign`:
  - Group page: `GroupSummaryBar` (figures from the pure `src/groupSummary.ts`) above the tabs. The tab list has
    the `tabs--bottom-mobile` modifier: below `md` it is fixed to the bottom edge (`$tab-bar-height`, safe-area
    inset), and `.app` adds the same bottom padding so no content hides behind it.
  - Confirmation toasts: `ToastProvider` in `src/main.tsx`, `useToast()` in components, styles in `src/toast.scss`.
    A toast stores a message key and its variables and is translated when rendered, so it follows a language
    change. Errors are not toasts; they stay on their form as `text--error`. `TOAST_DURATION` (6 s) and
    `TOAST_LIMIT` (3) live in `src/toast.tsx`; below `md` the stylesheet hides all but the two newest cards, while
    the live region still announces every toast.
  - Stacking order tokens in `abstracts/_tokens.scss`: tab bar, menu, toast, dialog.
  - Icons: `Icon.tsx` covers the tabs, copy, download, add and delete actions; an icon-only button
    (`button--icon`) always has an `aria-label`.
- Modal dialogs use `useDialog` (`src/hooks/useDialog.ts`) for focus, `Tab` wrapping, `Escape` and focus return
  (`dialog_keyboard_focus`).

## 6. Feature roadmap (designed up front, built per ticket)

### google_sign_in (built), joined_groups_list, saved_bank_details

- **Migration `0004_accounts.sql`:**
  - Table `users(id, google_sub UNIQUE, email, name, bank_bin, account_no, account_name, created_at)`.
  - Table `sessions(token_hash PK, user_id, created_at, expires_at)`. Expired sessions are deleted by the daily
    cleanup job (`runDailyJobs` from `worker/cleanup.ts`).
  - Column `members.user_id`, with a unique index on `(group_code, user_id) WHERE user_id IS NOT NULL`.
  - Column `groups.owner_user_id`.
- **Sign-in:**
  - The client uses _Google Identity Services_ to obtain an ID token (JWT).
  - The token is sent to `POST /api/auth/google`. The Worker verifies it with WebCrypto in `worker/google.ts`
    instead of a JWT library: it adds no dependency and the Workers runtime already provides WebCrypto. It verifies
    the RS256 signature using Google's public JWKS (`https://www.googleapis.com/oauth2/v3/certs`, cached in module
    scope per `Cache-Control`), checks issuer, `audience = GOOGLE_CLIENT_ID`, `email_verified` and expiry, upserts
    `users` in one `INSERT ... ON CONFLICT(google_sub) DO UPDATE` and opens a 30-day session (`tally_session`).
    `POST /api/auth/dev` shares the same upsert.
  - A token whose `kid` is not in the cached keys refetches the keys at most once per 60 seconds
    (`MIN_REFETCH_MS`): the endpoint is open to anyone, so forged tokens with random key ids must not cause one
    outbound request each.
  - Only the `openid email profile` scopes are needed. No client secret is required.
- **Configuration:**
  - `GOOGLE_CLIENT_ID` (public value, in `vars` of `wrangler.jsonc`; empty string disables Google button).
  - A _Web_ OAuth client ID in Google Cloud Console, with origins `http://localhost:5173` and the deployed domain.
- **Development and tests:**
  - `POST /api/auth/dev {email, name?}`, enabled only when `DEV_LOGIN=true` **and** the hostname is `localhost`.
  - API and e2e tests use this endpoint. It returns 404 when either condition is missing.
  - `TALLY_PORT` and `TALLY_DEV_LOGIN` allow running development and Playwright on separate ports (e2e on port 5174,
    `reuseExistingServer: false`, so it never reuses a dev server started by hand on 5173).
- **`resolveIdentity`:**
  - `Identity.userId`.
  - `isOwner` is also true when `groups.owner_user_id = userId`.
  - `memberId` comes from device token if present, else from `members.user_id`.
- **Account linking (`worker/accountLink.ts`, reused by `lock_groups`):**
  - Creating, joining or claiming while signed in sets `user_id` automatically.
  - `POST /groups/:code/link` attaches a group used through cookies to the account. It records `group.link` (target:
    the owner member) or `member.link` (target: the linked member) with `recordChange`, so linking moves
    `last_activity_at`.
  - "Both or nothing" for an owner: each of the two `UPDATE`s in the `db.batch` also requires the other row to be free
    for this account (`EXISTS` subquery), so a request that lost a race changes neither `groups.owner_user_id` nor
    `members.user_id`, and the route then answers the matching 403 or 409.
  - `canLinkAccount` in `GET /groups/:code` comes from `canLinkToAccount` in `policy.ts`, which mirrors those checks
    without throwing: the button is offered only when the request can succeed (nothing is linked yet, or the owner key
    is held and only one of the two rows is linked to this account).
  - A unique-index violation (`idx_members_group_user`) from two simultaneous joins, claims or links of one account
    answers `409 ACCOUNT_ALREADY_MEMBER`, never `500`.
  - Points (1) and (2) settled:
    (1) `requireNotMember(me)` checks `me.accountMemberId` first (`409 ACCOUNT_ALREADY_MEMBER`), then `me.memberId`
    (`409 ALREADY_MEMBER`).
    (2) Both member removal and member release (`POST .../members/:id/release`) clear `members.user_id`, so released
    and removed members no longer resolve to the account.
- **`joined_groups_list`:** `GET /api/me` returns `{ user }`.
- **`saved_bank_details`:**
  - `PATCH /api/me` stores bank details in `users`.
  - A member with a `user_id` but no account entered in the group gets the profile's details in the DTO
    (`LEFT JOIN users` in `loadMembers`, chosen in `toMemberDto`).
  - An account entered in the group always takes precedence over the profile.
- **Files:**
  - New: `worker/google.ts`, `worker/routes/account.ts`, `worker/accountLink.ts`, `worker/routes/link.ts`,
    `src/account.tsx`, `src/components/AccountMenu.tsx` (+ `.scss`).
  - Changed: `auth.ts`, `policy.ts`, `groupData.ts`, `http.ts`, `shared/types.ts`, `shared/errors.ts`, `locales/*.ts`.

### purge_inactive_groups

Built. Rules in `docs/business-rules.md` (Groups, Automatic deletion).

- **Rules:** `shared/rules.ts` with `INACTIVE_DAYS = 10`, `expiresAt(lastActivityAt)` and `inactiveBefore(now)`.
- **Code:** `worker/cleanup.ts` with `purgeInactiveGroups(db, now)` and `runDailyJobs(env, now)`. Runs
  `DELETE FROM groups WHERE last_activity_at < ? RETURNING code`. `google_sign_in` adds expired-session deletion to
  the same job, which returns both counts.
  Child tables are removed by `ON DELETE CASCADE`, declared since v1.
- **Schedule:**
  - `worker/index.ts` exports `scheduled()`.
  - `wrangler.jsonc` has `"triggers": { "crons": ["0 19 * * *"] }` (02:00 Vietnam time).
  - Tests call `purgeInactiveGroups` directly with a fake `now`.
- **Migration:** `0003_activity_reset.sql` sets `last_activity_at` of every existing group to the migration time,
  so that no group is deleted by the first run.
- **Activity:** only changes move `last_activity_at` (through `recordChange` in `worker/groupData.ts`); viewing and recovery links no longer do.
- **Group settings:** `PATCH /groups/:code` answers `{ ok: true, changed }`. A request that repeats the stored values answers `changed: false`, writes nothing and adds no audit entry; the settings form then shows no "saved" message.
- **Recovery link:** `POST /groups/:code/owner/claim` reads the body before it loads the group. Answering 404 for a deleted group before the body is consumed makes the Vite dev proxy fail with "fetch failed", so a malformed body on a missing group answers 400 `INVALID_JSON`, and a valid request for a deleted group answers 404 `GROUP_NOT_FOUND` (the client then forgets the group). The claim is audited with `audit()` only.
  - Known dev-only limit: reading the body first reduces the Vite/undici "fetch failed" on an early 404 but does not remove it. There is no Vite proxy in production, so production is not affected.
- **Migration numbers:** `0003_activity_reset.sql` is built. `0004_accounts.sql` (`google_sign_in`), `0005_group_lock.sql` (`lock_groups`), `0006_attachments.sql` (`receipt_photos`).
- **UI:** `<GroupExpiry>` component (`src/components/GroupExpiry.tsx`, `GroupExpiry.scss`) renders the deletion date (`GroupDto.expiresAt`), highlighted during the last 72 hours.
- **Tests:** `tests/unit/rules.test.ts`, `tests/api/purge.test.ts`, `tests/api/activity-reset.test.ts`, `e2e/purge.spec.ts`.

### lock_groups

- **Migration:** `0005_group_lock.sql` adds `groups.locked_at`.
- **Purge:** `purgeInactiveGroups` gains `AND locked_at IS NULL`.
- **Endpoints:** `POST` and `DELETE /groups/:code/lock`.
  - Require both `isOwner` and `userId`, because the limit is counted per person.
  - If `owner_user_id` is empty, it is set to the current account. If the group belongs to another account, 403.
  - Count `locked_at IS NOT NULL AND owner_user_id = ?`. When the count is >= `MAX_LOCKED_GROUPS`, 409.
  - Unlocking calls `recordChange`, so the expiry restarts from the moment of unlocking.
- **Permissions:** `requireOwnerAccount(me)` in `policy.ts`.
- A lock only exempts the group from deletion; a locked group stays fully editable. The interface calls it "Keep
  this group". Known limit: two locks at the same moment can pass `MAX_LOCKED_GROUPS` (no D1 transaction).

### receipt_photos

- **Storage:** R2 binding `RECEIPTS`.
- **Migration:** `0006_attachments.sql` creates
  `expense_attachments(id, expense_id, r2_key, content_type, size, created_by, created_at)`.
- **Client side:** resize to at most 1600px and encode as WebP through `<canvas>`. Re-encoding **removes EXIF/GPS**.
  The compressed size must be at most 1 MB.
- **Upload:** `POST /groups/:code/expenses/:id/attachments` with a binary body.
  This route has its own `bodyLimit` (1 MB); JSON routes keep 16 KB.
  The server accepts only `image/webp|jpeg|png`.
- **Download:** `GET .../attachments/:aid` goes through the Worker with a group check. The bucket is never public.
- **Deletion:** deleting an expense keeps its photos until the group is purged. Purging a group must also delete
  its R2 objects, because D1 cascades do not reach R2.

### attendance_split

- **Migration:** table `group_sessions(id, group_code, day, starts_at, ends_at, note)` and table
  `attendance(session_id, member_id)`.
- **Session costs:** ordinary `expenses` with an extra `session_id` column. Default participants are the members
  marked present. The core money and settlement logic **does not change**.
- **Time:** start and end times are stored as `HH:mm` in the group's local time. Sessions that end after midnight
  (for example 21:00-00:30) must be handled explicitly.

### exact_amount_split

Built. Rules in `docs/business-rules.md` (Expenses, split modes).

- **Data:** `split_mode = 'exact'`; no migration, since `0001_init.sql` has no `CHECK` on `split_mode`. Each share
  row stores the typed amount (zero allowed) and `weight = 1`, as in equal mode. `SplitMode` in `shared/types.ts`
  is used by `ExpenseDto` and `NewExpense`; a `NewExpense` participant carries `amount` in exact mode.
- **Logic (`shared/money.ts`):**
  - `splitExact(amount, parts)` returns the parts unchanged (no rounding) and throws unless they are integers from
    0 to `MAX_AMOUNT`, unique per member and add up exactly to `amount`.
  - `exactSplitDifference(amount, parts)` is `amount - sum(parts)`, used by the form and the API.
  - `parseShareAmount(input, rules, currency)`: an empty field is 0; anything else uses the `parseAmount` rules
    (both share the private `parseMinorUnits`), with zero allowed, so `0k` or `0 VND` is 0. `parseAmount` itself
    still rejects zero, as the total must be positive. Exposed as `parseShareMoney` by `useI18n()` and
    `useGroupMoney()`.
- **API (`worker/routes/expenses.ts`):** `shareAmount()` in `worker/http.ts` validates each amount
  (`INVALID_SHARE_AMOUNT`); a sum that differs from the total is `SPLIT_SUM_MISMATCH`. Tests in
  `tests/api/exact-split.test.ts`.
- **UI:** `ExpenseForm` has a third split option, "Exact shares", with one share field per selected participant
  and a live status line: the amount left to assign, the excess, an invalid share, or that the shares match.
  Saving is blocked until they match. `ExpenseList` labels exact expenses. Settle-up needs no change, since balances come from the stored shares.
  E2e test in `e2e/exact-split.spec.ts`.

### csv_export

Built. Rules in `docs/business-rules.md` (Spreadsheet export).

- Client-only, built from the loaded `GroupDto`; no API change, no migration, no rule in `policy.ts`.
- `src/csv.ts`: generic CSV text (RFC 4180 quoting, CRLF, UTF-8 BOM). Cells are either `text()` (written by people,
  guarded against formulas with a leading `'`) or `raw()` (formatted by the app: dates, amounts, currency codes).
- `src/groupCsv.ts`: `buildGroupCsv(group, t)` lays out the table and `csvFileName(name, today, fallback)` builds the
  file name. Neither touches the DOM, so both are unit tested in Node (`tests/unit/csv.test.ts`,
  `tests/unit/groupCsv.test.ts`). The transfer date depends on the device time zone, so the tests fix `TZ`.
  - Expenses and transfers share one table with a type column; each person's share is one column per member,
    in `GroupDto.members` order. A share whose member is missing gets its own column, numbered
    (`csvExport.unknownMember`) so that two missing members never share a header, and a row's shares always add up
    to its amount.
  - Shares are read from `ExpenseDto.shares`, so the export does not depend on the split mode.
- `shared/money.ts` `toDecimalString(amount, currency)` turns minor units into a plain major-unit string from the
  integer's digits (`minorDigits`), without floating-point division.
- `src/download.ts` is the only DOM part (Blob, object URL, temporary link). The "Download CSV" button sits in the
  group header in `GroupPage.tsx` and is rendered only when `me.memberId` is set.
- Text comes from `csvExport.*` in the locales. The e2e test `e2e/csv-export.spec.ts` reads the downloaded file
  through Playwright's download event.
- A date range filter, if requested later, only needs a filter on the rows in `buildGroupCsv`.

### language_picker, theme_picker

- Each picker is its own component inside `.app__controls` in `.app__header`: the header is a flex row with the
  app name on the left, and `.app__controls` (`margin-inline-start: auto`) keeps the controls together on the right.
  Since `header_controls_icons` the row does not wrap: both controls are compact (the language name is hidden
  below `sm`) and the header fits on one row from 360px up, checked by an e2e test. A further header control has
  to keep that width budget.
- `language_picker` is built: `src/components/LanguagePicker.tsx` (see section 5, Language).
- `theme_picker` is built: `src/components/ThemePicker.tsx` and `ThemePicker.scss`, messages under `theme.*`
  in the locales, tests in `tests/unit/theme.test.ts` and `e2e/theme.spec.ts`.

### lint_conventions

Built. Project conventions are checked automatically by `npm run lint`:

- **JavaScript/TypeScript:** `oxlint` parses TypeScript 7.x directly without needing `typescript-eslint` peer dependencies. A custom JS plugin (`practice/tally/lint/tally-plugin.mjs`, rule `tally/no-literal-ui-text`) ensures all user-facing JSX text and attributes (`aria-label`, `title`, `placeholder`, `alt`) come from `t()`/`tp()` in `src/i18n/locales`. The rule inspects bare JSX text, string literals in JSX expression containers (`{'...'}`), template literals, and conditional/logical expression branches, while allowing whitespace-only layout literals (`{' '}`) and non-target attributes (`className`, `key`, `href`). Built-in plugins `typescript` and `react` provide correctness checks and React hooks validation (`exhaustive-deps`).
- **Styles:** `stylelint` with `stylelint-config-standard-scss` enforces BEM class selectors (`selector-class-pattern`) and forbids raw hex and named colors outside `src/styles/base/_themes.scss` (`color-no-hex`, `color-named`). Stylistic and layout rules managed by Prettier are turned off in `stylelint.config.mjs`.

### owner_member_tools

- No API change: `PATCH /groups/:code/members/:id` and `POST /groups/:code/transfers` with `fromId` already allow the
  owner (`requireCanEditMember`, `requireCanRecordTransfer`).
- UI: `MembersPanel` shows an edit action per member for the owner, reusing `BankForm`; `SettlePanel` shows the
  "Pay" action on every suggested transfer for the owner, and `api.recordTransfer` gains an optional `fromId`.

### edit_expense

- Depends on an open question in `docs/business-rules.md` (who may edit and whether history is kept). The BA
  exercise settles the rules first; the design is written into this section in the same branch as the feature.
- Constraints already known: shares are recomputed only through `splitAmount` (`splitExact` for exact splits);
  edits are written to `audit_log`; permission rules go into `policy.ts`.

### remove_member

- Rules: `docs/business-rules.md`, "Removing a member". A member leaves only with a zero balance, so no stored
  share or transfer is ever rewritten.
- Data: migration `0002_member_removal.sql` adds `members.removed_at` and `members.removed_reason`. The row is
  kept (soft delete) because expenses, shares and transfers reference it. `MemberDto` gains `removed` and
  `removedReason`.
- API: `POST /groups/:code/members/:id/remove` with `{ reason? }`. Owner only: `requireCanRemoveMember` in
  `policy.ts`, checked before the member is loaded, so a plain member or a guest gets `403 OWNER_ONLY`. The owner
  member is refused with `CANNOT_REMOVE_OWNER`, a member with a balance or a pending transfer with
  `MEMBER_HAS_BALANCE`, an already removed member with `MEMBER_REMOVED`. Written to `audit_log` as
  `member.remove`. The UPDATE repeats `removed_at IS NULL` and checks `meta.changes`, so of two simultaneous
  removals one gets `MEMBER_REMOVED`.
- Races (D1 has no interactive transaction, but runs one statement or batch at a time): new expenses and transfers
  repeat the "no named member is removed" check inside their INSERT (`noneRemovedSql()` in `groupData.ts`, an
  `INSERT ... SELECT ... WHERE NOT EXISTS`); when it writes nothing the route returns `PAYER_NOT_IN_GROUP` or
  `PARTICIPANT_NOT_IN_GROUP`. An expense's shares are inserted in the same batch, only next to an expense row. The
  removal checks the balance again after its UPDATE, when no new write can name the member any more, and undoes the
  UPDATE with `MEMBER_HAS_BALANCE` if an expense or transfer committed in between. Tests simulate each interleaving
  with `interleave()` in `tests/api/helpers.ts`.
- `groupData.ts`: `loadLedger()` loads the expenses (deleted ones left out) and transfers for both
  `GET /groups/:code` and the removal; `memberSettlement()` runs `computeBalances` from `shared/settle.ts` on it,
  so the API and the UI cannot disagree on a balance, and finds a pending transfer in the same ledger. Also
  `loadActiveMember()` (claim, edit, remove) and `loadActiveMemberIds()` (new expenses and transfers).
- `DELETE /groups/:code/expenses/:id` refuses an expense whose payer, or a participant with a non-zero share, has
  been removed (`409 EXPENSE_HAS_REMOVED_MEMBER`), so a removed member's balance stays zero. The check is a
  `NOT EXISTS` inside the soft-delete UPDATE, so a removal cannot commit between the check and the delete.
  `ExpenseList` shows a note instead of the delete button on such an expense (`involvesRemovedMember()` in
  `src/expenseRow.ts`).
- `auth.ts`: a device token of a removed member no longer resolves to a member, so the device is a guest.
- UI: `MembersPanel` shows a remove action per member for the owner (the removal is confirmed in a dialog) and lists
  removed members after the current ones. `ExpenseForm`, `JoinPanel` and the balances in `SettlePanel` show
  current members only. When a save fails with `PAYER_NOT_IN_GROUP` or `PARTICIPANT_NOT_IN_GROUP` (a member removed
  on another device), `ExpenseForm` shows the error and reloads the group; a payer who is no longer listed falls back
  to the user or the first current member. The suggested transfers (`src/settleView.ts`) are computed between current members only,
  and a removed member with a non-zero balance (which the rules prevent) is named in a note instead. The CSV export keeps a share column for every member, removed ones included, because
  their past shares are part of the history.

### ui_redesign

- Built; see section 5, Interface. Direction: keep the green accent and system fonts (no font download), quieter
  section titles in spaced capitals, figures in tabular numerals, icons only where they carry meaning.
- Not done in this ticket: skeleton loading, and the remaining in-form status texts (`stale_language_messages`).
- Screenshots: 3 widths x 2 themes x (home + 3 tabs), before and after, in the merge request.

### currency_conversion

- Store the rate agreed by the group in `groups.settle_rate` (new migration); no external exchange-rate API.
- The QR uses `amount * rate`, rounded to VND. The screen shows both amounts.

### vietqr_code_style

Built. src/qrCard.ts holds the QR options and asset paths; QrDialog renders the card.

- Error correction H (about 30% recovery). The centre logo is wide and short (32% by 14% of the code, about 5% of
  its area) on a white rounded box.
- Logos are static files in public/bank-logos/<bin>.png, one per bank in shared/banks.json (a unit test keeps the
  two in step), and public/qr/ for the VietQR wordmark and mark. An onError on the logo switches to the mark.
- The card keeps a white background and dark text in both themes (--color-qr-bg, --color-qr-text).
- The e2e test decodes a screenshot of the code with the logo on top (jsqr, pngjs).

### dialog_keyboard_focus

Built. `useDialog` keeps `Tab` and `Shift+Tab` inside the panel, closes on `Escape` and returns focus to the opener.

- Initial focus goes to the `data-autofocus` element, else the panel. React `autoFocus` is not used: under
  StrictMode the effect cleanup focuses the opener before the effect runs again.
- Payment dialog: **Close** gets focus, so an immediate `Enter` does not record a transfer. Remove member: the
  reason field; `Escape` is ignored while the removal request runs.

## 7. Ticket workflow

1. Branch `feat/<ticket_name>` or `fix/<ticket_name>` from `develop`; move the ticket to `tickets/in-progress/` (see `tickets/README.md`).
2. New migration if needed. Run `npm run db:migrate` locally.
3. Pure logic in `shared/` with unit tests. Permissions in `policy.ts`. Endpoints in `routes/`, with API tests.
4. UI: `src/api.ts`, then components (text in `src/i18n/locales`, BEM styles). E2e tests for main flows.
5. Update `docs/business-rules.md` (move rules from "Planned" into the main sections) and this file.
6. Merge request into `develop`: what changed, why, how it was tested, screenshots for UI changes. Typecheck,
   unit/API tests and e2e must pass locally and in the GitHub Actions run (`.github/workflows/ci.yml`).
   The AI team lead runs e2e, reviews and merges; the human then tests on `develop` before the release to `main`
   (workflow in `tickets/README.md`).

## 8. Deployment (when needed)

```bash
npx wrangler login
npx wrangler d1 create tally            # paste the database_id into wrangler.jsonc
npx wrangler d1 migrations apply DB --remote
npm run deploy
```

The Workers and D1 free tier is sufficient. `DEV_LOGIN` is never set in a deployed environment.
