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
| `worker/groupData.ts` | Reads groups and members, `touch`, `audit` | Add columns to DTOs |
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
| *(`google_sign_in`)* Google session | cookie `tally_session` (path `/api`) | `sessions.token_hash` -> `users` | `userId`, from which `memberId`/`isOwner` are derived |

Routes never compare ids directly. All rules live in `policy.ts`: `requireMember`, `requireOwner`,
`requireCanEditMember`, `requireCanDeleteExpense`, `requireCanRecordTransfer`, `requireCanConfirmTransfer`.
A future rule such as "a closed group is read-only" only needs `requireWritable(group)`, called from the write routes.

## 4. Data

- Money: `INTEGER` in the **minor unit** of the group currency (dong, cent, yen). Weights: `REAL` with at most two
  decimal places, converted to integer hundredths before calculation.
- Timestamps: ISO-8601 UTC strings (`created_at`...). Expense dates: `YYYY-MM-DD` without a time zone.
- Ids: `crypto.randomUUID()`. Group codes: `shared/groupCode.ts`.
- Expenses are soft-deleted. Hard deletes (cascade) are reserved for purging a whole group (`purge_inactive_groups`).
- No `CHECK (x IN (...))` for extensible enum-like values, because SQLite has to rebuild the table to change one.
  Values are validated in code.
- `last_activity_at` has been maintained since v1 (`audit()` and member GETs), so `purge_inactive_groups` has data to work with.

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
- Language picker (`language_picker`): `src/components/LanguagePicker.tsx` (+ `.scss`, block `language-picker`) is
  rendered in `.app__controls` inside `.app__header` in `src/App.tsx`, so it is on every page. It is a `<select>`
  built from `localeOptions()` (each `LOCALES[x].label`, the language named in itself) and calls `setLocale()`,
  which writes the choice with `saveLocale()` to `localStorage` only; nothing is sent to the API. A new locale
  appears in the picker without changes to the component.
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
  checks in e2e must pass on Linux, not only on the developer's machine.
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
    of native radios styled as a segmented control (built in `theme_picker`).
  - A new theme means one palette mixin and one `[data-theme='...']` selector.
- The full visual redesign is `ui_redesign`.

## 6. Feature roadmap (designed up front, built per ticket)

### google_sign_in, joined_groups_list, saved_bank_details

- **Migration `0002_accounts.sql`:**
  - Table `users(id, google_sub UNIQUE, email, name, bank_bin, account_no, account_name, created_at)`.
  - Table `sessions(token_hash PK, user_id, created_at, expires_at)`. Expired sessions are deleted by the daily
    cleanup job (`purgeInactiveGroups` from `purge_inactive_groups`, or a job of its own if that ticket is not done yet).
  - Column `members.user_id`, with a unique index on `(group_code, user_id) WHERE user_id IS NOT NULL`.
  - Column `groups.owner_user_id`.
- **Sign-in:**
  - The client uses *Google Identity Services* (the "Sign in with Google" button) to obtain an ID token (JWT).
  - The token is sent to `POST /api/auth/google`. The Worker verifies it with `jose` (`createRemoteJWKSet` with
    `https://www.googleapis.com/oauth2/v3/certs`, Google's `issuer`, `audience` = `GOOGLE_CLIENT_ID`, and
    `email_verified` required), upserts `users` and opens a session.
  - Only the `openid email profile` scopes are needed. No client secret is required.
- **Configuration:**
  - `GOOGLE_CLIENT_ID` (public value, in `vars` of `wrangler.jsonc`).
  - A *Web* OAuth client ID in Google Cloud Console, with origins `http://localhost:5173` and the deployed domain.
- **Development and tests:**
  - `POST /api/auth/dev {email}`, enabled only when `DEV_LOGIN=true` (in `.dev.vars`, which is git-ignored)
    **and** the hostname is `localhost`.
  - API and e2e tests use this endpoint. A test must show that it returns 404 when either condition is missing.
- **`resolveIdentity` gains a source:**
  - `Identity.userId`.
  - `isOwner` is also true when `groups.owner_user_id = userId`.
  - `memberId` comes from `members.user_id` when there is no device cookie.
- **Account linking:**
  - Creating, joining or claiming while signed in sets `user_id` automatically.
  - `POST /groups/:code/link` attaches a group used through cookies to the account.
- **`joined_groups_list`:** `GET /api/me` returns `{ user, groups[] }`: existing groups where `owner_user_id = me` or a member has
  `user_id = me`. The home page merges this list with the localStorage history.
- **`saved_bank_details`:**
  - `PATCH /api/me` stores bank details in `users`.
  - A member with a `user_id` but no account of their own gets the profile's details in the DTO
    (`LEFT JOIN users` in `loadMembers`, chosen in `toMemberDto`).
  - An account entered in the group always takes precedence over the profile.
