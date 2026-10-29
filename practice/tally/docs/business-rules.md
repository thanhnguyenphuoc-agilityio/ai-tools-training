# Business rules: Tally

What the app **must** do, as stated by the customer (the group owner). Code and tests must match this file.
Undecided points are marked **OPEN QUESTION**. They are not to be guessed; they are BA exercises.

## Groups

- Each event (trip, meal, shared-house fund, club...) is **a separate group**.
- A group code has the form `xxxx-xxxx-xxxx`: 12 characters from the 31-character alphabet
  `23456789abcdefghjkmnpqrstuvwxyz` (`0 o 1 l i` are excluded because they are easily confused). Codes are random,
  not guessable and not sequential.
- Anyone with the link `/g/<code>` can **view** the whole group: members, expenses, balances and receiving accounts.
- The creator of a group is its **owner** and also its first member.
- When a group is created without signing in, the owner receives a secret **owner key**:
  - The server stores only its SHA-256 hash, never the key.
  - The key is shown **once**, as a recovery link `.../g/<code>#owner=<key>`.
  - The key is after `#`, so browsers do not send it to the server and it does not appear in logs.
  - Opening the recovery link on another device restores owner access, until the group is tied to an account.
  - Opening the recovery link while signed in attaches the group and the owner member to that account, without a confirmation step, and shows a toast. The owner key is then revoked (`owner_key_hash = 'revoked'`) and the owner cookie on every device stops granting owner access; each device clears it on its next request to the group.
  - An owner who created a group without an account and signs in later on the same device is attached automatically: after sign-in, the interface asks the server to attach each group of the device history that the device holds an owner key for.
  - After attaching, a revoked recovery link answers `403 OWNER_KEY_REVOKED`. A group owned by another account answers `403 GROUP_OWNED_BY_OTHER_ACCOUNT`.
- When a group is created while signed in, it belongs to the account from the start: no owner key is issued (`ownerKey` is null), `owner_key_hash` is set to `'revoked'`, and no recovery link is shown. The page shows "Owner access is tied to your account" instead.
- Owner access of an account-owned group is tied to the account. Migration `0007_owner_key_revoke.sql` revoked the owner key of every group that already had an account owner.
- **Handing over the group** (`transfer_ownership`):
  - Only the **owner** can hand the group over, to an active member who is linked to an account (`OWNER_TRANSFER_NOT_LINKED` otherwise; `OWNER_TRANSFER_SELF` for the current owner; `MEMBER_REMOVED` for a removed member).
  - The new owner does not have to accept. The owner confirms once and the hand-over takes effect at once.
  - The previous owner stays a member with their expenses and history. Their recovery link is revoked, and owner access on their devices ends (their owner key cookies are cleared on the next request).
  - A hand-over of a group that is not kept leaves `last_activity_at` unchanged.
- The owner can rename the group and change the rounding mode.
- **Currency** is a group setting, independent of the interface language (for example, a trip to Thailand uses THB
  while the interface stays in Vietnamese).
  - When a group is created, the currency field defaults from the interface language (Vietnamese: VND,
    English: USD). The owner can change it. A "new group" form that is already open keeps its currency when the
    interface language changes; a newly opened form takes the default of the current language.
  - Supported: VND, USD, EUR, GBP, AUD, SGD, THB, CNY, JPY, KRW.
  - The currency can be changed only while the group has **no expenses and no transfers**. Deleted expenses count too,
    because they stay in the history with their amounts in the original currency.
