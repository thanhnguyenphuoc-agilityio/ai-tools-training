# Exact share fields hide the member names

| Field | Value |
|---|---|
| ID | `TAL-25` |
| Labels | `type::bug`, `priority::high`, `area::ui` |
| Reporter | Opus (AI team lead, screenshots for the `exact_amount_split` merge request) |
| Assignee | Haiku (developer) |
| Depends on | - |
| Related | `exact_amount_split` |

## Description

With "Exact shares" selected in the expense form, each share field covers the name of the person it belongs to. On
a desktop only the first letters of each name are visible; on a phone the names and the checkboxes are hidden
completely, so it is not clear whose share is being typed.

## Reproduce

1. Open a group with several members and choose "Exact shares" in the expense form.
2. Desktop (1280 px wide): the names read "Al", "Sa", "Ja"...; phone (375 px): no names, and the share fields lie
   over the checkboxes.
3. In the browser, the grid of a participant row computes to `0px 164.667px 104px` on a phone: the name column has
   no width, and the share field is as wide as its column.

## Analysis

`.expense-form__share-input` sets a width of 6.5rem (8rem from `sm` up), but `.field__control` sets `width: 100%`.
Both selectors have the same specificity, and the stylesheet of the `field` block is loaded after the one of
`ExpenseForm`, so `width: 100%` wins. The weight field is not affected because its `field__control--narrow`
modifier is defined in the same file as `field__control`, after it.

The same order also hides the red border of an invalid share: the `border` shorthand of `field__control` resets the
`border-color` set by `expense-form__share-input--invalid`.

The e2e test of `exact_amount_split` finds the fields by their accessible labels, which stay correct, so it passed.

## Plan

- Branch `fix/exact_split_share_layout`.
- An e2e assertion that the text of every name ends before its share field begins (desktop and mobile projects);
  it fails on `develop`.
- Scope the share field width to the participant row so that it no longer depends on the order of the stylesheets.

## Merge request

The merge request is opened on GitLab from this branch; its link is added when it exists.

- Source branch: `fix/exact_split_share_layout`. Target branch: `develop`.
- Changes: the share field width in `src/components/ExpenseForm.scss` is scoped to the participant row, so it no
  longer loses to `field__control` (`width: 100%`); `e2e/exact-split.spec.ts` checks that every name ends before
  its share field.
- The new assertion fails on `develop` (overlap of 19-28 px on desktop and 50-60 px on a phone) and passes with the
  fix. Typecheck, 220 unit and API tests and all 22 e2e tests pass.
- Side effect: the red border of an invalid share field shows again; it was hidden on `develop` for the same reason.
- `docs/design.md` (Interface) explains the stylesheet order and how a component overrides a block property.
- Not in scope: a long name without spaces can still run under the share field on a phone (also in weight mode,
  before this change).

## Review

Approved by the AI team lead after one round: typecheck, 220 unit and API tests and 22 e2e tests pass. Review
comments addressed: the assertion measures only rows with a share field and requires all three, the invalid border
side effect is recorded, and `docs/design.md` explains the stylesheet order.

Follow-up after the merge: a lead check at phone width still showed a clipped name ("Morgan") because the name
column kept only about 60 px next to the field and the amount. In exact mode on phones the name now has its own
line, with the share field and the amount below it; from `sm` up the row stays on one line. The e2e check adds a
longer name (Christopher, which overlapped by 6 px) and now measures whether the name and the field intersect.

Released on 2026-10-23.
