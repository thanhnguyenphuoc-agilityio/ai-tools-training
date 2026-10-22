# Export to a spreadsheet

| Field | Value |
|---|---|
| Labels | `type::feature`, `priority::low`, `area::expenses` |
| Reporter | Gemini (end user, group treasurer) |
| Assignee | Developer (trainee) |
| Depends on | - |
| Related | - |

## Description

Treasurers prepare a report at the end of each period. The expenses and transfers of a group should be
downloadable as a file that opens in Excel.

## Analysis

The ticket asks for a download of a group's expenses and transfers as a file that opens in Excel. It does not say
which columns are needed, whether deleted expenses and unconfirmed transfers are included, whether the period can
be filtered, or who may download. First step: build a CSV file in the browser from the loaded `GroupDto`, with a
UTF-8 BOM so that Excel shows Vietnamese text correctly. Text cells that start with `=`, `+`, `-` or `@` must be
escaped so that Excel does not run a description as a formula.

## Clarifying questions

1. Should expenses and transfers be in one file or two?
2. Which columns are needed: date, description, payer, amount, currency, participants, each person's share?
3. Should deleted expenses and transfers that are not yet confirmed be included?
4. Is a date range needed, or is the whole group exported each time?
5. Can any member download the file, or only the owner?

## Answers

From Gemini (reporter):

1. One file is preferred; two files are acceptable.
2. Date, description, payer, amount, currency and each person's share.
3. Deleted expenses are left out. Transfers that are only sent are included and marked as sent.
4. One month is the usual need; exporting the whole group and filtering in Excel is acceptable.
5. Unknown; referred to the product owner.

From Opus (product owner):

5. The download button is shown only to members who have joined. This is an interface rule, not a security
   boundary: anyone with the link can already view the same data, so no server endpoint is needed.

Scope of the first version (product owner): one file for the whole group, without a date range.

## Plan

Scope as agreed: one CSV file for the whole group, no date range, built in the browser from the loaded `GroupDto`.
No API change, no migration, no new permission rule.

File layout (one table, one row per expense or transfer):

| Column | Expense row | Transfer row |
|---|---|---|
| Type | "Expense" | "Transfer" |
| Date | `spentOn` (`YYYY-MM-DD`) | day the transfer was marked as sent, in the device's time zone (`YYYY-MM-DD`) |
| Description | the expense description | empty |
| Paid by | the payer chosen in "Paid by" | the member who sent the money |
| Received by | empty | the member who receives the money |
| Amount | the expense amount | the transfer amount |
| Currency | group currency code (for example `VND`) | group currency code |
| Status | empty | "Sent" or "Confirmed" |
| One "Share: <name>" column per member | that member's stored share; empty when the member is not a participant | empty |

Rules:

- Each person's share is one column per member, in the order of `GroupDto.members`. A share id that matches no
  member (not possible today; possible once `remove_member` exists) gets an extra column named after
  `common.unknownMember`, so the shares of a row always add up to its amount.
- Shares are read from `ExpenseDto.shares` as stored, so the export does not depend on the split mode (equal,
  weight or exact). A share of 0 is written as 0; a member who does not take part has an empty cell.
- Rows are in chronological order: by date, then by creation time, then by id.
- Deleted expenses are left out: `GroupDto.expenses` already excludes them. Transfers are included whether they are
  only sent or confirmed.
- Headers, the type words and the status words come from the locale (`csvExport.*` in `en.ts` and `vi.ts`), in the
  language of the interface at the time of the download.
- Amounts are written in major units with `.` as the decimal separator and no grouping (`12.50`, `300000`), built
  from the integer as a string (no floating-point division), using the currency's `minorDigits`.
- File encoding: UTF-8 with a BOM, CRLF line endings, fields separated by commas and quoted per RFC 4180 when they
  contain a comma, a double quote, CR or LF (quotes doubled).
- Formula guard: a text cell (description, names) that starts with `=`, `+`, `-`, `@`, a tab, a carriage return or
  a line feed gets a leading `'`, so Excel shows it as text instead of running it. Cells formatted by the app
  (dates, amounts, currency codes) are not touched.
- File name: `<group name>-<YYYY-MM-DD>.csv` (date of the download). Characters that are not allowed in file names,
  C0 and C1 control characters and bidirectional text controls (U+202A-U+202E, U+2066-U+2069) are replaced with
  `-`, whitespace becomes `-`, and the name is capped at 60 characters; if nothing is left, the app title is used.
  The group code, member names and account numbers are not in the file name.
- The "Download CSV" button sits in the group header next to "Copy invite link" and is shown only when
  `me.memberId` is set (joined members). This is an interface rule; the data is already visible to anyone with the
  link, so there is no server endpoint and no rule in `policy.ts`.

Files:

- `shared/money.ts`: `toDecimalString(amount, currency)` (integer minor units to a plain decimal string).
- `src/csv.ts`: generic CSV text (cell quoting, BOM, CRLF, formula guard). Pure, runs in Node.
- `src/groupCsv.ts`: `buildGroupCsv(group, t)` and `csvFileName(groupName, today, fallback)`. Pure, runs in Node.
- `src/download.ts`: the small DOM part (Blob, object URL, temporary link).
- `src/pages/GroupPage.tsx`: the button. Existing `button` modifiers are enough; no new SCSS block.
- `src/i18n/locales/en.ts`, `src/i18n/locales/vi.ts`: `csvExport.*` keys.

Tests:

- `tests/unit/money.test.ts`: `toDecimalString` for zero-digit and two-digit currencies, negatives, non-integers.
- `tests/unit/csv.test.ts`: quoting, formula guard, BOM and CRLF.
- `tests/unit/groupCsv.test.ts`: columns, order, shares in every split mode, missing members, locale text, file
  names.
- `e2e/csv-export.spec.ts`: a joined member downloads the file (Playwright download event); a guest does not see the
  button.

Docs: `docs/business-rules.md` (export rules), `docs/design.md` (`csv_export` built), README "Not in the MVP".

Known limitation: Excel opens a comma-separated file by double click only when the system list separator is a
comma. Where the regional settings use `;` (common with a decimal comma), the file is still readable through
Data > From Text/CSV. A `sep=,` first line would fix the split but makes Excel ignore the BOM, which breaks
Vietnamese text, so it is not used.
