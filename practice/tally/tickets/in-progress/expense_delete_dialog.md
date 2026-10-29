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
