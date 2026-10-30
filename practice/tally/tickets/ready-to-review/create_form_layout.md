# Group related fields in the create group form

| Field | Value |
|---|---|
| ID | `TAL-64` |
| Labels | `type::improvement`, `priority::medium`, `area::ui` |
| Reporter | Product owner (human) |
| Assignee | Haiku (developer) |
| Depends on | `create_group_account_name` |
| Related | - |

## Description

The create group form places the "Use a different name" checkbox under the name field in one column, next to the
currency select, while the rounding checkbox sits alone below both columns. Fields that belong together are
apart, and the layout looks uneven.

## Answers

From the product owner (human), given with the request:

1. The form has two groups. "Your name" holds the name field, its hint and the "Use a different name" checkbox.
   "Currency" holds the currency select and the "Round shares to ..." checkbox.
2. Each group reads as one block (for example a fieldset with its label, or a bordered box), with the checkbox
   directly under its field.
3. Mobile first: the two groups stack on phones and sit side by side from `md` up, with their tops aligned.
4. Labels, behaviour and validation do not change; only the layout. Styles follow the BEM and theme rules, and the
   existing create form e2e tests keep passing.

## Acceptance criteria

- The create form shows two groups: "Your name" (name field, hint, "Use a different name" checkbox) and "Currency"
  (currency select, rounding checkbox). Each group has a border from the existing `.fieldset` block.
- Each group is a `div.fieldset.home-page__group` inside `div.home-page__groups`. The existing labels keep wrapping their
  inputs, so `getByLabel` finds the same elements as before.
- On phones (below `md`) the two groups stack, one per row, with the 16px gutter kept.
- From `md` (768px) the groups sit side by side with their tops aligned, and each keeps its own height.
- The rounding checkbox renders only when `coarseUnit > 1`, as before, and now sits inside the "Currency" group.
- No state, handler, prop, attribute, id, aria attribute or i18n key changes. No new UI text.
- Signed-in and signed-out name field behaviour is unchanged.
- The existing e2e specs pass without edits. `e2e/create-form-layout.spec.ts` covers the layout at 1280x900 and 375x800
  and checks that a group is still created.
- `docs/business-rules.md` and `docs/design.md` describe the layout in the same branch.

## Plan

1. `src/pages/HomePage.tsx`: replace the `div.columns` wrapper of the create form with `div.home-page__groups`.
2. First group: `div` with classes `fieldset stack stack--tight home-page__group`. It holds, unchanged, the name
   `label.field`, the optional `p#owner-name-hint.field__hint` and the optional "Use a different name" checkbox label.
3. Second group: same classes. It holds the currency `label.field`, then the rounding checkbox label moved in from below
   the columns, keeping the `coarseUnit > 1` condition.
4. Remove the old standalone rounding checkbox below the columns.
5. Do not change state, handlers, effects, props, attributes, ids, aria attributes or i18n keys. Add no UI text. Do not
   use a real `fieldset` with a `legend`: a legend does not label an input, so the existing labels stay as they are and
   the visible label of each field serves as the group heading.
6. `src/pages/HomePage.scss`, inside `.home-page`, mobile first:
   - `&__groups`: `display: grid` and `gap: space(3)`.
   - `@include up(md)`: `grid-template-columns: repeat(2, minmax(0, 1fr))` and `align-items: start`, so the group tops
     align and each box keeps its own height.
   - `&__group`: `margin: 0` and `min-width: 0`, so a long currency name does not overflow the box.
   - No colours: the border, radius and padding come from `.fieldset` and its theme custom properties. Add a one-line
     comment in the existing style.
7. The `lg` layout needs no rule: from `lg` the create card is 3fr of the 3fr/2fr grid, which is wide enough for two
   groups.
8. `e2e/create-form-layout.spec.ts` (new), using `t` from `e2e/i18n.ts` and synthetic names. Signed out, no account:
   - (a) viewport 1280x900 on `/`: `.home-page__group` nth(1) contains the currency select and a checkbox; the bounding-box
     tops of the two `.home-page__group` elements are equal within 1px.
   - (b) viewport 375x800 on `/`: the second group's top is at or below the first group's bottom.
   - (c) fill the group name and `t('home.create.yourName')` with `Alex`, submit, and expect a `/g/` URL.
   The rounding checkbox is located inside the group with `getByRole('checkbox')`. The existing specs that use these
   labels are not edited.
