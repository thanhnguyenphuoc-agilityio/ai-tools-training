# Save buttons stretch across the whole card on phones

| Field | Value |
|---|---|
| ID | `TAL-56` |
| Labels | `type::improvement`, `priority::low`, `area::ui` |
| Reporter | Product owner (human) |
| Assignee | Haiku (developer) |
| Depends on | - |
| Related | `ui_redesign` |

## Description

The Save button in the group settings is as wide as the card on a phone, while other buttons in the app keep the
width of their label. Buttons should look the same across the app.

## Analysis

`button--block-mobile` (`src/styles/blocks/_button.scss`) sets `width: 100%` below `sm`. It is used only on:

- `MembersPanel.tsx`: Save in the group settings and in the bank details form.
- `ExpenseForm.tsx`: Add expense (not when editing).
- `HomePage.tsx`: Create group.

Every other action uses `button` in a `cluster`.

The group-settings Save and the Create group button are direct children of a form with class `stack`. `.stack` is a
flex column with the default `align-items: stretch`, so a direct child button stretches at every width. The
`width: auto` set from `sm` up does not prevent that. Those two buttons need a `cluster` wrapper. The bank-details
Save and the Add expense button already sit in a `cluster`.

## Acceptance criteria

- At 375 px, the group-settings Save, bank-details Save, Add expense and Create group buttons are as wide as their
  label, like other buttons.
- The layout at `sm` and up does not change.
- The `button--block-mobile` modifier no longer exists.
- `npm run lint` passes.

## Plan

1. `MembersPanel.tsx`: drop `button--block-mobile` from the bank-details Save (already inside `div.cluster`). Wrap
   the group-settings Save in `<div className="cluster">` and use `className="button"`.
2. `ExpenseForm.tsx`: the submit button (already in a `cluster`) uses `className="button"`. Only that class name
   changes; the session select from `expense_session_link` stays untouched.
3. `HomePage.tsx`: wrap the Create group button in `<div className="cluster">` with `className="button"` and
   `disabled={busy}` kept.
4. `src/styles/blocks/_button.scss`: delete the `&--block-mobile` block and its comment. Grep confirms no remaining
   usage.
5. Tests: no new unit test. One assertion in `e2e/ui-redesign.spec.ts` at a 390 px viewport: the Create group
   button's bounding box is narrower than its form. `npm run lint`, typecheck, `npm test`, and e2e for
   `ui-redesign`, `account`, `edit-expense` and `settle-up`.
6. `docs/design.md` section 5 Interface: buttons keep the width of their label at every size; a lone button in a
   `stack` sits in a `cluster` so it does not stretch. `button--block-mobile` was removed in
   `full_width_save_buttons`. No change to `docs/business-rules.md`.
