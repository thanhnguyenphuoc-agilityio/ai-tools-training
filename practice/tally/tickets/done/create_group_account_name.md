# Prefill the owner name when a signed-in person creates a group

| Field | Value |
|---|---|
| ID | `TAL-62` |
| Labels | `type::improvement`, `priority::medium`, `area::auth` |
| Reporter | Product owner (human) |
| Assignee | Haiku (developer) |
| Depends on | `google_sign_in` |
| Related | `join_as_account` |

## Description

A signed-in person who creates a group is still asked to type their name, although the account already holds it.
The name field should be filled with the account name. A "Use a different name" checkbox makes the field
editable, so the person can still pick another name for this group.

## Answers

From the product owner (human), given with the request:

1. When signed in, the create form shows the account name in the name field, read-only, with an unchecked "Use a
   different name" checkbox.
2. Checking the box makes the field editable (focus moves to it). Unchecking it restores the account name.
3. A signed-out person sees the form as today: an empty, editable name field and no checkbox.
4. The same name limits apply as today (1 to 40 characters). The name chosen here does not change the account
   name.

## Acceptance criteria

- The create form's name field is prefilled with the account name when a person is signed in. The field is read-only
  and shows a hint while locked.
- A "Use a different name" checkbox appears under the field only when signed in with a non-empty account name. It is
  unchecked by default.
- Checking the box makes the field editable and moves focus to it. The field starts from the account name cut to 40
  characters. Unchecking it restores the account name.
- Signed out, the form is unchanged: an empty, editable name field and no checkbox.
- The name sent on create is the locked account name, or the typed name when the box is checked. The limits stay 1 to 40
  characters. The server is unchanged and the account name is never changed by this form.
- Signing out while the box is checked leaves an editable field with the typed value and no checkbox.
- Signing in while the form is open switches the field to the account name.
- All text comes from `home.create` in `src/i18n/locales/en.ts` and `vi.ts`.

## Plan

1. Helper `createOwnerName(accountName, useDifferent, typed)` in a new `src/ownerName.ts` (pure, no React import). It
   returns `{ value, locked }`. When the trimmed account name is non-empty and the box is unchecked, it returns the
   account name cut to 40 characters and `locked: true`. Otherwise it returns the typed value and `locked: false`.
2. `src/pages/HomePage.tsx`:
   - Read `user` from `useAccount()`; add state `useDifferentName` (false) and a ref on the name input.
   - Field `value` and `readOnly` come from the helper. `onChange` updates the typed state only when not locked.
   - Submit sends the helper's `value` as `ownerName`.
   - Show the checkbox (`label.field.field--inline`, `input type="checkbox"`, `t('home.create.useDifferentName')`) only
     when the account name is non-empty. Place it directly under the name input so the `.columns` layout still works on
     phones.
   - Checking the box sets the state, sets the typed name to the account name cut to 40, and focuses the input in an
     effect after the state update. Unchecking clears the state; the helper restores the account name.
3. `src/styles/blocks/_field.scss`: modifier `field__control--readonly` with a muted background or text from existing
   custom properties in `src/styles/base/_themes.scss`. Applied only when locked.
4. `src/i18n/locales/en.ts` and `vi.ts`, inside the `home.create` block next to `yourName`: `useDifferentName` and
   `accountNameHint` (shown under the locked field). Both locales keep the same keys. `vi.ts` stays UTF-8 without BOM.
5. Tests:
   - `tests/unit/ownerName.test.ts`: signed out gives typed and unlocked; signed in with an unchecked box gives the
     account name, locked; signed in with a checked box gives typed, unlocked; a 41-character account name is cut to 40;
     a blank account name gives typed, unlocked. A Vietnamese name is written with `\uXXXX` escapes.
   - `e2e/create-group-account-name.spec.ts`: cases (a) to (d) from the answers. Helpers `devSignIn`, `uniqueEmail` and
     `setAccountName` are copied from `e2e/join-as-account.spec.ts`. The created member keeps the account name, or the
     typed name when the box is checked; the account menu label is unchanged.
   - Adapt the six specs that fill `home.create.yourName` on a signed-in page (`account.spec.ts`,
     `owner-link-binds-account.spec.ts`, `joined-groups.spec.ts`, `transfer-ownership.spec.ts`, `saved-bank.spec.ts`).
     Each fill is preceded by a check of the checkbox when the field is read-only. No restructuring.
6. Docs in the same branch: one bullet under "Accounts (optional sign-in)" in `docs/business-rules.md`, and a section
   `### create_group_account_name (built)` in `docs/design.md` placed directly after `### join_as_account (built)`.
7. Ticket: `TAL-64` as the next free ID in `tickets/README.md`.

## Merge request

