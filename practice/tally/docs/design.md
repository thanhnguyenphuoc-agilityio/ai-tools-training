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
| Owner key | cookie `tally_owner_<code>` (HttpOnly, path `/api/groups/<code>`) | `groups.owner_key_hash` (`'revoked'` once the group is tied to an account) | `isOwner` |
| Device token | cookie `tally_member_<code>` = `<memberId>.<token>` | `members.token_hash` | `memberId` |
| Google session | cookie `tally_session` (path `/api`) | `sessions.token_hash` -> `users` | `userId`, from which `memberId`/`isOwner` are derived |

Routes never compare ids directly. All rules live in `policy.ts`: `requireMember`, `requireOwner`,
`requireOwnerAccount`, `requireCanEditMember`, `requireCanDeleteExpense`, `requireCanRecordTransfer`, `requireCanConfirmTransfer`, `canLinkToAccount`, `requireNoSharedOwnedGroups`, `requireCanTransferOwnership`, `requireTransferTarget`, `requireCanSetInviteEmail`, `canAutoLinkInvite`.
A future rule such as "a closed group is read-only" (not planned; `lock_groups` only stops deletion) only needs
`requireWritable(group)`, called from the write routes.

## 4. Data

- Money: `INTEGER` in the **minor unit** of the group currency (dong, cent, yen). Weights: `REAL` with at most two
  decimal places, converted to integer hundredths before calculation; `weight()` in `worker/http.ts` stores
  `roundWeight()` so the stored value matches the split.
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
  (`dialog_keyboard_focus`). A dialog opened from a menu item that unmounts (the account dialogs in `AccountMenu`)
  cannot return focus to its opener, so its `onClose` focuses the menu button instead.

## 6. Feature roadmap (designed up front, built per ticket)

### google_sign_in (built), joined_groups_list (built), saved_bank_details

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
    scope per `Cache-Control`), checks issuer, `audience` (a string or an array) contains `GOOGLE_CLIENT_ID`,
    `email_verified` and expiry, upserts
    `users` in one `INSERT ... ON CONFLICT(google_sub) DO UPDATE` (the name is kept when `name_custom = 1`, see
    `join_as_account`) and opens a 30-day session (`tally_session`).
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
  - `POST /groups/:code/link` attaches a device member to the account (`linkToAccount`). It records `member.link`
    (target: the linked member) with `recordChange`, so linking moves `last_activity_at`. The owner branch was removed
    in `owner_link_binds_account`: an owner member is refused with `403 OWNER_ONLY`.
  - The owner is attached by `attachOwnerGroup`, which is used by `POST /groups/:code/owner/claim` (signed in, valid key),
    `POST /groups/:code/owner/attach` (`tryAttachOwnerGroup`, the known refusals answer `attached: false`) and the lock route.
    It records `group.link` (target: the owner member) with `recordChange`.
  - "Both or nothing" for an owner: each of the two `UPDATE`s in the `db.batch` also requires the other row to be free
    for this account (`EXISTS` subquery), so a request that lost a race changes neither `groups.owner_user_id` nor
    `members.user_id`, and the route then answers the matching 403 or 409. The groups `UPDATE` also sets
    `owner_key_hash` to the sentinel in the same statement.
  - `canLinkAccount` in `GET /groups/:code` comes from `canLinkToAccount` in `policy.ts`, which mirrors the device
    member checks without throwing: the button is offered only to a non-owner device member that is not linked to any
    account, when the account has no other member in the group.
  - A unique-index violation (`idx_members_group_user`) from two simultaneous joins, claims or links of one account
    answers `409 ACCOUNT_ALREADY_MEMBER`, never `500`.
  - Points (1) and (2) settled:
    (1) `requireNotMember(me)` checks `me.accountMemberId` first (`409 ACCOUNT_ALREADY_MEMBER`), then `me.memberId`
    (`409 ALREADY_MEMBER`).
    (2) Both member removal and member release (`POST .../members/:id/release`) clear `members.user_id`, so released
    and removed members no longer resolve to the account.
