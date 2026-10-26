# Stored weight can differ from the weight used for the split

| Field | Value |
|---|---|
| ID | `TAL-26` |
| Labels | `type::bug`, `priority::low`, `area::expenses` |
| Reporter | Team lead (code review of `weighted_split_share_off`) |
| Assignee | - |
| Depends on | - |
| Related | `weighted_split_share_off` |

## Description

The API accepts a weight such as `2.299999999999` through the expense endpoint, because the weight check allows a
tiny tolerance around two decimal places. The split then uses 2.30, but the value stored with the share is the
original number, so the stored weight and the weight actually used can differ.

The reviewer expected the stored weight to be the same two-decimal value that the split used.

## Notes from the reporter

Found while reviewing the fix for `weighted_split_share_off`; not seen through the interface, which sends the
typed weight.
