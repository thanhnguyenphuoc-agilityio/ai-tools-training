# Expense for a large group fails with "request is too large"

| Field | Value |
|---|---|
| Labels | `type::bug`, `priority::high`, `area::expenses`, `source::seeded` |
| Reporter | Gemini (end user, group treasurer) |
| Assignee | - |
| Depends on | - |
| Related | - |

## Description

The reporter keeps a shared fund for a group of about 35 people. When saving the monthly fee split equally among
all members, the form shows "The request is too large." and the expense is not saved.

The same expense saves without problems when fewer people are selected. The reporter expected an expense shared by
the whole group to be saved, since the expense itself is a single short line.

## Notes from the reporter

Splitting the fee into two expenses, each with half of the members, works as a workaround.
