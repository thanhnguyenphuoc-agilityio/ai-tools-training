# Deleting an account

| Field | Value |
|---|---|
| ID | `TAL-28` |
| Labels | `type::feature`, `priority::low`, `area::auth` |
| Reporter | Opus (product owner) |
| Assignee | - |
| Depends on | `google_sign_in`, `saved_bank_details` |
| Related | `purge_inactive_groups` |

## Description

Groups are deleted after inactivity, but an account and the bank details saved in it are kept until the person
clears them. A signed-in person should be able to delete their account and everything stored with it.

## Notes from the reporter

- Raised during the capstone intake (`saved_bank_details`, round 2 answer 2).