- **Automatic deletion (`purge_inactive_groups`):**
  - An inactive group is deleted automatically after **10 days** without changes. A daily cleanup job runs at 02:00 Vietnam time (19:00 UTC) and deletes groups whose `last_activity_at` is strictly older than 10 days before the run time. Exactly 10 days is kept.
  - **Changes that count as activity:** adding, editing or deleting an expense, recording or confirming a transfer, adding a member (joining or by name), claiming a name, editing member details, releasing a member, removing a member, linking the group or a member to an account, the automatic link of an invited member (`member_email_invite`), keeping a group or stopping keeping it (`lock_groups`), and saving group settings that differ from the current values.
  - **Changes that count as activity:** attaching a group to an account (`group.link`, from opening a recovery link while signed in, from the attach after sign-in, or from keeping the group) moves `last_activity_at` like "Link to my account" does.
  - **Not changes:** viewing the group (by anyone, members and guests alike), opening an owner recovery link without an account (still recorded in `audit_log` as `owner.claim`), a hand-over of a group that is not kept (`transfer_ownership`, recorded in `audit_log` as `owner.transfer`), saving group settings identical to the current ones, signing in, and saving or clearing bank details in the account (`saved_bank_details`). None of them moves `last_activity_at`. Viewing, saving identical settings, signing in and saving account bank details write nothing. A revoked owner cookie that the server clears on the next request writes nothing either.
  - **Complete deletion:** deletion removes everything of the group: members, bank details, expenses, shares, transfers and the `audit_log`. Open balances do not prevent deletion (privacy comes first).
  - **Deletion date line:** the group page displays the deletion date (`last_activity_at` plus 10 days) in the viewer's language and time zone. During the last 72 hours before deletion, the line is highlighted with warning colors and an extra prompt to make a change to keep the group.
  - **Deleted groups:** opening a link or recovery link to a deleted group returns "group not found", and the group is automatically removed from that device's recent groups list in local storage.
  - **Release migration:** the migration shipping this feature sets `last_activity_at` of every existing group to the migration run time, giving each existing group 10 full days.
  - **Kept groups (`lock_groups`):**
    - The owner, signed in, can keep a group so it is never purged. Up to **10 kept groups** per account (`MAX_LOCKED_GROUPS`).
    - If the group does not belong to an account yet, keeping it attaches the group and the owner member to the owner's account and revokes the owner key, with the same refusals as attaching an owner (`403 GROUP_OWNED_BY_OTHER_ACCOUNT`, `409 ACCOUNT_ALREADY_MEMBER`, `409 MEMBER_LINKED_ELSEWHERE`).
    - Kept groups are exempt from the daily purge (`locked_at IS NULL`).
    - Unlocking restarts the 10 days: `last_activity_at` is set to the unlock time, so the expiry is 10 days after the unlock.
    - Keeping and unlocking are changes audited in `audit_log` as `group.lock` and `group.unlock`.
    - A kept group stays fully editable: expenses, transfers, and members can still be added or changed.
    - Everyone who views the group sees "Kept until the owner stops keeping it" instead of the deletion date line, without warning colors. Members and guests see no keep control.
    - Deleting the owner account (`delete_account`) stops keeping: the group is unlocked, audited as `group.unlock` with details `{"reason":"account.delete"}`, and its 10 days restart from the deletion time.
    - A hand-over (`transfer_ownership`) of a kept group stops keeping it: the group is unlocked, audited as `group.unlock` with details `{"reason":"owner.transfer"}`, and its 10 days restart from the hand-over time. The new owner can keep it again.

## Members

- A visitor can **join** by entering a name. That device receives a _device token_ (HttpOnly cookie).
  A signed-in person sees the account name prefilled in the join field; the field stays editable and joining stays one step (`join_as_account`).
- A member can **add other people by name** (people who do not use the app). Such a person can later open the link
  and click "I am <name>" to claim the name, if nobody has claimed it yet.
- **Claiming a name** (`wrong_name_claim`):
  - Anyone with the link may claim an unclaimed name; no approval step is needed. "I am <name>" first asks for a
    confirmation ("You are about to join as <name>"). Cancel sends nothing; the visitor stays a guest.
  - The claim is audited as `member.claim` with the claimed member as actor (not `anonymous`).
  - **Releasing a name:** the owner may release a claimed member (`POST /groups/:code/members/:id/release`). Not the
    owner's own member, not a removed member, and not a member who is not claimed (`MEMBER_NOT_CLAIMED`). The owner
    gets a confirmation first.
  - A release keeps the member's name, expenses, history and bank details. It clears the device token, the account
    link and the invite email. The device and the account become guests (view only); the group leaves their
    "Your groups" list; the name can be claimed again with "I am <name>".
  - Refusals: `403 OWNER_ONLY` for a member or a guest; `409 CANNOT_RELEASE_OWNER`; `409 MEMBER_REMOVED`; `404
    MEMBER_NOT_FOUND`. A release is recorded as `member.release` with the owner member as actor, and it moves
    `last_activity_at`.
