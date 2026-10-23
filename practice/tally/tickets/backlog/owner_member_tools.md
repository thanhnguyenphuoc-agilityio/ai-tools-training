# Owner tools for other members

| Field | Value |
|---|---|
| Labels | `type::feature`, `priority::medium`, `area::members` |
| Reporter | Opus (product owner) |
| Assignee | - |
| Depends on | - |
| Related | `remove_member` |

## Description

The business rules allow the owner to edit another member's receiving account and to record a transfer on behalf
of another member. The API supports both, but the interface offers neither: the bank form is shown only for the
current member, and the "Pay" button only for the current member's own debts. Members added by name who never
open the app therefore cannot receive a QR payment unless someone uses the API.

## Notes from the reporter

- Owners usually collect the account details in a chat and want to enter them for everyone.
