# Amount fields accept only digits and K, M, B shorthand

| Field | Value |
|---|---|
| ID | `TAL-65` |
| Labels | `type::improvement`, `priority::medium`, `area::expenses` |
| Reporter | Product owner (human) |
| Assignee | Haiku (developer) |
| Depends on | - |
| Related | - |

## Description

Amount fields in the expense form accept any text and only report an error after it is parsed. The fields should
accept only what an amount can contain while the person types, and show the shorthand letters in upper case.

## Answers

From the product owner (human), given with the request:

1. Applies to the expense amount field and the per-member fields of an exact split.
2. While typing, only digits, the locale's decimal and thousands separators ("." and ","), and the shorthand
   letters k, m and b are kept; any other character (letters, spaces, currency signs) is dropped. Pasted text is
   filtered the same way.
3. The shorthand letters are shown in upper case as soon as they are typed ("150k" shows as "150K").
4. Shorthand: K = thousand, M = million, B = billion, in every locale. The amount limit stays as today, so "1B" is
   the largest B value accepted. The Vietnamese "tr" suffix is no longer offered in the hint or examples, since
   the field cannot type it; the parser may keep accepting it.
5. Parsing rules (`parseAmount`) otherwise stay the same; add unit tests for the filter and for the B suffix, and
   update the amount examples in every locale.

## Acceptance criteria

- `filterAmountInput(input)` in `shared/money.ts` keeps only `0`-`9`, `.`, `,`, and the letters k, m, b in either case;
  it returns k, m and b in upper case. Every other character (spaces, other letters, currency signs, minus) is dropped.
- It does no other validation. "1K5" stays "1K5" and `parseAmount` rejects it.
- The expense amount field and each exact-share field apply the filter on every change, so typed and pasted text are
  filtered the same way. Weight inputs are not filtered.
- Typing "150k" shows "150K"; "1,2tr" shows "1,2"; "150.000 VND" shows "150.000".
- `amountInput.suffixes` in `en.ts` and `vi.ts` include `b: 1_000_000_000`. `vi.ts` keeps `tr` for parsing.
- The amount limit is unchanged: VND "1B" is accepted; VND "1,5B" and "2B" in vi, and USD "1B" in en, return null.
- Both locales show the new examples and placeholder (`expenseForm.amountPlaceholder`, `amountExamples`,
  `amountExamplesDecimal`). No new keys and no new error codes.
- Unit tests for the filter and the B suffix, and e2e coverage of per-keystroke filtering, fill and exact-share fields.
- `docs/business-rules.md` and `docs/design.md` describe the behaviour in the same branch.

## Plan

1. `shared/money.ts`: add the exported pure function `filterAmountInput(input: string): string` with a doc comment. It
   does not change `parseAmount` or `parseMinorUnits`.
2. `src/i18n/locales/en.ts` and `vi.ts`: add `b: 1_000_000_000` to `amountInput.suffixes`. Update the three
   `expenseForm` examples and placeholder texts listed in the ticket. Search both locales for other hint text with
   "tr" or lower-case shorthand and update it the same way. `vi.ts` stays UTF-8 without BOM.
3. `src/components/ExpenseForm.tsx`: wrap the `onChange` value of the amount input and of each exact-share input in
   `filterAmountInput`. The weight inputs are not changed, and no other logic changes.
4. `tests/unit/money.test.ts`: import `filterAmountInput` and add a `describe` block covering the cases in the ticket.
   Add the B-suffix cases for VND and USD, the upper-case K and M cases, and keep the existing `tr` tests.
5. `e2e/language-picker.spec.ts`: change the invalid input from `abc` to `1.5` so the assertion keeps its intent.
   Add `e2e/amount-input-filter.spec.ts` covering `pressSequentially` per keystroke, `fill` of `200k`, and the exact
   share field with `50k` plus the dong sign.
6. `docs/business-rules.md`: rewrite the Vietnamese and English amount examples in the "Amounts" bullets with upper-case
   shorthand, and add the filter bullet. Edit nothing near the exact-share section that TAL-64 changes.
7. `docs/design.md`: change the `amountInput` bullet to the `k`/`m`/`b` suffixes (vi also keeps `tr`). Add the
   `### amount_input_filter (built)` section after `### exact_amount_split` and before `### csv_export`. It covers the
   helper, its use in `ExpenseForm`, the B suffix and its `MAX_AMOUNT` interaction, the tests, and the caret behaviour:
   a controlled input moves the caret to the end when a character is dropped, which is accepted.
