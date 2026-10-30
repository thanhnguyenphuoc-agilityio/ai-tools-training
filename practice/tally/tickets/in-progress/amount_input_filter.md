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
</content>
</invoke>

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
