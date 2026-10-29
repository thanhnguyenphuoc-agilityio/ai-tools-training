# Deleting an expense uses the browser confirm box

| Field | Value |
|---|---|
| ID | `TAL-53` |
| Labels | `type::improvement`, `priority::medium`, `area::ui` |
| Reporter | Product owner (human) |
| Assignee | Haiku (developer) |
| Depends on | - |
| Related | `attendance_split`, `dialog_keyboard_focus` |

## Description

Deleting an expense asks for confirmation with the browser's own confirm box. It does not follow the app's theme or
language layout, and it differs from deleting a session, which uses the app's dialog. Deleting an expense should
look and behave like deleting a session.

## Analysis

- `src/components/ExpenseList.tsx` `remove()` calls `window.confirm(t('expenseList.confirmDelete', ...))`.
- `src/components/SessionsPanel.tsx` has a private `DeleteSessionDialog` built on `useDialog` (focus trap, Escape,
  backdrop click, `busy` state, error shown inside the dialog).
- `e2e/edit-expense.spec.ts` accepts the browser dialog with `page.once('dialog', ...)`.

## Acceptance criteria

- (a) The trash button opens an in-app dialog titled "Delete this expense?", showing description, amount and day. No
  browser confirm.
- (b) Escape, Cancel or a click that starts on the backdrop closes it and keeps the expense.
- (c) Confirming deletes the expense, closes the dialog and shows the toast.
- (d) An API error stays inside the dialog, and the buttons are disabled while the request runs.
- (e) Deleting a session looks the same as before.

## Plan

1. Add `src/components/ConfirmDialog.tsx`. Props: `title`, optional `detail`, `message`, `confirmLabel`, `busy`,
   `error`, `onConfirm`, `onCancel`. The body is the current `DeleteSessionDialog` markup (`useDialog`, the
   `pressedOnBackdrop` ref, buttons disabled while busy, confirm button `text--negative`). Callers pass already
   translated strings. The only text the component translates is `common.cancel`.
2. `SessionsPanel.tsx`: delete `DeleteSessionDialog` and render `ConfirmDialog` with the same session strings. No
   visible change. Drop imports that become unused.
3. `ExpenseList.tsx`: `pendingDelete`, `deleteBusy`, `deleteError`. The trash button opens the dialog. Confirming
   calls `api.deleteExpense`, closes the dialog and shows the toast. An error stays inside the dialog. The list-level
   error stays only if something else still uses it. Deleting the expense being edited still returns the form to
   adding through `onChanged`.
4. i18n (`en.ts`, `vi.ts`), `expenseList` only: reword `confirmDelete` as a statement without a question mark; add
   `deleteTitle` and `confirmDeleteButton`.
5. `e2e/edit-expense.spec.ts`: drop the browser dialog handler. Cancel keeps the expense; confirming deletes it and
   the form assertions stay. Run `e2e/attendance.spec.ts` so the session flow is unchanged.
6. `docs/design.md`, section `dialog_keyboard_focus`: destructive confirmations use `ConfirmDialog` on `useDialog`;
   `window.confirm` is not used. No change to `docs/business-rules.md`.

## Merge request

Branch `feat/expense_delete_dialog` into `develop`. The merge request is opened on GitLab from this branch; its link is
added when it exists.

What changed:

- New `src/components/ConfirmDialog.tsx` holds the destructive-confirmation markup that used to live in
  `DeleteSessionDialog`: `useDialog`, a backdrop click that must start on the backdrop, buttons disabled while the
  request runs, and the error shown inside the dialog. Callers pass already translated strings. The only text the
  component translates is `common.cancel`.
- `SessionsPanel.tsx` renders `ConfirmDialog` with the same session strings. Deleting a session looks the same.
- `ExpenseList.tsx` no longer calls `window.confirm`. The trash button opens the dialog, which shows the description,
  amount and day. Cancel, Escape or a backdrop click keeps the expense. Confirming deletes it, closes the dialog and
  shows the toast. An API error stays in the dialog. Deleting the expense being edited still returns the form to adding.
- `expenseList.confirmDelete` is a statement. `deleteTitle` and `confirmDeleteButton` were added in both locales.
- `docs/design.md` (`dialog_keyboard_focus`) notes the shared dialog. `docs/business-rules.md` is unchanged.

Commands and results, run in `practice/tally`:

- `npm run typecheck`: pass.
- `npm run lint`: pass.
- `npm test`: 614 passed.
- `npm run test:hooks`: 29 passed.
- `npx playwright test --config playwright.local.config.ts`: 150 passed, 2 skipped. The first run died when the dev
  server stopped answering (connection refused); the rerun passed.

## Review

Reviewed by Opus (AI team lead).

Findings:

- Checked against the plan and the Acceptance criteria. `ConfirmDialog` takes the markup of the former
  `DeleteSessionDialog` unchanged (`useDialog` with `canClose: !busy`, backdrop click that must start on the backdrop,
  both buttons disabled while busy, error inside the dialog) and takes translated strings, so it hard-codes no text
  other than `common.cancel`. The session delete renders the same dialog as before.
- `ExpenseList` no longer calls `window.confirm`; the list-level error state is gone because only delete set it. The
  dialog shows description, amount and day joined by `common.separator`. Deleting the expense under edit still returns
  the form to adding through `onChanged`.
- `expenseList.confirmDelete` lost its `{description}` variable; no other caller used it. `vi` keeps its diacritics.
- No blocking findings, no fixes needed.

Verdict: approve. Commit authors and dates checked.

Checks: `npm run typecheck` and `npm run lint` passed, `npm test` 50 files / 614 passed, `npm run test:hooks` 29
passed, e2e `edit-expense` and `attendance` (port 5192) 6 passed; the builder's full e2e run was 150 passed / 2
skipped. Typecheck and `npm test` rerun on `develop` after the merge.

Confirmed by the human on local `develop`. Released in release/2026-10-29.