- A device acts as at most one member per group: a device that has already joined gets `ALREADY_MEMBER` when claiming
  or joining again. The rule extends to accounts: one account is at most one member per group; if the account already has
  a member in the group, `ACCOUNT_ALREADY_MEMBER` is returned before `ALREADY_MEMBER`.
- **Invite by email** (`member_email_invite`):
  - A member who adds a person by name (`claim: false`) may give that person an email (`inviteEmail`, optional, at most
    254 characters). Empty means none; anything that is not a single `name@domain`-shaped address gives `400 INVALID_EMAIL`.
    The email is stored trimmed and lowercased.
  - Afterwards only the owner can set or clear it (`PATCH`, `OWNER_ONLY` for others), and only while the member is not
    claimed (`MEMBER_ALREADY_CLAIMED`) and not removed (`MEMBER_REMOVED`). Each change is recorded as `member.update`.
  - The API never returns the email: `MemberDto` carries only `invited` (true for an active, unclaimed member with an
    email). The members list shows an "Invited by email" badge.
  - When a signed-in person opens the group link (`GET /groups/:code`) and their account email equals the invite email
    (ignoring case), has no member in the group and the device is not acting as a member, the oldest matching active,
    unclaimed member is linked to the account and its invite email is cleared. This is recorded as `member.link` and
    moves `last_activity_at`. If nothing matches, or the account already has a member, nothing is written and no error
    is shown. A second GET writes nothing.
  - The invite email is also cleared when the member is claimed, linked through the device account link, or removed.
    Releasing a member clears `invite_email` as well.
- Names are unique within a group (case-insensitive).
- Each member enters their own **receiving account**: bank (from the VietQR-supported list), account number
  (4-19 letters or digits) and account holder name. Receiving account precedence: group account, else saved account
  of the linked member (`saved_bank_details`), never for removed members. The owner can edit it on their behalf (API only in the MVP; the interface is
  `owner_member_tools`). Clearing the account
  number clears all three fields.
- **Removing a member** (`remove_member`):
  - Only the **owner** can remove a member. The owner cannot be removed.
  - A member can be removed only when their balance is **zero** and no transfer to or from them is waiting for
    confirmation. A member who still owes **or is owed** money must settle up first (`MEMBER_HAS_BALANCE`). The app
    never writes off a debt or moves it to someone else.
  - The owner may give a reason (optional, at most 200 characters). It is shown next to the removed member.
  - Removal is soft: the member stays in the history of expenses and transfers with their name, and the name stays
    taken in the group. A removed member cannot be claimed, edited, chosen as payer or participant of a new expense,
    or named in a new transfer. Their device becomes a guest (view only). Their bank details are no longer
    returned by the API (the stored values are kept).
  - An expense that a removed member paid, or in which they owe a share above zero, can no longer be deleted
    (`EXPENSE_HAS_REMOVED_MEMBER`): deleting it would give them a balance that nobody could settle.
  - The removal is recorded in `audit_log`.
- OPEN QUESTION: what is the maximum number of members in a group? (`large_group_expense_rejected`)

## Expenses

- An expense has a payer, an amount, a description, a date and a list of participants.
- **Amounts are integers in the minor unit of the group currency**: dong for VND, cents for USD, yen for JPY.
  Floating-point numbers are not used. The maximum is 1,000,000,000 minor units per expense (`MAX_AMOUNT` in
  `shared/currency.ts`), for example 10,000,000 USD or 1,000,000,000 VND.
