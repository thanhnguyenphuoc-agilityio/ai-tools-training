# Expense for a large group fails with "request is too large"

| Field | Value |
|---|---|
| Labels | `type::bug`, `priority::high`, `area::expenses`, `source::seeded` |
| Reporter | Gemini (end user, group treasurer) |
| Assignee | Developer (trainee) |
| Depends on | - |
| Related | - |

## Description

The reporter keeps a shared fund for a group of about 35 people. When saving the monthly fee split equally among
all members, the form shows "The request is too large." and the expense is not saved.

The same expense saves without problems when fewer people are selected. The reporter expected an expense shared by
the whole group to be saved, since the expense itself is a single short line.

## Notes from the reporter

Splitting the fee into two expenses, each with half of the members, works as a workaround.

## Reproduce

1. Run `npm run dev` and open http://localhost:5173.
2. Create a group "Club fund" in VND with the owner name "Alex".
3. On the group page, add 34 more members by name ("Member 01" to "Member 34"), so the group has 35 members.
4. In the expense form, enter the amount `3500000`, the description "Monthly fee", keep the split mode "equal" and
   keep all 35 members selected. Save.

- Observed: the form shows "The request is too large." and no expense is added. The API answers `413` with the code
  `BODY_TOO_LARGE`. With 30 members selected the same expense saves.
- Expected: the expense is saved with 35 equal shares. A 35-person expense request is about 2.3 KB of JSON
  (about 63 bytes per participant), well below the 16 KB request body limit in `docs/business-rules.md`.

## Analysis

The ticket asks that an expense shared by a large group (about 35 members) is accepted instead of being rejected as
too large. It is ambiguous whether the request is too big for the documented 16 KB limit or the configured limit
does not match that rule, and the rules do not state a maximum number of members per group. The first step is to
measure a realistic 35-person request and compare it with the limit configured in `worker/app.ts`.

Findings: a 35-person request is 2,360 bytes, but `MAX_BODY_BYTES` in `worker/app.ts` is 2 KB (2,048 bytes)
instead of the 16 KB the business rules require. Requests above 2 KB start at about 31 participants.

## Clarifying questions

- For the product owner: with the 16 KB limit, an equal split fits about 257 participants (measured with the
  description "Monthly fee"). What is the maximum number of members in a group, and should groups larger than
  that be supported? This does not change the current rule and is not part of this fix. It is recorded as an
  OPEN QUESTION in the "Members" section of `docs/business-rules.md`.

## Plan

- `worker/app.ts`: set `MAX_BODY_BYTES` to 16 KB, as stated in `docs/business-rules.md` ("Data and safety").
- `tests/api/money-flow.test.ts`: add an API test that creates a group with 35 members and saves one expense split
  equally among all of them (expects `201` and 35 shares), and a test that a body of exactly 16 KB passes the
  limit while one byte more is rejected with `413` and `BODY_TOO_LARGE`.
- `docs/business-rules.md`: the 16 KB rule stays the same; only an OPEN QUESTION about the maximum group size is
  added. No change to `docs/design.md`.

## Merge request

`fix/large_group_expense_rejected` into `develop`: sets `MAX_BODY_BYTES` in `worker/app.ts` from 2 KB to the 16 KB
required by the business rules, with an API test that saves an expense shared by 35 members. The question about a
maximum group size remains open for the product owner.
