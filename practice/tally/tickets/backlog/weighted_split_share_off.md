# Weighted split does not match the expected shares

| Field | Value |
|---|---|
| Labels | `type::bug`, `priority::medium`, `area::expenses`, `source::seeded` |
| Reporter | Gemini (end user, group treasurer) |
| Assignee | - |
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