- The amount field accepts the input conventions of the interface language:
  - Vietnamese: `150000`, `150.000`, `150k`, `77.5k`, `1,2tr`, `2m`, `150.000` followed by the dong sign. For
    currencies with decimals (USD): `12,50`, `1.250,50`.
  - English: `150000`, `150,000`, `150k`, `1.2m`. For USD: `12.50`, `1,250.50`.
  - For VND, ambiguous values such as `1.5` (without a suffix) are rejected.
- The date is a calendar date chosen by the user (`YYYY-MM-DD`), without a time zone. It defaults to **today in the
  time zone of the device entering the expense**.
- Split modes:
  - **Equal** among the selected participants.
  - **By weight**: each participant has a weight > 0 and <= 100, with at most 2 decimal places (for example 0.8).
  - **Exact shares** (the ticket calls it a split by exact amounts): the total is typed first (as printed on the
    bill), then each participant's share.
    - Each share follows the same input conventions as the amount field (suffixes, separators, currency marks),
      except that zero is allowed. An empty field or a zero in any of those forms (`0`, `0k`, `0 VND`, `0` with the
      dong sign; `0.00` for USD in English) means the participant owes zero; they stay listed in the expense with
      a share of 0.
    - The shares must add up **exactly** to the total. Until they do, the form shows the amount left to assign or
      the excess, and saving is blocked with a message. The app does not assign the difference to anyone.
    - The rounding setting does **not** apply: each share is stored exactly as typed.
    - The API rejects parts that do not add up (`SPLIT_SUM_MISMATCH`) and amounts that are negative, not integers
      or above the maximum (`INVALID_SHARE_AMOUNT`); unknown and duplicate participants are rejected as in the other
      modes.
- Rounding (a group setting, applied to **new** equal and weighted expenses) has two levels, depending on the
  currency:
  - Exact: to the dong or to the cent.
  - Rounded: VND and KRW to 1,000; USD, EUR and similar to 1 major unit; JPY to 100.
- Split rules (must always hold):
  1. The shares add up **exactly** to the amount.
  2. Equal and weighted splits: units are distributed with the **largest remainder** method. Ties go to the
     participant listed first.
  3. Equal and weighted splits: the remainder that cannot be split at the rounding unit (for example 500 dong when
     rounding to 1,000) goes to the **payer** if the payer is a participant, otherwise to the first participant.
  4. Shares are computed **once, when the expense is saved**, and are not recomputed when the rounding setting
     changes.
- Deleting an expense: only its **author** or the **owner**. Deletion is soft (`deleted_at`) and stays in the audit log.
- OPEN QUESTION: who may edit an expense, and is an edit history needed? (`edit_expense`)

## Balances and settling up

- A member's balance = total paid - total owed +/- **confirmed** transfers.
  Positive means they are owed money, negative means they owe. Balances in a group always sum to 0.
- "Simplest way to settle": sort debtors and creditors by amount (largest first, ties by member id), then pair
  them in that order, each transfer settling as much as possible before moving to the next person. The number of transfers
  is at most (number of members - 1). The result must be stable across page loads.
- Payment flow:
  1. The debtor clicks **Pay** on their suggested transfer. The app shows the recipient's **VietQR** code with the amount and message filled in.
  2. The debtor transfers the money in their banking app, then clicks **I have sent it**. The transfer becomes `sent`.
  3. The **recipient** (or the owner) clicks **Confirm received**. The transfer becomes `confirmed`.
- Only `confirmed` transfers change balances. The app does **not** know when money arrives (no bank connection).
- A member can record only **their own** transfers. The owner can record transfers on behalf of others (API only
  in the MVP; the interface is `owner_member_tools`).

## Spreadsheet export

- A member who has joined the group can download **one CSV file** with all of the group's expenses and transfers.
  There is no date range; the whole group is exported and can be filtered in the spreadsheet.
- The download button is shown only to joined members. This is an interface rule, not a security boundary: anyone
  with the link can already view the same data, so the file is built in the browser and there is no server endpoint.
