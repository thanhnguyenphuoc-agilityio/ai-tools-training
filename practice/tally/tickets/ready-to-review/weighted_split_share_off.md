# Weighted split does not match the expected shares

| Field | Value |
|---|---|
| Labels | `type::bug`, `priority::medium`, `area::expenses`, `source::seeded` |
| Reporter | Gemini (end user, group treasurer) |
| Assignee | Developer (trainee) |
| Depends on | - |
| Related | - |

## Description

The reporter added an expense of 1,000,000 VND in a group with exact rounding, split by weight between
themself (weight 1) and Sam (weight 2.3). The form preview and the saved expense show Sam's share as 696,049 VND
and the reporter's as 303,951 VND.

By hand, Sam's part should be 2.3 / 3.3 of the amount, about 696,970 VND, and the reporter's about 303,030 VND.
The reporter expected the app to match the hand calculation to the dong.

## Notes from the reporter

Weights such as 0.5, 0.8 and 1.5 gave the expected numbers. The difference appeared with other weights the group
uses, for example 2.3 and 1.15.

## Reproduce

Reproduced on `develop` (local dev server) in the interface and through the API.

1. Create a VND group with exact rounding (the "round to 1,000" box unchecked), owner Alex.
2. In "Members", add Sam by name.
3. In "Add an expense": amount `1000000`, paid by Alex, split "By weight", Alex weight `1`, Sam weight `2.3`. Save.
4. Observed: Sam 696,049 and Alex 303,951. Expected: Sam 696,970 and Alex 303,030 (2.3 / 3.3 and 1 / 3.3 of the
   amount, largest remainder to Sam).

Other observations:

- Weight `1.15` gives Sam 532,710 instead of 534,884. Weight `1.5` gives the expected 600,000.
- With rounding to 1,000, weight `2.3` gives Sam 696,000 instead of 697,000, so rounded groups are affected too.
- The saved shares (API `GET /api/groups/<code>`) match the preview, so the error is in the shared split logic,
  not in the display.

## Analysis

The ticket reports wrong weighted shares for some weights. Ambiguity: none about the expected result, since the
business rules define weights in hundredths and the largest remainder method. First step: express the reported
case as a unit test of `splitAmount` in `shared/money.ts`.

Hypothesis, checked in Node: `2.3 * 100` is `229.99999999999997` and `1.15 * 100` is `114.99999999999999`, so
truncating the scaled weight loses one hundredth (229 instead of 230). Weights such as 0.8 and 1.5 scale exactly.

## Merge request

`fix/weighted_split_share_off` -> `develop`: round the scaled weights in `splitAmount` instead of truncating them;
unit test for weights 2.3 and 1.15.

## Review

Approved by the AI team lead after one round: typecheck, 105 unit and API tests and 6 e2e tests pass. Review
comments addressed: a check over every valid weight, and the commit list in the merge request description. A
follow-up (stored weight versus the weight used for the split) is recorded as a separate ticket.
