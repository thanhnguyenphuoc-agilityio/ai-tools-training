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

## Merge request

- Branch: `feat/full_width_save_buttons` into `develop`.
- Summary of changes:
  - `button--block-mobile` is removed from `src/styles/blocks/_button.scss` and from the four buttons that used it.
  - The Create group button (`HomePage.tsx`) and the group-settings Save (`MembersPanel.tsx`) are wrapped in a
    `cluster`, because their form is a `stack` (a flex column) and would stretch a direct child at every width. The
    bank-details Save and the Add expense button already sit in a `cluster` and only lose the modifier.
  - `e2e/ui-redesign.spec.ts` checks at a 390 px viewport that the Create group button is narrower than its form.
  - `docs/design.md` section 5 Interface notes that buttons keep the width of their label at every size. No change to
    `docs/business-rules.md`.
- Screenshots at 375 px, light and dark, of the home page, the expense form and the members tab (bank form and group
  settings) are attached to the merge request.
- Commands run and results (port 5193 for Playwright):
  - `npm run typecheck`: clean.
  - `npm run lint`: clean.
  - `npm test`: 50 files, 614 tests passed.
  - `npm run test:hooks`: 29 of 29 passed.
  - `npx playwright test --config playwright.local.config.ts`: 149 passed, 2 skipped, 3 failed. The 3 failures
    (`account.spec.ts` GS-2, `join-as-account.spec.ts` My name, `attendance.spec.ts` midnight session) were test
    timeouts and a group that never opened; all three specs passed on one rerun (21 passed). The new width assertion
    passed on both projects in the full run.

## Review

Reviewed by Opus (AI team lead).

Findings:

- Checked against the plan and the Acceptance criteria. `button--block-mobile` is gone from `_button.scss` and from
  all four buttons; no usage remains in `src`, `e2e`, `tests` or `scripts`. Create group and the group-settings Save
  are direct children of a `stack` form, so they are wrapped in a `cluster` as planned; the bank Save and Add expense
  were already in one. Layout from `sm` up is unchanged.
- The new e2e assertion (Create group narrower than its form at 390 px) fails with the old full-width modifier and
  passes now, on desktop and mobile projects.
- The Add member button stays full width; it never used the modifier and is out of scope.
- No blocking findings, no fixes needed.

Verdict: approve. Commit authors and dates checked.

Checks: `npm run typecheck` and `npm run lint` passed, `npm test` 50 files / 614 passed, `npm run test:hooks` 29
passed, e2e `ui-redesign`, `account`, `edit-expense` and `settle-up` (port 5193) 46 passed. Typecheck and `npm test`
rerun on `develop` after the merge.

Confirmed by the human on local `develop`. Released in release/2026-10-29.