- One row per expense or transfer, in chronological order (date, then the time it was recorded). Columns: type,
  date, description, paid by, received by, amount, currency, status, then one "share" column per member.
  - Expense rows: the date picked for the expense, the payer chosen in "Paid by", and each participant's stored
    share. A member who does not take part has an empty share cell; a share of 0 is written as zero (`0`, or
    `0.00` in a two-digit currency). A share whose member is no longer in the group gets its own numbered column.
  - Transfer rows: the day the transfer was marked as sent (in the time zone of the downloading device), sender and
    receiver, and the status **sent** or **confirmed**. Share cells are empty.
- **Deleted expenses are left out.** Transfers are included whether they are only sent or confirmed.
- Amounts are in **major units** with `.` as the decimal separator and no grouping (`12.50` USD, `300000` VND), with
  the currency code in its own column. They are built from the stored integers, without floating point.
- Headers and the type and status words are in the interface language at the time of the download.
- The file is UTF-8 with a byte order mark (so Excel reads Vietnamese text), comma-separated and quoted per
  RFC 4180. A text cell that starts with `=`, `+`, `-`, `@`, a tab, a carriage return or a line feed gets a leading
  `'`, so a spreadsheet does not run it as a formula.
- The file name is the group name followed by the download date (`<group name>-<YYYY-MM-DD>.csv`). Characters that
  file systems reject, control characters and bidirectional text controls are replaced by `-`, whitespace becomes
  `-`, and the name is capped at 60 characters; if nothing is left, the app title is used. It contains no group
  code and no member data.
- Known limitation: where the system list separator is `;` (common with a decimal comma), Excel does not split the
  columns on double click; the file opens correctly through Data > From Text/CSV.

## VietQR

- Follows the EMVCo/NAPAS 247 standard: GUID `A000000727`, service `QRIBFTTA` (transfer to account number),
  currency `704`, country `VN`, CRC-16/CCITT-FALSE at the end.
- With an amount the QR is dynamic (`01` = `12`); without an amount it is static (`11`).
- VietQR is **only for VND groups**. Groups in other currencies show the account number for manual transfer, without
  a QR code. OPEN QUESTION: currency conversion when paying back a non-VND group (`currency_conversion`).
- The transfer message is stripped of diacritics, upper-cased, limited to `A-Z 0-9` and spaces, and capped at
  50 characters. The screen shows **exactly** the message encoded in the QR.
- The QR code is generated in the browser. Account numbers are never sent to a third-party service.
- The dialog shows the code as a VietQR card: the VietQR wordmark, the code in a thin frame with the recipient's
  bank logo in its centre (the VietQR mark when the logo is missing or fails to load), then the bank name, account
  number and amount. Logos are bundled with the app, so no third party learns the recipient's bank.

## Interface language

- The interface is available in Vietnamese and English.
- Until a language is chosen, the interface follows the browser languages, then defaults to Vietnamese.
- The language can be chosen in the app from a menu in the header, available on every page. The menu shows each
  language with its flag and its name in that language (Vietnamese and English). The change applies at once,
  without leaving the current page.
- The choice is remembered **on this device only** (in the browser) and is not sent to the server; another device
  keeps its own choice.
- Changing the language does not change any group data, including the currency of an existing group.

## Accounts (optional sign-in)

- Signing in is **optional**. Occasional members can view, join and pay without an account.
- What an account restores:
  - An owner who signed in can access and manage their group on another device without the recovery link.
  - A member who signed in can act as their member on another device without claiming the name again.
  - **Groups list (`joined_groups_list`):**
    - A signed-in person sees a list of all groups they joined or own on any device.
    - Groups opened only as a guest do not appear in the list.
    - Groups from which the member was removed or released leave the list.
    - The list is ordered by the latest change in the group (`last_activity_at`, newest first), then by code.
    - On the home page, groups in the account list are omitted from the device history list.