9. Tests: no unit test (layout only). Run `npm run typecheck`, `npm run lint`, `npm test` and `npm run test:hooks`. The
   e2e run is left to the batch.
10. Docs in the same branch: one bullet under "Accounts (optional sign-in)" in `docs/business-rules.md` and a section
    `### create_form_layout (built)` in `docs/design.md` placed after `### create_group_account_name (built)`.
11. Ticket: the next free ID in `tickets/README.md` becomes `TAL-66`, since this batch adds TAL-64 and TAL-65.

## Merge request

Branch `feat/create_form_layout` into `develop`. Depends on `create_group_account_name`, already on `develop`. It shares
the same three docs and the ticket README with `amount_input_filter` (TAL-65) in different sections; merge this first.

What changed:

- `src/pages/HomePage.tsx`: the `div.columns` wrapper is replaced by `div.home-page__groups`. The first group is
  `div.fieldset.stack.stack--tight.home-page__group` ("Your name": name field, hint, "Use a different name"). The second
  is the same classes ("Currency": currency select, rounding checkbox when `coarseUnit > 1`, moved in from below the
  columns). Labels, state, handlers and i18n keys are unchanged.
- `src/pages/HomePage.scss`: `&__groups` grid with `gap: space(3)`; `@include up(md)` sets two equal columns and
  `align-items: start`; `&__group` sets `margin: 0` and `min-width: 0`. No colours.
- `e2e/create-form-layout.spec.ts` (new): (a) 1280x900 group tops equal within 1px and the currency group holds the select
  and a checkbox; (b) 375x800 the currency group starts below the name group; (c) the form still creates a group. The
  describe skips the mobile project (Pixel 7 is 412px, below `md`), because the viewport is set inside the test.
- `docs/business-rules.md`: one bullet under "Accounts (optional sign-in)". `docs/design.md`: section
  `create_form_layout (built)` after `create_group_account_name (built)`.
- `tickets/README.md`: next free ID `TAL-66` (this batch adds TAL-64 and TAL-65).
- Formatting: Prettier reflowed one unrelated line in `HomePage.tsx` (the recent-groups `<span>` pair), which already failed
  Prettier on `develop`. No behaviour change.

Commands and results (feature worktree):

- `npm run typecheck`: clean.
- `npm run lint`: clean.
- `npm test`: 55 files, 695 tests passed on the second run. The first run had two Miniflare API timeouts (`member-invite`
  MEI-7 and `saved-bank` SB-4) and one `ECONNRESET`; both are the known flake, and neither touches the create form.
- `npm run test:hooks`: 32 pass, 0 fail.
- `npm run e2e`: not run in the worktree, as planned. The batch runs `e2e/create-form-layout.spec.ts` and
  `e2e/create-group-account-name.spec.ts`, plus the existing create-form specs that must pass unchanged.

## Review

Reviewed by Opus (AI team lead).

Findings:

- No blocker or major finding. The markup matches the plan: two `div.fieldset.stack.stack--tight.home-page__group`
  boxes inside `div.home-page__groups`, the labels still wrap their inputs, and the rounding checkbox keeps its
  `coarseUnit > 1` condition inside the "Currency" group. No state, handler, id or i18n key changed.
- [nit] `src/pages/HomePage.tsx`: Prettier reflowed one unrelated line (the recent-groups `<span>` pair). No behaviour
  change; accepted because the line already failed Prettier on `develop`.
- [nit] `e2e/create-form-layout.spec.ts` runs only in the desktop project, since the 1280 viewport check cannot pass on a
  412px device profile and the phone case sets its own viewport. Accepted.

Fixes: none needed.

Checks (feature worktree): `npm run typecheck` clean, `npm run lint` clean, `npm test` 55 files, 695 tests passed. The
full e2e suite runs on `develop` after the batch merge.

Batch review (Opus, AI team lead): on `develop` the full e2e run stopped at collection, because the `beforeEach` in
`e2e/create-form-layout.spec.ts` took `_fixtures` as its first argument and Playwright requires object destructuring
there. Fixed on `fix/batch-review-2026-10-30` with `test.info().project.name`, as in `join-as-account.spec.ts`. The full
e2e suite then passed: 173 passed, 5 skipped.
