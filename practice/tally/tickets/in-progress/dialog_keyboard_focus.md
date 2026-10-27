# Dialogs do not keep keyboard focus and the payment dialog ignores Escape

| Field | Value |
|---|---|
| ID | `TAL-42` |
| Labels | `type::bug`, `priority::medium`, `area::ui` |
| Reporter | Sonnet (QA tester) |
| Assignee | Haiku (developer) |
| Depends on | - |
| Related | `vietqr_code_style`, `remove_member` |

## Description

Found during the manual test of `vietqr_code_style`. The app has two modal dialogs, the payment dialog
(`QrDialog`) and the remove member dialog (`RemoveMemberDialog`). Both are marked `aria-modal="true"`, but keyboard
users can leave them and the payment dialog cannot be closed from the keyboard.

## Reproduce

1. Open a VND group with a debt to a member who has a bank account, go to the settle-up tab and press **Pay**.
2. Press `Tab` repeatedly.
3. Press `Escape`.

Expected: focus moves into the dialog when it opens, `Tab` and `Shift+Tab` cycle inside it, `Escape` closes it, and
focus returns to the **Pay** button.

Actual:

- Focus stays on the page behind when the dialog opens.
- After the last button, `Tab` moves to the header behind the backdrop.
- `Escape` does nothing; only the backdrop, **Close** and **I have sent it** close the dialog.
- After closing, focus is not returned to the button that opened it.

`RemoveMemberDialog` closes on `Escape` and focuses the reason field, but has the same `Tab` escape and does not
return focus.

## Analysis

- `src/components/QrDialog.tsx` has no key handler and no initial focus.
- `src/components/RemoveMemberDialog.tsx` adds its own `keydown` listener on `window` for `Escape` and uses
  `autoFocus`; no focus trap, no focus return.
- The two dialogs share the `dialog` block styles but no behaviour. A shared piece (a `useDialog` hook or a `Dialog`
  component) would give both the same keyboard handling, and any later dialog would get it for free.
- `RemoveMemberDialog` must keep its rule that `Escape` is ignored while the removal request is running.

## Notes from the reporter

- Pre-existing in both dialogs; not caused by `vietqr_code_style`.
- Both projects (desktop and mobile) of the e2e suite should cover the keyboard flow.

## Plan

Order of work: tests first (step 1, run and confirm they fail), then the hook and the two dialogs, then docs.
No new dependency, no new i18n key, no style change.

### Step 1. Failing e2e tests

Both run in the `desktop` and `mobile` projects (no `test.skip` per project).

`e2e/settle-up.spec.ts`, new test `the payment dialog keeps keyboard focus and closes with Escape`. Setup is the
same as the logo fallback test (group, Sam with the fake account `0123456789`, a 100k expense paid by Sam), without
the route. Then:

1. `const pay = page.getByRole('button', { name: t('settle.pay') })`; `await pay.click()`.
2. `const dialog = page.getByRole('dialog')`; expect the **Close** button in it
   (`dialog.getByRole('button', { name: t('common.close') })`) to be focused.
3. Press `Tab` 6 times; after each press expect
   `await dialog.evaluate((d) => d.contains(document.activeElement))` to be `true`.
4. Press `Shift+Tab` 6 times with the same check.
5. Press `Escape`; expect `dialog` to have count 0; expect `pay` to be focused.

`e2e/remove-member.spec.ts`, added to the end of the first test's dialog checks (after the backdrop click that
closes the dialog for Sam), using the existing `removeDialog`:

1. `const removeSam = page.getByRole('button', { name: t('members.removeLabel', { name: 'Sam' }) })`; click it.
2. Press `Tab` 5 times and `Shift+Tab` 5 times; after each press focus stays inside `removeDialog` (same check).
3. Press `Escape`; the dialog has count 0; `removeSam` is focused.
4. Busy rule: `await page.route('**/members/*/remove', () => {})` (never answered), open the dialog again, click
   **Remove**, press `Escape`, expect the dialog still visible. Then `await page.unrouteAll({ behavior:
   'ignoreErrors' })` and close the page state by reloading (`page.reload()`) before the Jamie part. The Jamie part
   reopens its dialog from the members tab, so after the reload click the members tab again.

