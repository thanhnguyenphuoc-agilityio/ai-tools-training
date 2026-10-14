# Export to a spreadsheet

| Field | Value |
|---|---|
| Labels | `type::feature`, `priority::low`, `area::expenses` |
| Reporter | Gemini (end user, group treasurer) |
| Assignee | - |
| Depends on | - |
| Related | - |

## Description

Treasurers prepare a report at the end of each period. The expenses and transfers of a group should be
downloadable as a file that opens in Excel.

## Analysis

The ticket asks for a download of a group's expenses and transfers as a file that opens in Excel. It does not say
which columns are needed, whether deleted expenses and unconfirmed transfers are included, whether the period can
be filtered, or who may download. First step: build a CSV file in the browser from the loaded `GroupDto`, with a
UTF-8 BOM so that Excel shows Vietnamese text correctly.

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
