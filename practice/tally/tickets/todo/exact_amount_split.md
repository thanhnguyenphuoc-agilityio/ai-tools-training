# Split by exact amounts

| Field | Value |
|---|---|
| Labels | `type::feature`, `priority::low`, `area::expenses` |
| Reporter | Haiku (end user, group member) |
| Assignee | - |
| Depends on | - |
| Related | - |

## Description

At restaurants each person orders their own dish. An equal split is unfair to people who spent less, and weights
are hard to work out. The expense form should accept the exact amount each person owes.

## Analysis

The ticket asks for a third split mode in which the person entering the expense types each participant's amount.
It does not say what happens when the parts do not add up to the total, whether the total is typed first or
computed from the parts, or how the rounding setting applies. First step: add `splitExact(amount, parts)` to
`shared/money.ts` with unit tests that reject parts whose sum differs from the amount.

## Clarifying questions

1. Is the total typed first, or should it be the sum of the individual amounts?
2. If the parts do not add up to the total, should saving be blocked, or should the difference go to the payer?
3. Does the group rounding setting apply to the typed amounts?
4. Can a participant have an amount of zero?

## Answers

From Haiku (reporter):

1. The total is typed first (it is printed on the bill), then each person's amount.
2. Saving is blocked, with a message, until the parts add up to the total. The app does not guess.
3. Unknown; referred to the product owner.
4. Yes. A participant can owe zero and still be listed in the expense.

From Opus (product owner):

3. No. Typed amounts are stored exactly as entered; the rounding setting does not apply. Saving is blocked unless
   the parts add up exactly to the total.