Branch `feat/create_group_account_name` into `develop`. No dependency on other open branches; it changes only the client
and shares four files with `leave_group` (the `home.create` block in the locales, one bullet in `business-rules.md`
and one section in `design.md`), each in a different region.

What changed:

- `src/ownerName.ts` (new): `createOwnerName(accountName, useDifferent, typed)` returns `{ value, locked }`.
- `src/pages/HomePage.tsx`: the name field shows the account name, read-only, when signed in. The "Use a different name"
  checkbox appears under it when the account name is non-empty. Checking it focuses the field and seeds it with the
  account name cut to 40; unchecking restores the account name. Submit sends the helper value as `ownerName`.
- `src/styles/blocks/_field.scss`: modifier `field__control--readonly` (theme custom properties only).
- `src/i18n/locales/en.ts`, `vi.ts`: `home.create.useDifferentName` and `home.create.accountNameHint`.
- `tests/unit/ownerName.test.ts` (new): the five cases from the plan, plus a Vietnamese account name written with escapes.
- `e2e/create-group-account-name.spec.ts` (new): cases (a) to (d).
- `e2e/account.spec.ts`, `joined-groups.spec.ts`, `owner-link-binds-account.spec.ts`, `saved-bank.spec.ts`,
  `transfer-ownership.spec.ts`: seven signed-in fills now tick the checkbox first.
- `docs/business-rules.md`: one bullet in "Accounts (optional sign-in)". `docs/design.md`: section
  `create_group_account_name (built)` before `wrong_name_claim`.
- No server, API or migration change. `POST /groups` already accepts `ownerName` (1 to 40 characters) and does not write
  `users.name`.
- `tickets/README.md`: next free ID `TAL-64` (this batch adds TAL-62 and TAL-63).

Commands and results (run in the feature worktree):

- `npm run typecheck`: clean.
- `npm run lint`: clean.
- `npm test`: 54 files, 661 tests passed.
- `npm run test:hooks`: 29 passed, 0 failed.
- `npm run e2e`: not run in the worktree, as planned. The batch runs `e2e/create-group-account-name.spec.ts` and the
  five adapted specs (six `yourName` fills across them, seven signed-in fills in total).

## Review

Reviewed by Sonnet (QA tester).

Findings:

- [major] `src/ownerName.ts`: the locked value was `user.name` cut to 40 but not trimmed. The server trims and rejects a
  blank name (`worker/http.ts` `text`), so an account name of spaces only passed the `required` attribute and then failed
  on create with `FIELD_REQUIRED`. The same gap let leading or trailing spaces through, which the server would have trimmed
  silently. Fixed: the helper trims the account name before the lock check and the cut.
- [nit] `src/pages/HomePage.tsx`: the checkbox was shown for any truthy `user.name`, including spaces, and checking it
  seeded the typed value from the raw name. Fixed: the checkbox follows the trimmed name, and the seed uses the helper's
  already-trimmed value.

Checked and left as is:

- The two `home.create.yourName` fills left untouched (`account.spec.ts` line 104, `saved-bank.spec.ts` line 87) run on a
  signed-out page, so the field is editable there. No change needed.
- `e2e/create-group-account-name.spec.ts` covers answers (a) to (d), including the account menu label staying unchanged
  after creating with a different name.
- No `worker/` or migration change. Permissions stay in `worker/policy.ts`. Both locales carry `useDifferentName` and
  `accountNameHint`. `field__control--readonly` uses only `--color-muted`.

Checks after the fixes (run in the feature worktree):

- `npm run typecheck`: clean.
- `npm run lint`: clean.
- `npm test`: 54 files, 662 tests passed (the trim case added one).
- `npm run e2e`: still not run here. The batch runs the new spec and the five adapted specs.

Reviewed by Opus (AI team lead).

Findings:

- No blocking finding. The change is client only, as planned: `POST /groups` already trims `ownerName`, limits it to 40
  characters and never writes `users.name`. The helper `createOwnerName` is pure and trims before the lock check, so the
  value sent always passes the server rule. Submit sends the helper value, not the raw state.
- No permission, identity or migration change. Both locales carry `useDifferentName` and `accountNameHint`; the
  `field__control--readonly` modifier uses only `--color-muted`. Docs match the code; the next free ID is `TAL-64`.
- Cross-ticket: `e2e/leave-group.spec.ts` (TAL-63) creates its groups signed out, so the read-only field does not affect
  it.

Fixes: none.

Checks (feature worktree, after the QA fix):

- `npm run typecheck`: clean.
- `npm run lint`: clean.
- `npm test`: 54 files, 662 tests passed.
- `e2e/create-group-account-name.spec.ts` and the five adapted specs: run with the batch e2e on `develop`.

Confirmed by the human on `develop`. Moved to done on 2026-10-30.
Released in release/2026-10-30.
