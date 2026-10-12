# Expense list shows the wrong person as the payer

| Field | Value |
|---|---|
| Labels | `type::bug`, `priority::medium`, `area::ui`, `source::seeded` |
| Reporter | Haiku (end user, group member) |
| Assignee | - |
| Depends on | - |
| Related | - |

## Description

Jamie paid for the taxi, but the reporter entered the expense from their own phone and selected Jamie in
"Paid by". In the expense list, the line under the taxi expense says that the reporter paid.

The "Settle up" tab shows Jamie as the person who is owed money, so the reporter is unsure which of the two is
correct. The reporter expected the expense list to show Jamie as the payer.

## Notes from the reporter

Expenses that people entered for themselves look correct.
