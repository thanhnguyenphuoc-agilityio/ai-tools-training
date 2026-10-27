# Save bank details once

| Field | Value |
|---|---|
| ID | `TAL-15` |
| Labels | `type::feature`, `priority::medium`, `area::auth` |
| Reporter | Opus (product owner) |
| Assignee | - |
| Depends on | `google_sign_in` |
| Related | - |

## Description

People who usually pay upfront enter the same bank, account number and account name in every new group. Bank
details should be stored with the account and reused.

## Analysis

Bank details are per member and per group today (`members.bank_bin`, `account_no`, `account_name`). An account
(`google_sign_in`) can hold one set of details for its owner. The request says "reused" without saying how: copied
into each group once, or shown live from the account. It also does not say which groups, who sees the details, and
what happens when a group already has its own account for that member.

## Clarifying questions

1. Are the details copied into a group when joining, or read from the account each time the group is shown?
2. In which groups do they apply?
3. If a member has entered an account in the group itself, which one is used?
4. Who can see the saved details?
5. What happens when the person changes or clears the saved details?
6. Do the saved details show for a member who was removed from a group?

## Answers

From Opus (product owner):

1. Read each time: changing the saved details updates every group that uses them, with nothing to resync.
2. Every group in which a member is linked to the account and has no account entered in the group.
3. The account entered in the group always wins.
4. In those groups, the same people as today: anyone with the group link, because VietQR needs them. They are never
   shown in a group where the person is not a member.
5. Groups that used them show the new details, or none after clearing.
6. No. A removed member shows no bank details, whether entered in the group or saved in the account.

## Acceptance criteria

- Given a signed-in person, when they save bank details in their account menu, then the details are stored with the
  account and validated like the group form (bank from the VietQR list, account number of 4-19 letters or digits).
- Given a member linked to that account with no account entered in the group, when anyone opens the group, then the
  member shows the saved details and "Pay" builds the VietQR code with them.
- Given the same member with an account entered in the group, then the group account is shown, not the saved one.
- Given saved details that change or are cleared, when the group is opened again, then it shows the new details or
  none.
- Given a member linked to the account who was removed from the group, then no bank details are shown.
- Given a person who is not signed in, then the account menu with saved details is not offered.

## Test matrix (QA)

Drafted by Sonnet (QA tester) from the criteria above.

| ID | Scenario | Level |
|---|---|---|
| SB-1 | Save, then invalid bank or account number: `400` with the usual codes | API |
| SB-2 | Linked member without a group account shows the saved details to a guest | API |
| SB-3 | Group account takes precedence over the saved details | API |
| SB-4 | Change and clear the saved details: two groups follow | API |
| SB-5 | Removed member: no details from either source | API |
| SB-6 | Pay a member through VietQR built from saved details | e2e (dev sign-in) |
| SB-7 | Account menu hidden when signed out | e2e |
