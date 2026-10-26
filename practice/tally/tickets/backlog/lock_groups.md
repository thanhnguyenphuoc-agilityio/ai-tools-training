# Keep selected groups

| Field | Value |
|---|---|
| ID | `TAL-10` |
| Labels | `type::feature`, `priority::low`, `area::data` |
| Reporter | Opus (product owner) |
| Assignee | - |
| Depends on | `google_sign_in`, `purge_inactive_groups` |
| Related | - |

## Description

If inactive groups are deleted automatically, long-running groups such as a year-long shared fund must be kept.
The owner should be able to lock a group so it is never deleted.

## Notes from the reporter

- A limit of about 10 locked groups per owner is acceptable, so that not every group gets locked.
