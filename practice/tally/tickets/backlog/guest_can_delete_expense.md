# Visitor who has not joined can delete an expense

| Field | Value |
|---|---|
| Labels | `type::bug`, `priority::high`, `area::security`, `source::seeded` |
| Reporter | Sonnet (QA tester) |
| Assignee | - |
| Depends on | - |
| Related | - |

## Description

The tester created a group in a normal browser window and added an expense. In a private window, the tester opened
the group link without joining; as expected, no "Delete" button was shown. The tester then repeated the delete
request copied from the first window's DevTools (Network, Copy as fetch) in the private window's console.
The request succeeded and the expense disappeared from the list in both windows.

The tester expected the request to be rejected, because only the author of an expense or the group owner may
delete it.

## Notes from the reporter

A member who joined in a third window and sent the same request was rejected, as expected. The tester suspects
that the private window somehow reused the owner cookie of the first window.