- **`joined_groups_list`:** built; see "joined_groups_list (built)" below. `GET /api/me` returns `{ user }`.
- **`saved_bank_details` (built):**
  - The bank columns on `users` are already added in `0004_accounts.sql`.
  - `PATCH /api/me` stores bank details in `users` (validated with `bankDetails`, 401 `SIGN_IN_REQUIRED` without session).
  - A member with a `user_id` but no account entered in the group gets the profile's details in the DTO
    (`LEFT JOIN users` in `loadMembers`, chosen in `toMemberDto`).
  - `toMemberDto` assigns `bankSource`: `'group'` if `account_no` entered in group, else `'account'` if saved details exist on linked user, else `null`. Removed members always receive `null` and `bankSource: null`.
  - `GET /groups/:code` returns `me.accountLinked: boolean` (true when caller's member is linked to their account).
  - An account entered in the group always takes precedence over the profile.
  - In `MembersPanel`, the own member form shows a note when `bankSource === 'account'` and reveals an empty form only on "Use different details in this group"; forms prefill only when `bankSource === 'group'`, preventing accidental copies of saved details into the group.
- **Files:**
  - New: `worker/google.ts`, `worker/routes/account.ts`, `worker/accountLink.ts`, `worker/routes/link.ts`,
    `src/account.tsx`, `src/components/AccountMenu.tsx` (+ `.scss`).
  - Changed: `auth.ts`, `policy.ts`, `groupData.ts`, `http.ts`, `shared/types.ts`, `shared/errors.ts`, `locales/*.ts`.

### delete_account (built)

- **Rules:** `docs/business-rules.md`, "Deleting the account (`delete_account`)".
- **Migration:** `0006_audit_details.sql` adds `audit_log.details` (`TEXT`, JSON, NULL when an entry records only its target). `audit()` and `recordChange()` keep their signatures.
- **Batch deletion (`worker/accountDelete.ts`):** `deleteAccount(db, userId, now)` runs one atomic `db.batch` with six explicit statements, in this order:
  1. `INSERT` into `audit_log` with action `group.unlock`, actor `owner` and details `{"reason":"account.delete"}`, for kept groups owned by the account.
  2. `UPDATE groups SET locked_at = NULL, last_activity_at = now` for the same kept groups. Statement 1 must run first because it selects on `locked_at IS NOT NULL`.
  3. Clear `groups.owner_user_id` for groups owned by the account (non-kept groups do not touch `last_activity_at`).
  4. Clear `members.user_id` for members linked to the account.
  5. `DELETE FROM sessions` for the account.
  6. `DELETE FROM users` for the account.
  Explicit statements instead of relying on the foreign key actions of `0004_accounts.sql`.
- **API (`worker/routes/account.ts`):** `DELETE /api/me` uses `requireSignedIn(await resolveAccount(c))` (`worker/policy.ts`, 401 `SIGN_IN_REQUIRED` without a session), counts the shared owned groups with `countSharedOwnedGroups` (`worker/accountDelete.ts`) and calls `requireNoSharedOwnedGroups(count)` (409 `ACCOUNT_OWNS_SHARED_GROUP` with `{ count }`), then calls `deleteAccount(c.env.DB, userId, now())`, clears the cookie with `clearSessionCookie(c)` (`worker/auth.ts`, already present) and returns `{ ok: true }`.
  - Known limit: the count and the `deleteAccount` batch are two statements, not one transaction. A member that becomes active in that window is detached with the group, as with any owned group. The window is small, and the refusal is a guard for the common case, not a lock.
- **UI:**
  - `src/api.ts`: `deleteMe()`.
  - `src/account.tsx`: `deleteAccount()` in the context (calls `deleteMe`, sets `user` to `null`, bumps `version`).
  - `AccountMenu`: "Delete account" menu item opens `DeleteAccountDialog` (`DeleteAccountDialog.tsx`, `.scss`, block `delete-account`). The dialog uses `useDialog(onClose, { canClose: !deleting })` from `src/hooks/useDialog.ts`, shows errors through `errorMessage(err)`, and notifies `deleteAccount.done` on success.
- **Lock interaction:** kept groups owned by the account stop being kept, so a group cannot be kept indefinitely with no owner account able to stop keeping it.
- **Tests:** `tests/api/delete-account.test.ts` (DA-1..DA-8), `e2e/delete-account.spec.ts` (DA-9).

### purge_inactive_groups

Built. Rules in `docs/business-rules.md` (Groups, Automatic deletion).

- **Rules:** `shared/rules.ts` with `INACTIVE_DAYS = 10`, `expiresAt(lastActivityAt)` and `inactiveBefore(now)`.
- **Code:** `worker/cleanup.ts` with `purgeInactiveGroups(db, now)` and `runDailyJobs(env, now)`, running
  `DELETE FROM groups WHERE last_activity_at < ? AND locked_at IS NULL RETURNING code`. `google_sign_in` adds expired-session deletion to
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
- **Recovery link:** `POST /groups/:code/owner/claim` reads the body before it loads the group. Answering 404 for a deleted group before the body is consumed makes the Vite dev proxy fail with "fetch failed", so a malformed body on a missing group answers 400 `INVALID_JSON`, and a valid request for a deleted group answers 404 `GROUP_NOT_FOUND` (the client then forgets the group). Without an account the claim is audited with `audit()` only; signed in, it attaches the group (`group.link`, see `owner_link_binds_account`).
  - Known dev-only limit: reading the body first reduces the Vite/undici "fetch failed" on an early 404 but does not remove it. There is no Vite proxy in production, so production is not affected.
- **Migration numbers:** `0006_audit_details.sql` (`delete_account`) is now the newest migration, after `0005_group_lock.sql` (`lock_groups`) and `0004_accounts.sql` (`google_sign_in`). `0007_owner_key_revoke.sql` (`owner_link_binds_account`) is the next migration; `receipt_photos` takes a later number. A future `edit_expense` migration must not add `audit_log.details` again. They are indicative: a branch takes the next free number when it creates its migration, never edits one that has been pushed, and updates this section if the number differs.
- **UI:** `<GroupExpiry>` component (`src/components/GroupExpiry.tsx`, `GroupExpiry.scss`) renders the deletion date (`GroupDto.expiresAt`), highlighted during the last 72 hours; for a kept group (`GroupDto.locked`) it renders the kept line instead, without the highlight.
- **Tests:** `tests/unit/rules.test.ts`, `tests/api/purge.test.ts`, `tests/api/activity-reset.test.ts`, `e2e/purge.spec.ts`.

### lock_groups (built)

- **Migration:** `0005_group_lock.sql` adds `groups.locked_at` (`TEXT`, NULL = not locked). No new index: the count uses the existing `idx_groups_owner_user`.
- **Purge:** `purgeInactiveGroups` gains `AND locked_at IS NULL`.
- **Endpoints:**
  - `POST /groups/:code/lock`: answers `{ ok: true, changed: boolean }`.
  - `DELETE /groups/:code/lock`: answers `{ ok: true, changed: boolean }`.
  - `GET /groups/:code`: returns `GroupDto` with `locked: boolean` and `expiresAt: string | null` (`null` while kept).
  - Require both `isOwner` and `userId` (`requireOwnerAccount(me)` in `policy.ts`), because the limit is counted per person.
  - Check order (round 3, answer 2): `403 OWNER_ONLY` comes first, whether the visitor is signed in or not; then `401 SIGN_IN_REQUIRED` for an owner without an account session.
  - A group with no account yet is attached through `attachOwnerGroup` (`worker/accountLink.ts`) before it locks, so the group and the owner member are linked together, all or nothing, and the owner key is revoked. Its refusals apply: `403 GROUP_OWNED_BY_OTHER_ACCOUNT`, `409 ACCOUNT_ALREADY_MEMBER`, `409 MEMBER_LINKED_ELSEWHERE`. After that `canLinkAccount` is false for the group. Setting `groups.owner_user_id` alone would leave the owner member unlinked.
  - Count `SELECT COUNT(*) FROM groups WHERE owner_user_id = ? AND locked_at IS NOT NULL`. When the count is >= `MAX_LOCKED_GROUPS` (10), answers `409 LOCK_LIMIT_REACHED` with params `{ max: 10 }`. The same count is repeated inside the `UPDATE` (`... AND (SELECT COUNT(*) ...) < 10`), so two simultaneous locks cannot both pass it; when the `UPDATE` changes no row, the route reads the group again and answers `changed: false` if it is already locked, otherwise `LOCK_LIMIT_REACHED`. The unlock `UPDATE` carries `AND locked_at IS NOT NULL`, so two simultaneous unlocks write one `group.unlock` row.
  - Repeat lock or repeat unlock returns `{ ok: true, changed: false }` and writes nothing.
  - Unlocking is a change (`recordChange`), so `last_activity_at` is set to the unlock time and the expiry restarts from the moment of unlocking (unlock + 10 days).
- **Permissions:** `requireOwnerAccount(me)` in `policy.ts`.
- **UI:** `<KeepGroup>` component rendered at the end of `OwnerSettings` in `MembersPanel.tsx`. `<GroupExpiry>` renders `t('group.expiry.kept')` without warning colors when locked.
- A lock only exempts the group from deletion; a locked group stays fully editable. The interface calls it "Keep this group".
- **Tests:** `tests/api/lock-groups.test.ts`, `e2e/lock-groups.spec.ts`.

### receipt_photos

- **Storage:** R2 binding `RECEIPTS`.
- **Migration:** `0007_attachments.sql` creates
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

### joined_groups_list (built)

- **Rules:** `docs/business-rules.md`, Accounts > Groups list.
- **Endpoint:** `GET /api/me/groups` (`worker/routes/myGroups.ts`, mounted on `/` after `accountRoutes`).
- **Auth:** `resolveAccount(c)` in `worker/auth.ts`, then `requireSignedIn(account)` in `worker/policy.ts`; requests
  without a session answer `401 SIGN_IN_REQUIRED`.
- **Query:** selects groups owned by the account or having an active (non-removed) member linked to the account:
  `SELECT g.code, g.name, g.currency, g.last_activity_at, (g.owner_user_id = ?1) AS is_owner FROM groups g WHERE g.owner_user_id = ?1 OR EXISTS (SELECT 1 FROM members m WHERE m.group_code = g.code AND m.user_id = ?1 AND m.removed_at IS NULL) ORDER BY g.last_activity_at DESC, g.code`.
- **No visit tracking:** viewing a group writes nothing. Groups are ordered by latest change (`last_activity_at` DESC, `code` ASC).
- **Home page merge:** when signed in, `HomePage` fetches `GET /api/me/groups` and renders the "Your groups" card above the device history card; device history entries whose group code is already in the account list are filtered out.
- **DTO:** `MyGroupDto { code, name, currency, isOwner, lastActivityAt }` and `MyGroupsResponse { groups: MyGroupDto[] }` in `shared/types.ts`.
- **Tests:** `tests/api/joined-groups.test.ts` (JG-1 to JG-6) and `e2e/joined-groups.spec.ts` (JG-7, JG-8).

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

### owner_link_binds_account (built)

- **Sentinel decision:** `groups.owner_key_hash` holds `'revoked'` (constant `REVOKED_OWNER_KEY` in `worker/auth.ts`)
  once the owner access is tied to an account. A SHA-256 hex digest is 64 characters, so the 7-character sentinel never
  equals a real hash; `resolveIdentity` also checks the sentinel explicitly, so `hasOwnerKey` is false for a revoked group.
- **No table rebuild:** D1 enforces foreign keys and ignores `PRAGMA foreign_keys=OFF` inside migrations, and the implicit
  delete of `DROP TABLE groups` would fire `ON DELETE CASCADE` on every child table, even with `defer_foreign_keys`. The
  sentinel is a single reversible `UPDATE`, so the column stays `NOT NULL` and no schema changes.
- **Migration `0007_owner_key_revoke.sql`:** `UPDATE groups SET owner_key_hash = 'revoked' WHERE owner_user_id IS NOT NULL`
  revokes every group that already has an account owner. It does not touch anonymous groups.
- **Creation while signed in:** `POST /groups` stores the sentinel, sets no owner cookie and answers `ownerKey: null`.
  The page shows `OwnerAccessNote` instead of the recovery banner; `HomePage` passes `created: true` in the navigate state.
- **Attach and claim:** `attachOwnerGroup` (`worker/accountLink.ts`) sets `owner_user_id`, `owner_key_hash` and the owner
  member's `user_id` in one `db.batch`, with the same `EXISTS` guards as before, then reads back to choose the refusal.
  `tryAttachOwnerGroup` maps `GROUP_OWNED_BY_OTHER_ACCOUNT`, `MEMBER_LINKED_ELSEWHERE` and `ACCOUNT_ALREADY_MEMBER` to
  `attached: false`. The claim route answers `attached: true` when it attached, `OWNER_KEY_REVOKED` for a revoked key with no account, and `GROUP_OWNED_BY_OTHER_ACCOUNT` for a revoked key held by another account.
- **Device history:** after sign-in, `afterSignIn()` (`src/account.tsx`) runs `attachDeviceGroups` (`src/ownerAttach.ts`) over
  the device history: one `POST /groups/:code/owner/attach` per group, sequential, failures ignored, then `refresh()`.
- **Lock:** `POST /groups/:code/lock` keeps `requireOwnerAccount` first, then `requireGroupNotOwnedByOther`, then attaches
  through `attachOwnerGroup` and clears the owner cookie; the `lock_limit_race` update is unchanged.
- **Account deletion:** `countSharedOwnedGroups` and `requireNoSharedOwnedGroups` refuse `DELETE /api/me` while an owned group
  has another active member. A solo owned group is detached and stays revoked, so it has no owner left.
- **Tests:** `tests/api/owner-link-binds-account.test.ts` (OL-1 to OL-9, including the migration), `tests/unit/ownerAttach.test.ts`,
  `e2e/owner-link-binds-account.spec.ts`. Updated: `tests/api/account.test.ts`, `tests/api/delete-account.test.ts`,
  `tests/api/joined-groups.test.ts`, `tests/api/lock-groups.test.ts` (LG-4, LG-10, LG-12), `tests/unit/groupCsv.test.ts`,
  `e2e/account.spec.ts`.

### transfer_ownership (built)

- **Endpoint:** `POST /api/groups/:code/owner/transfer` with `{ memberId }` (`worker/routes/groups.ts`, after `owner/attach`).
  Order: `loadGroup`, `requireCanTransferOwnership` (`OWNER_ONLY`), `readJson`, `loadActiveMember` (`404 MEMBER_NOT_FOUND`,
  `409 MEMBER_REMOVED`), `requireTransferTarget` (`409 OWNER_TRANSFER_SELF`, `409 OWNER_TRANSFER_NOT_LINKED`), then the
  current owner member lookup.
- **One `db.batch` of four statements** sharing one hand-over timestamp (`handOverAt`):
  - (a) `UPDATE groups SET owner_user_id = <receiver account>, owner_key_hash = 'revoked'`, guarded by the previous owner
    still being the active owner member and the receiver still being an active member linked to that account.
  - (b) `UPDATE members SET is_owner = CASE WHEN id = receiver THEN 1 ELSE 0 END` for the two ids, guarded by the group
    now being owned by the receiver with the revoked hash and the previous owner still being the active owner member.
  - (c) `INSERT INTO audit_log ... 'group.unlock', '{"reason":"owner.transfer"}'` `SELECT ... WHERE locked_at IS NOT NULL`
    and the same ownership guards, with actor the previous owner member. It runs before (d).
  - (d) `UPDATE groups SET locked_at = NULL, last_activity_at = handOverAt` with the same guards. A group that is not kept
    matches nothing in (c) and (d) and keeps `last_activity_at`.
  - A lost race (the guards match nothing) writes nothing in (b), (c) and (d): no second owner and no `group.unlock` row.
- **Why not `recordChange()` for the unlock:** `recordChange()` opens its own batch, so its unlock would apply even when the
  ownership move lost the race. The unlock must share the batch and its guards. `owner.transfer` alone goes through `audit()`,
  because a hand-over of a group that is not kept is not a change (Answer 3).
- **Read back:** the receiver's member row. When it is not the owner: `MEMBER_REMOVED`, `OWNER_TRANSFER_NOT_LINKED`, else
  `403 OWNER_ONLY` (the caller lost ownership in a race).
- **Success:** `clearOwnerCookie` for the caller, then `audit(db, code, me, 'owner.transfer', receiverMemberId)`. Response `{ ok: true }`.
  Other devices holding the old owner cookie are cleared on their next request, because `resolveIdentity` ignores a revoked key.
- **DTO:** `MemberDto.hasAccount` (`worker/groupData.ts` `toMemberDto`) is a boolean only: `user_id !== null` for active
  members, `false` for removed ones. No account id or email is returned.
- **Kept groups:** `purgeInactiveGroups` keeps the group after the hand-over, because `last_activity_at` is the hand-over time.
  The new owner can keep it again through `POST /lock`.
- **Known limits (deferred):** device tokens of the previous owner member keep member-level access. `delete_account` checks
  the owned groups and deletes in a separate batch, so a member joining in between can leave a shared group without an owner.
- **Tests:** `tests/api/transfer-ownership.test.ts` (TO-1 to TO-15, the racing hand-overs through `interleave`, the
  30 s timeout on the long tests), `tests/unit/ownerTools.test.ts` (`canTransferTo`), `e2e/transfer-ownership.spec.ts`.

### join_as_account (built)

- **Migration:** `0008_user_name_custom.sql` adds `users.name_custom INTEGER NOT NULL DEFAULT 0`. Existing rows get 0.
- **Upsert:** `upsertUser` in `worker/routes/account.ts` sets `name = CASE WHEN users.name_custom = 1 THEN users.name ELSE excluded.name END` on conflict; the email is always refreshed.
- **`PATCH /api/me`:** accepts `name` (trimmed, 1 to 40 characters). A valid name sets `name_custom = 1`. When `name` is absent, `name` and `name_custom` keep their stored values, and bank fields work as before. One `UPDATE` writes both sets of fields.
- **Client:** `api.updateMe` takes `Partial<BankDetails> & { name?: string }`. `AccountNameDialog` (block `account-name-dialog`) is opened from the "My name" item in `AccountMenu` and uses `useDialog`. `JoinPanel` prefills the field from `useAccount().user.name` (cut to 40 characters), keeps it editable, and refills it when the account loads later, until the person types.
- **No group change:** the name write touches no group, member, `audit_log` row or `last_activity_at`.
- **Tests:** `tests/api/account-name.test.ts` (AN-1 to AN-6, migration default on a pre-existing row).

### member_email_invite (built)

- Migration `0009_member_invite_email.sql`: `ALTER TABLE members ADD COLUMN invite_email TEXT`. Nullable, no index,
  because every lookup is inside one group.
- Validation: `optionalEmail(value, field)` in `worker/http.ts` returns null or a trimmed lowercase address. Errors use
  `400 INVALID_EMAIL` and never carry the value.
- Policies in `worker/policy.ts`: `requireCanSetInviteEmail(me)` (owner) and `canAutoLinkInvite(me)` (account set, no
  member on this device or account).
- Routes: `POST /groups/:code/members` (`claim: false` only, stores `invite_email`); `PATCH /groups/:code/members/:id`
  writes `invite_email` only when the body carries `inviteEmail`, so other edits leave it unchanged. Claim, device
  account link (`worker/accountLink.ts`) and remove clear `invite_email` in their guarded `UPDATE`s.
- Auto-link: `linkInvitedMember(db, group, me, email)` in `worker/inviteLink.ts` runs one guarded
  `UPDATE ... RETURNING id`. The matching query picks the oldest (`created_at`, `id`) active unclaimed member
  (`token_hash` and `user_id` NULL) with `lower(invite_email) = lower(?)`, and requires that the account has no active
  member in the group. A unique-index violation counts as no match.
- **The GET write exception:** `GET /groups/:code` is the only GET that writes. It writes only when a link actually
  happens, through `recordChange` (`member.link`, the linked member as target). The response then shows the member as
  `me.memberId`.
- Exposure: `MemberDto.invited` is derived in `toMemberDto`, which never spreads the row. No DTO or error param holds the
  email.
- **Release note (future):** the release route (`wrong_name_claim`, not built) must clear `invite_email` when it
  releases a member, as claim, link and remove already do.
- Tests: `tests/api/member-invite.test.ts`, `tests/unit/ownerTools.test.ts`, `e2e/member-invite.spec.ts`.

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