8. Tests: `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:hooks`. E2e is run by the batch.
9. Commits: `feat:` (money, locales, form), `test:` (unit and e2e), `docs:` (business rules and design), then the move
   to `waiting-to-merge/` as `docs(tickets)`.

## Merge request

Branch `feat/amount_input_filter` into `develop`. The merge request is opened on GitLab from this branch; its link is
added when it exists. Merge after `create_form_layout` (TAL-64), which edits the same files in other sections.

What changed:

- `shared/money.ts`: `filterAmountInput(input)` (new export). Keeps `0`-`9`, `.`, `,` and k, m, b in either case,
  returns the letters in upper case, and drops every other character. No other validation.
- `src/components/ExpenseForm.tsx`: the amount input and each exact-share input wrap their `onChange` value in
  `filterAmountInput`. The weight inputs are not changed.
- `src/i18n/locales/en.ts`, `vi.ts`: `amountInput.suffixes` gains `b: 1_000_000_000`; `vi.ts` keeps `tr`. The
  placeholder and the two example strings use upper-case shorthand and drop `tr` in vi. No new keys or error codes.
- `tests/unit/money.test.ts`: `filterAmountInput` cases from the ticket, the B suffix for VND in both locales,
  the VND limit for `2B` and `1,5B` in vi, `1B` for USD, and upper-case K and M parsing.
- `e2e/amount-input-filter.spec.ts` (new): per-keystroke `pressSequentially` of `x150k `, `fill` of `1,2tr abc 150k`
  (`1,2B150K`) and `200k` with the hint, and an exact share filled with `50k` plus the dong sign (`50K`).
- `e2e/language-picker.spec.ts`: the invalid input changes from `abc` to `1.5` (`abc` would now become `B`).
- `docs/business-rules.md`: the amount bullets use upper-case examples and a new filter bullet.
- `docs/design.md`: the `amountInput` line, and the new `### amount_input_filter (built)` section after
  `exact_amount_split`. It records the caret behaviour of the controlled input.

How it was tested:

- `npm run typecheck`: exit 0.
- `npm run lint`: exit 0 (oxlint and stylelint).
- `npm run test:hooks`: 32 pass, 0 fail.
- `npm test`: run three times. Runs 1 and 2 each had one or two Miniflare API tests time out at 5000 ms
  (`saved-bank` SB-4 and `transfer-ownership` TO-1, with a "poisoned stub" error). Both files passed alone
  (26/26). Run 3 passed: 55 files, 711 tests. A later run passed again: 55 files, 711 tests.
- Unit tests for `money.test.ts` ran alone before the commit: 109 pass. A later run passed again: 109 tests.
- `npx playwright test` for `exact-split`, `language-picker`, `edit-expense` and `amount-input-filter`: 28 passed
  (desktop and mobile). The invalid-amount case in `language-picker` fills `1.5`.

## Review

Reviewed by Opus (AI team lead).

Findings:

- No blocker or major finding. `filterAmountInput` is a pure regex filter with upper-casing, applied only to the amount
  and exact-share `onChange` handlers; weight inputs and edit-mode prefill are untouched. The `b` suffix stays inside
  `MAX_AMOUNT`: VND `1B` parses, `1,5B` and `2B` return null, USD `1B` returns null. Both locales carry the same keys,
  `vi.ts` keeps `tr` for parsing and has no BOM.
- [nit] A Vietnamese user who types `1,2tr` out of habit now sees `1,2`, which `parseAmount` rejects for VND; the error
  shows the new `1,2M` example. This is the behaviour the ticket asks for.
- [nit] The caret moves to the end when a character is dropped (controlled input). Recorded in `docs/design.md`;
  accepted.

Fixes: none needed.

Checks (feature worktree): `npm run typecheck` clean, `npm run lint` clean, `npm test` 55 files, 711 tests passed. The
full e2e suite runs on `develop` after the batch merge.

## Feedback

From the product owner (human), 2026-10-30: the shorthand letter K, M or B is accepted only once and only at the end of
the amount.

- Fix: `filterAmountInput` keeps at most one shorthand letter, and only after a digit. The first K, M or B ends the
  value, and a letter with no digit before it is dropped. "1K5" becomes "1K", "150KM" becomes "150K", "1.2m3" becomes
  "1.2M", and "k150" becomes "150". This replaces the acceptance criterion that "1K5" stays "1K5".
- Unit cases for the rule are in `tests/unit/money.test.ts`. `e2e/amount-input-filter.spec.ts` now expects `1,2B` for
  the fill `1,2tr abc 150k`.

Confirmed by the human on `develop`, including the one-letter fix from pull request #62. Moved to done on 2026-10-30.
Released in release/2026-10-30.