Run `npx playwright test e2e/settle-up.spec.ts e2e/remove-member.spec.ts` and record that the new checks fail on
the unfixed code (expected: focus not on **Close**, focus leaves the dialog, `Escape` ignored, no focus return).

### Step 2. `src/hooks/useDialog.ts` (new)

```ts
import { useEffect, useRef } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Keyboard behaviour shared by every modal dialog: focus moves to the `data-autofocus` element (or the panel),
 * Tab and Shift+Tab stay inside the panel, Escape closes it (unless `canClose` is false), and focus returns to the
 * opener when it unmounts. Put the returned ref on the `dialog__panel` element and give it `tabIndex={-1}`.
 */
export function useDialog(onClose: () => void, { canClose = true }: { canClose?: boolean } = {}) {
  const panel = useRef<HTMLDivElement>(null);
  // Captured during the first render, while the opener still has focus.
  const opener = useRef<Element | null>(null);
  if (opener.current === null) opener.current = document.activeElement;
  // Latest values, so the listener below is added once and never sees stale props.
  const latest = useRef({ onClose, canClose });
  latest.current = { onClose, canClose };

  useEffect(() => {
    const el = panel.current;
    el?.querySelector<HTMLElement>('[data-autofocus]')?.focus() ?? el?.focus();
    const returnTo = opener.current;

    function onKeyDown(e: KeyboardEvent) {
      if (!el) return;
      if (e.key === 'Escape') {
        if (latest.current.canClose) latest.current.onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) {
        e.preventDefault();
        el.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === el || !el.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !el.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      // The opener can be gone, e.g. the Pay button after the transfer is recorded.
      if (returnTo instanceof HTMLElement && returnTo.isConnected) returnTo.focus();
    };
  }, []);

  return panel;
}
```

Notes for the implementer:

- Initial focus uses a `data-autofocus` attribute, not React `autoFocus`. `src/main.tsx` uses `StrictMode`, so in
  development the effect runs, cleans up (focusing the opener) and runs again. React `autoFocus` only fires once
  at commit, so focus would end on the panel; the effect re-reading `data-autofocus` ends on the right element
  every time.
- The listener is on `document`, not `window`.

### Step 3. `src/components/QrDialog.tsx`

- `import { useDialog } from '../hooks/useDialog';`
- `const panel = useDialog(onClose);` after the existing hooks.
- Panel element: add `ref={panel}` and `tabIndex={-1}`; keep `onClick={(e) => e.stopPropagation()}`.
- **Close** button: add `data-autofocus`. Pressing `Enter` right after the dialog opens must not record a transfer.
- Nothing else changes (backdrop click, `recordSent`, the card).

### Step 4. `src/components/RemoveMemberDialog.tsx`

- Delete the `useEffect` with the `window` `keydown` listener and drop `useEffect` from the React import.
- `const panel = useDialog(onClose, { canClose: !busy });`
- Panel element: add `ref={panel}` and `tabIndex={-1}`.
- Reason field: replace `autoFocus` with `data-autofocus` (the existing `toBeFocused` check must still pass).
- Keep the `pressedOnBackdrop` rule and `disabled={busy}` on both buttons.

### Step 5. Panel focus outline

`.dialog__panel` gets focus only as a fallback and must not show a focus ring for it. In
`src/styles/blocks/_dialog.scss`, inside `&__panel`, add `&:focus { outline: none; }` (the buttons and fields keep
their own focus styles).

### Step 6. Docs

- `docs/design.md`, under `### Interface (SCSS + BEM)`, one bullet: "Modal dialogs use `useDialog`
  (`src/hooks/useDialog.ts`) for focus, `Tab` wrapping, `Escape` and focus return (`dialog_keyboard_focus`)."
- `docs/design.md`, new section `### dialog_keyboard_focus` after `### vietqr_code_style`: "Built." plus the
  keyboard rules, `data-autofocus` instead of `autoFocus` (StrictMode), the initial focus per dialog (payment
  dialog: **Close**; remove member: the reason field) and the busy rule for removal.
- `docs/business-rules.md`: no change; this is interface behaviour, not a business rule.

### Step 7. Checks

In `practice/tally`: `npm run typecheck`, `npm run lint`, `npm test`, then `npm run e2e` (both projects). All must
pass; record the counts under `## Result`.
