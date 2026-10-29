# The saved bank details dialog ignores Escape and lets focus leave it

| Field | Value |
|---|---|
| ID | `TAL-44` |
| Labels | `type::bug`, `priority::medium`, `area::ui` |
| Reporter | Opus (AI team lead) |
| Assignee | Haiku (developer) |
| Depends on | - |
| Related | `saved_bank_details`, `dialog_keyboard_focus` |

## Description

Found in the daily review of 2026-10-28. `docs/design.md:155` says modal dialogs use `useDialog`
(`src/hooks/useDialog.ts`) for focus, `Tab` wrapping, `Escape` and focus return (`dialog_keyboard_focus`, TAL-42).
`QrDialog`, `RemoveMemberDialog` and the new `DeleteAccountDialog` follow it; `SavedBankDialog` does not. It is marked
`aria-modal="true"`, so keyboard users get the exact bug TAL-42 fixed. No unit or e2e test presses `Tab` or `Escape`
in this dialog, so the suites pass.

## Reproduce

1. Sign in, open the account menu and choose **My bank details**.
2. Press `Tab` repeatedly, then `Escape`.

Expected: focus starts inside the dialog, `Tab` and `Shift+Tab` stay in it, `Escape` closes it and focus returns to
the account menu button.

Actual: focus stays on the page behind, `Tab` walks into the header behind the backdrop, `Escape` does nothing.

## Analysis

- `src/components/SavedBankDialog.tsx`: no `useDialog`, no `ref` or `tabIndex={-1}` on `dialog__panel`, no
  `data-autofocus` field. Only the backdrop and **Close** close it.
- The dialog is opened from a menu item that unmounts (`close(false)` in `AccountMenu`), so the opener captured by
  `useDialog` is gone on close. `DeleteAccountDialog` has the same opener; check where focus lands for both.

## Plan

1. In `SavedBankDialog`, call `const panel = useDialog(onClose, { canClose: !saving })` with a `saving` state set
   during `updateMe`, as `DeleteAccountDialog` does with `deleting`. Put `ref={panel}` and `tabIndex={-1}` on the
   panel and `data-autofocus` on the bank `select`. Disable the buttons while saving.
2. Make focus return to the account menu button when the opener no longer exists, for both account dialogs: either
   let `useDialog` accept a fallback element, or have `AccountMenu` focus `button.current` in the dialogs' `onClose`.
   Keep the change in one place.
3. e2e in `e2e/saved-bank.spec.ts` (desktop project is enough): open the dialog, the bank select is focused, `Tab`
   past the last button stays in the panel, `Escape` closes it and the account menu button is focused. Add the same
   `Escape` / focus-return check to `e2e/delete-account.spec.ts`.
4. Verify: `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:e2e`.

## Review

Reviewed by Opus (AI team lead).

- `SavedBankDialog` uses `useDialog(onClose, { canClose: !saving })`: the panel has the ref and `tabIndex={-1}`,
  the bank `select` has `data-autofocus`, and the buttons and backdrop are disabled while saving. Save and clear
  share one `save` function.
- Focus return lives in one place: `AccountMenu` focuses its menu button in the `onClose` of both account dialogs,
  because the menu item that opened them is gone. `useDialog` is unchanged.
- e2e: a new keyboard test in `e2e/saved-bank.spec.ts` (desktop) and an `Escape` / focus-return step in
  `e2e/delete-account.spec.ts`; both failed before the change. `docs/design.md` notes the menu-button fallback.
- Checks: `npm run typecheck` and `npm run lint` pass, `npm test` 389 passed, `npm run e2e` 111 passed and 1
  skipped (the new keyboard test on the mobile project).

Confirmed by the human on local `develop`. Released in release/2026-10-29.
