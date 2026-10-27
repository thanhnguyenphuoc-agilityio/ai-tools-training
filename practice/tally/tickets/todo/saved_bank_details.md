# Save bank details once

| Field | Value |
|---|---|
| ID | `TAL-15` |
| Labels | `type::feature`, `priority::medium`, `area::auth` |
| Reporter | Product owner (human) |
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

From the product owner (human):

1. Read each time: changing the saved details updates every group that uses them, with nothing to resync.
2. Every group in which a member is linked to the account and has no account entered in the group.
3. The account entered in the group always wins.
4. In those groups, the same people as today: anyone with the group link, because VietQR needs them. They are never
   shown in a group where the person is not a member.
5. Groups that used them show the new details, or none after clearing.
6. No. A removed member shows no bank details, whether entered in the group or saved in the account.

## Clarifying questions (round 2, from the zero-questions test)

1. The member DTO cannot tell group details from saved ones. What does the member's own bank form show, and does
   saving it copy the saved details into the group?
2. How long are saved details kept, given that groups are deleted after inactivity?
3. What does "My bank details" look like, is the account name required, and what does the API answer without a
   session?
4. Is changing saved details a change of the groups that use them?

## Answers (round 2)

From the product owner (human), with the details agreed with the developer:

1. The DTO gains `bankSource: 'group' | 'account' | null`. When the member uses saved details, their bank form in
   the group shows "Using the bank details saved in your account" and a "Use different details in this group"
   action that opens the empty form; saving it creates group details, which then win. Nothing is copied
   otherwise. When the owner edits a member's bank details (API), that creates group details as today.
2. Until the person changes or clears them. Deleting an account is a separate ticket, `delete_account`, added to
   the backlog by this intake.
3. A dialog opened from the account menu, with the same fields and validation as the group form (the account name
   stays optional, as there). `PATCH /api/me` without a session answers `401 SIGN_IN_REQUIRED`.
4. No. Saved details live in the account, so groups are not touched and their deletion dates do not move.

## Answers (round 3)

From the product owner (human), after a second zero-questions test:

1. A member with group details who has saved details in their account sees "Use my saved bank details" on their bank
   form; it clears the group details, so the saved ones apply again.
2. The feature branch moves `bankSource` and these rules into `docs/design.md` and `docs/business-rules.md`.

## Answers (round 4)

From the product owner (human), after the review of the ticket pack against the current `develop`:

1. The member DTO does not say whether the viewer has saved details. The bank form reads it from `GET /api/me`
   (`user` includes the saved details or `null`), so "Use my saved bank details" is offered only when the signed-in
   viewer has some.
2. Saving or clearing the details in the account menu, and switching between group and saved details, show a
   confirmation toast, like other saves (`ui_redesign`).

## Acceptance criteria

- Given a signed-in person, when they save bank details in their account menu, then the details are stored with the
  account and validated like the group form (bank from the VietQR list, account number of 4-19 letters or digits).
- Given a member linked to that account with no account entered in the group, when anyone opens the group, then the
  member shows the saved details and "Pay" builds the VietQR code with them.
- Given the same member with an account entered in the group, then the group account is shown, not the saved one.
- Given saved details that change or are cleared, when the group is opened again, then it shows the new details or
  none.
- Given a member linked to the account who was removed from the group, then no bank details are shown.
- Given a person who is not signed in, then the account menu with saved details is not offered, and
  `PATCH /api/me` answers `401 SIGN_IN_REQUIRED`.
- Given a member using saved details, when they open their bank form in the group, then it says so and offers to use
  different details in this group; nothing is copied until they save that form.
- Given saved details that change, then no group's deletion date moves.
- Given a member with group details who has saved details in their account, when they choose "Use my saved bank
  details", then the group details are cleared and the saved ones apply.

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
| SB-7 | Account menu hidden when signed out; `PATCH /api/me` without a session: `401 SIGN_IN_REQUIRED` | e2e, API |
| SB-8 | `bankSource` is `group`, `account` or `null` as expected | API |
| SB-9 | Own bank form with saved details: note shown, no copy until saved | e2e |
| SB-10 | Changing saved details leaves `last_activity_at` of the groups unchanged | API |
| SB-11 | "Use my saved bank details": offered only with saved details; clears the group details, `bankSource` becomes `account` | API, e2e |