- Creating a group while signed in assigns `owner_user_id` to the account and links the owner's member. Joining or
  claiming a name while signed in links that member to the account (`members.user_id`).
- **Link to my account:**
  - The button is shown only when a member device token is held, the member is not linked to any account, and the
    account is not already another member of the group. It is never shown to an owner: owners attach their group
    automatically (see the owner key bullets above).
  - A member with access from a device token on this device can attach that member to their account.
  - If the member is linked to another account, linking is refused (`409 MEMBER_LINKED_ELSEWHERE`).
  - If the account already has another member in the group, linking is refused (`409 ACCOUNT_ALREADY_MEMBER`).
  - An owner member's device token cannot be linked this way (`403 OWNER_ONLY`): the owner attaches through the owner key.
  - Linking a member is a change of the group (`member.link`); it moves `last_activity_at`.
- **Owner attach:** a signed-in person whose device holds the owner key of a group can attach the group and the owner
  member to the account. The attach answers `attached: false` and writes nothing when the device holds no live key,
  the group belongs to another account, the account already has another member in the group, or the owner member is
  linked to another account. Both the group and the owner member are updated, or neither is.
  - If the account already has another member in the group, linking is refused (`409 ACCOUNT_ALREADY_MEMBER`).
- Stored data: Google account id (`google_sub`), email and display name. The email is stored for identification and
  for email invites (`member_email_invite`), and is **never returned in group data** or shown to other members.
- **Saved bank details (`saved_bank_details`):**
  - A signed-in person can save one set of bank details in their account (`PATCH /api/me`, returning 401
    `SIGN_IN_REQUIRED` without a session).
  - Saved details are read each time a group is viewed: they apply to every group where a member is linked to the
    account and has no account entered in the group.
  - In those groups, anyone with the group link can see them, because VietQR transfers require them. They are never
    shown in a group where the person is not a member.
  - Changing or clearing saved details updates every group that uses them, with nothing to resync and without touching
    groups (not a group change; `last_activity_at` does not move and no audit log row is written).
  - Saved details are kept until changed or cleared. They are also deleted with the account (see "Deleting the account").
- **Account name (`join_as_account`):**
  - A signed-in person can set the account name in the account menu ("My name", `PATCH /api/me` with `name`, returning
    401 `SIGN_IN_REQUIRED` without a session). The name is trimmed and must be 1 to 40 characters: empty or spaces answer
    400 `FIELD_REQUIRED`, more than 40 answer 400 `FIELD_TOO_LONG`.
  - A name set this way is kept at sign-in: a later Google or development sign-in refreshes the email but does not
    overwrite the name (`name_custom = 1`). A name never set this way still follows the name in the sign-in token.
  - Changing the account name is not a group change: members already joined keep their names, and `last_activity_at`
    does not move and no audit log row is written.
  - Bank-only changes to `PATCH /api/me` keep the account name.
- **Sessions:**
  - A session lasts **30 days** (fixed from sign-in time, not extended by use).
  - An expired session no longer identifies the person and its cookie is cleared.
  - Expired sessions are deleted by the daily cleanup job.
- **Signing out:**
  - Ends the account session only. Device tokens and recovery links on that device remain.
