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
- The owner receives a secret **owner key**:
  - The server stores only its SHA-256 hash, never the key.
  - The key is shown **once**, as a recovery link `.../g/<code>#owner=<key>`.
  - The key is after `#`, so browsers do not send it to the server and it does not appear in logs.
  - Opening the recovery link on another device restores owner access.
- The owner can rename the group and change the rounding mode.
- **Currency** is a group setting, independent of the interface language (for example, a trip to Thailand uses THB
  while the interface stays in Vietnamese).
  - When a group is created, the currency field defaults from the interface language (Vietnamese: VND,
    English: USD). The owner can change it. A "new group" form that is already open keeps its currency when the
    interface language changes; a newly opened form takes the default of the current language.
  - Supported: VND, USD, EUR, GBP, AUD, SGD, THB, CNY, JPY, KRW.
  - The currency can be changed only while the group has **no expenses and no transfers**. Deleted expenses count too,
    because they stay in the history with their amounts in the original currency.
- Every change is recorded in `audit_log` and counts as group **activity** (`last_activity_at`).
  A member viewing the group also counts as activity (current behaviour). A guest (not joined) viewing it does not.
  OPEN QUESTION: once inactive groups are deleted, should viewing still count as activity? (`purge_inactive_groups`)

## Members

- A visitor can **join** by entering a name. That device receives a *device token* (HttpOnly cookie).
- A member can **add other people by name** (people who do not use the app). Such a person can later open the link
  and click "I am <name>" to claim the name, if nobody has claimed it yet.
- Names are unique within a group (case-insensitive).
- Each member enters their own **receiving account**: bank (from the VietQR-supported list), account number
  (4-19 letters or digits) and account holder name. The owner can edit it on their behalf (API only in the MVP; the interface is
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
    or named in a new transfer. Their device becomes a guest (view only).
  - An expense that a removed member paid or shared can no longer be deleted (`EXPENSE_HAS_REMOVED_MEMBER`):
    deleting it would give them a balance that nobody could settle.
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

## Interface language

- The interface is available in Vietnamese and English.
- Until a language is chosen, the interface follows the browser languages, then defaults to Vietnamese.
- The language can be chosen in the app from a control in the header, available on every page. The change applies
  at once, without leaving the current page.
- The choice is remembered **on this device only** (in the browser) and is not sent to the server; another device
  keeps its own choice.
- Changing the language does not change any group data, including the currency of an existing group.

## Data and safety

- Only **fake data** is used in development and tests. Fake account numbers: `0123456789`, `9876543210`.
- Owner keys and device tokens are stored only as hashes. Cookies are `HttpOnly` and `SameSite=Lax`, and are sent
  only to the API path of their own group.
- Request bodies are limited to 16 KB.
- The API returns errors with a stable `code`. The interface translates the `code` into the user's language.
- OPEN QUESTION: should attempts at guessing group codes or owner keys be rate-limited? (`group_link_guessing`)
- OPEN QUESTION: anyone with the link can claim an unclaimed name. Is this risk acceptable? (`wrong_name_claim`)

## Interface preferences

- **Theme:** the header offers three choices: same as the device (the default), light and dark. The choice applies
  at once and is remembered on this device (in the browser, not in the group), so it is kept after closing the
  browser and does not affect other members. A stored light or dark choice is applied before the page is drawn,
  so the page does not flash in the other theme on load. Choosing "same as the device" forgets the stored choice.

## Planned (in the backlog)

See `tickets/`. The technical design for each feature is in `docs/design.md`.
When a feature is done, its rules move into the sections above.
