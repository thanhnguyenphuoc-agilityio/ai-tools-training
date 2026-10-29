# Destructive confirm button has red text on a green background

| Field | Value |
|---|---|
| ID | `TAL-59` |
| Labels | `type::improvement`, `priority::low`, `area::ui` |
| Reporter | Product owner (human) |
| Assignee | Haiku (developer) |
| Depends on | - |
| Related | `expense_delete_dialog` |

## Description

The confirm button in the delete dialogs (expense, session) shows red text on the green accent background. The
contrast is poor and the button does not read as a destructive action.

## Acceptance criteria

- The confirm button of `ConfirmDialog` is solid red with light text, in light and dark themes.
- The delete-account button uses the same style.
- Colors come only from the theme custom properties; `npm run lint` passes.

## Plan

- `src/styles/blocks/_button.scss`: add `button--danger` on `--color-negative` and `--color-surface`.
- `src/components/ConfirmDialog.tsx`: use `button--danger` instead of `text--negative`.
- `src/components/DeleteAccountDialog.tsx` and `.scss`: use `button--danger`, drop `delete-account__danger-button`.
- `docs/design.md`: note the modifier.

## Review

- Typecheck, lint, unit/API tests and e2e pass. Merged into `develop`.