- **Deleting the account (`delete_account`):**
  - A signed-in person can delete their account from the account menu ("Delete account", `DELETE /api/me`, returning 401 `SIGN_IN_REQUIRED` without a session).
  - Deletion confirms through a dialog explaining what is deleted and what stays, with no typed confirmation.
  - **Deleted:** the `users` row (Google account id, email, display name, saved bank details) and all sessions across every device. The session cookie is cleared and the interface signs out.
  - **Stays:** groups and everything inside them (members, expenses, transfers, bank details entered in a group, audit log). Group data is purged by the inactivity rule or cleared in the group.
  - **Refused while the account owns a group with other members:** deletion answers `409 ACCOUNT_OWNS_SHARED_GROUP` (with `count`) while the account owns any group that has at least one other active (not removed) member. The owner first hands the group over (`transfer_ownership`) or removes those members. Nothing is deleted when refused.
  - **Solo owned groups:** a group where the owner is the only active member does not block the deletion. It is detached (`owner_user_id` set to NULL), its owner key stays revoked, and it has no owner left. It is deleted by the inactivity rule.
  - **Owned groups:** detached (`owner_user_id` set to NULL). Owner access is tied to the account, so after deletion nobody holds owner access to a detached group. A previous owner who handed a group over (`transfer_ownership`) no longer owns it, so that group does not block their deletion.
  - **Kept groups:** stop being kept. Each kept group owned by the account is unlocked (`locked_at` cleared), audited as `group.unlock` (actor `owner`, details `{"reason":"account.delete"}`), and its `last_activity_at` moves to the deletion time (giving 10 full days).
  - **Linked members:** detached (`members.user_id` set to NULL). The member name, expenses, and history stay; devices with a device token keep acting as that member. Members who used the saved bank details no longer show bank details (`bankSource: null`).
  - **Not a group change:** detaching owners and members is not a change and does not move `last_activity_at` on non-kept groups.
  - **Signing in again:** creates a fresh, empty account with a new id; previous groups are not reattached automatically ("Link to my account" works on devices holding a member device token; an owner's group is not reattached, since its key is revoked).
- **Member removal:**
  - When the owner removes a member, `user_id` is cleared; the account no longer resolves to it and may join the group
    again as a new member.
- **Activity:**
  - Signing in does not move group activity (`last_activity_at`).
  - Linking a group or a member is a change and updates group activity (audited as `group.link` or `member.link`,
    with the linked member as target).
- **Development sign-in:**
  - Developers and automated tests can sign in with an email address without a Google account.
  - It is available only when explicitly enabled for local development (`DEV_LOGIN=true`) and only on `localhost`. On any
    other host or without the flag, the endpoint returns 404.

## Data and safety

- Only **fake data** is used in development and tests. Fake account numbers: `0123456789`, `9876543210`.
- Owner keys, device tokens and session tokens are stored only as hashes. Cookies are `HttpOnly` and `SameSite=Lax`.
  Group cookies are sent only to the API path of their own group; session cookies are sent to `/api` and expire after
  30 days.
- Request bodies are limited to 16 KB.
- The API returns errors with a stable `code`. The interface translates the `code` into the user's language.
- OPEN QUESTION: should attempts at guessing group codes or owner keys be rate-limited? (`group_link_guessing`)

## Interface preferences

- **Theme:** the header offers three choices, shown as icons with their names as tooltips: same as the device (the
  default, a monitor), light (a sun) and dark (a moon). The choice applies
  at once and is remembered on this device (in the browser, not in the group), so it is kept after closing the
  browser and does not affect other members. A stored light or dark choice is applied before the page is drawn,
  so the page does not flash in the other theme on load. Choosing "same as the device" forgets the stored choice.

- **Confirmation messages:** a save that does not visibly change the page (an expense added or deleted, a member
  added, removed or released (a name released), bank details or group settings saved, a transfer recorded or confirmed, a link copied, joining
  the group) shows a short message that disappears after six seconds and can be closed. At most three messages are
  shown at once (two on phones, so they do not cover the middle of the screen). Errors are shown next to the form
  that caused them and stay until the next attempt. Saving group settings that are identical to the stored ones changes
  nothing, so it shows no message.
- **Group summary and deletion date:** above the tabs, the group page shows the total spent, the number of current members and, for
  a member, their own balance ("you are owed", "you owe" or "settled", with the amount). Only confirmed transfers
  count, as in the balances. A visitor who has not joined sees no personal balance. Directly below the summary bar, the deletion date line shows when the group will be deleted if no changes are made, highlighted during the last 72 hours.
- **Phones:** below 768px wide, the group tabs are a bar at the bottom of the screen.

## Planned (in the backlog)

See `tickets/`. The technical design for each feature is in `docs/design.md`.
When a feature is done, its rules move into the sections above.