- **Files:**
  - New: `worker/google.ts`, `worker/routes/account.ts`, `src/components/AccountMenu.tsx`.
  - Changed: `auth.ts`, `groupData.ts`, `http.ts` (`Env`, Hono `user` variable), `shared/types.ts` (`UserDto`,
    `MeResponse`, `ConfigResponse`).

### purge_inactive_groups

- **Rules:** `shared/rules.ts` with `INACTIVE_DAYS = 10`, `expiresAt(lastActivityAt)` and `inactiveBefore(now)`.
- **Code:** `worker/cleanup.ts` with `purgeInactiveGroups(db, now)`, running
  `DELETE FROM groups WHERE last_activity_at < ?`.
  Child tables are removed by `ON DELETE CASCADE`, declared since v1. This ticket does not depend on accounts or locks;
  `lock_groups` and `google_sign_in` extend the same function later.
- **Schedule:**
  - `worker/index.ts` also exports `scheduled()`.
  - `wrangler.jsonc` gains `"triggers": { "crons": ["0 19 * * *"] }` (02:00 Vietnam time).
  - Tests call `purgeInactiveGroups` directly with a fake `now`.
- **UI:** shows the deletion date (`GroupDto.expiresAt`).
- Open question for the product owner (see `docs/business-rules.md`): whether a member viewing the group counts as
  activity. It currently **does**.

### lock_groups

- **Migration:** `0003_group_lock.sql` adds `groups.locked_at`.
- **Purge:** `purgeInactiveGroups` gains `AND locked_at IS NULL`.
- **Endpoints:** `POST` and `DELETE /groups/:code/lock`.
  - Require both `isOwner` and `userId`, because the limit is counted per person.
  - If `owner_user_id` is empty, it is set to the current account. If the group belongs to another account, 403.
  - Count `locked_at IS NOT NULL AND owner_user_id = ?`. When the count is >= `MAX_LOCKED_GROUPS`, 409.
  - Unlocking calls `touch`, so the expiry restarts from the moment of unlocking.
- **Permissions:** `requireOwnerAccount(me)` in `policy.ts`.

### receipt_photos

- **Storage:** R2 binding `RECEIPTS`.
- **Migration:** `0004_attachments.sql` creates
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

- Client-only, built from `GroupDto`. Column headers come from the locale. Amounts are exported in major units,
  with a currency code column.
- A UTF-8 BOM is needed so that Excel reads non-ASCII text correctly.

### language_picker, theme_picker

- Each picker is its own component inside `.app__controls` in `.app__header`: the header is a wrapping flex row
  with the app name on the left, and `.app__controls` (`margin-inline-start: auto`) keeps the controls together on
  the right and wraps them as one group. Further header controls go inside it.
- `language_picker` is built: `src/components/LanguagePicker.tsx` (see section 5, Language).
- `theme_picker` is built: `src/components/ThemePicker.tsx` and `ThemePicker.scss`, messages under `theme.*`
  in the locales, tests in `tests/unit/theme.test.ts` and `e2e/theme.spec.ts`.

### owner_member_tools

- No API change: `PATCH /groups/:code/members/:id` and `POST /groups/:code/transfers` with `fromId` already allow the
  owner (`requireCanEditMember`, `requireCanRecordTransfer`).
- UI: `MembersPanel` shows an edit action per member for the owner, reusing `BankForm`; `SettlePanel` shows the
  "Pay" action on every suggested transfer for the owner, and `api.recordTransfer` gains an optional `fromId`.

### edit_expense, remove_member

- Both depend on open questions in `docs/business-rules.md` (who may edit and whether history is kept; what happens
  to a leaving member's balance). The BA exercise settles the rules first; the design is written into this section
  in the same branch as the feature.
- Constraints already known: shares are recomputed only through `splitAmount` (`splitExact` for exact splits);
  edits and removals are written to `audit_log`; permission rules go into `policy.ts`.

### ui_redesign

- Keep the BEM and token conventions. The palette may change; inline SVG icons, skeleton loading and toast
  messages may be added.
- Check all 3 breakpoints and both themes. Add before/after screenshots to the merge request.
- Avoid the generic "AI-generated" look (purple gradients, identical rounded cards, emoji as icons, default system
  fonts). Settle on a clear visual direction before coding. The `frontend-design` skill (official Anthropic
  plugin) is recommended for this ticket.

### currency_conversion

- Store the rate agreed by the group in `groups.settle_rate` (new migration); no external exchange-rate API.
- The QR uses `amount * rate`, rounded to VND. The screen shows both amounts.

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
