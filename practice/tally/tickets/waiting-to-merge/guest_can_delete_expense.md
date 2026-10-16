# Visitor who has not joined can delete an expense

| Field | Value |
|---|---|
| Labels | `type::bug`, `priority::high`, `area::security`, `source::seeded` |
| Reporter | Sonnet (QA tester) |
| Assignee | Developer (trainee) |
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

## Reproduce

1. In browser window A, create a group (owner Alex) and add an expense. Note the group code and the expense id
   (DevTools, Network, the response of `POST /api/groups/<code>/expenses`).
2. Open a private window B (no cookies for the group). Open the group link without joining. No "Delete" button is
   shown.
3. In window B's console, send `fetch('/api/groups/<code>/expenses/<id>', { method: 'DELETE' })`.

- Observed: `200 {"ok":true}`. The expense is soft-deleted and disappears in both windows; the audit log records
  the actor as `anonymous`.
- Expected: the request is rejected (`401 JOIN_FIRST`, the same answer as for any other write by a guest) and the
  expense stays.
- Reproduced in an API test (Vitest + Miniflare): a `Browser` with no cookies deletes an expense with status 200.

## Analysis

The ticket asks that only the author of an expense or the group owner can delete it, so a guest who has not joined
must be rejected even when calling the API directly. The ambiguous part is the status a guest should get; this fix
uses `401 JOIN_FIRST`, as every other write route does for a caller who is not a member, and keeps
`403 DELETE_NOT_ALLOWED` for a member who is neither the author nor the owner. The first step was an API test with a
cookie-less caller, which showed that the reporter's guess is wrong: no owner cookie is reused (group cookies are
HttpOnly and per browser profile, and the test browser has none); instead `requireCanDeleteExpense` in
`worker/policy.ts` only runs its check when the caller has a member id, so a caller with no identity skips the
check entirely.

## Plan

- `tests/api/money-flow.test.ts`: a `deleting an expense` block with one case each for a guest (expects `401
  JOIN_FIRST` and the expense still listed), a member who is neither author nor owner (`403 DELETE_NOT_ALLOWED`),
  the author (`200`) and the owner (`200`).
- `worker/policy.ts`: `requireCanDeleteExpense` lets the owner through, otherwise requires a member
  (`requireMember`) and then requires that member to be the author. No route, schema or locale change is needed;
  `JOIN_FIRST` is already translated.

## Merge request

Branch `fix/guest_can_delete_expense` into `develop`: `requireCanDeleteExpense` now lets the owner through and
otherwise requires a member who is the author, so a guest gets `401 JOIN_FIRST`. API tests cover the guest, a
member who is neither author nor owner, the author and the owner; the guest test failed before the fix.
