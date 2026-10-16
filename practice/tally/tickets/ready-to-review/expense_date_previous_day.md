# New expense shows the previous day's date

| Field | Value |
|---|---|
| Labels | `type::bug`, `priority::medium`, `area::expenses`, `source::seeded` |
| Reporter | Haiku (end user, group member) |
| Assignee | Developer (trainee) |
| Depends on | - |
| Related | - |

## Description

The reporter added a late-night snack to the group at about 1:30 in the morning, in Vietnam. The date field of the
"Add an expense" form was already filled in with the previous day's date, and the expense was saved under that
date because the reporter did not check the field.

The reporter expected the date field to show today's date, as it does when expenses are added during the day.

## Notes from the reporter

It has happened a few times, always after midnight. In the afternoon the date is correct.

## Reproduce

1. Open a group in Chrome and open DevTools (F12).
2. Open the command menu (Ctrl+Shift+P), run "Show Sensors", and set "Location" to a custom location with the
   time zone ID `Asia/Ho_Chi_Minh` (UTC+7). Alternatively, set the operating system time zone to UTC+7.
3. Set the device clock (or the operating system date and time) to between 00:00 and 06:59 local time, for example
   2026-10-14 00:40.
4. Reload the page so that the new time zone applies, then open the "Add an expense" form.
5. Observed: the date field shows `2026-10-13`. Expected: `2026-10-14`, the local date of the device.
6. Repeat with the time zone ID `America/Los_Angeles` (UTC-7) at 2026-10-13 18:00 local time. Observed:
   `2026-10-14`. Expected: `2026-10-13`.

The same steps at midday in either time zone show the correct date. Evidence from the lead: on 2026-10-14 at about
00:40 local time (UTC+7, Windows, Chrome-based browser), the form showed 2026-10-13.

## Analysis

The form takes its default date from `todayLocal()` in `src/dates.ts`, which returns
`new Date().toISOString().slice(0, 10)`. `toISOString()` always formats the instant in UTC, so the result is the UTC
calendar date rather than the device's local date. For a device ahead of UTC the date is one day early between
local midnight and the UTC offset (00:00 to 06:59 in UTC+7), and for a device behind UTC it is one day late in the
evening, which breaks the rule that the date defaults to today in the time zone of the device.

## Plan

- `src/dates.ts`: build the `YYYY-MM-DD` string in `todayLocal()` from the local calendar fields
  (`getFullYear`, `getMonth`, `getDate`), zero-padded. Accept an optional `now: Date` argument (default
  `new Date()`) so a test can pass a fixed date; the call site in `src/components/ExpenseForm.tsx` does not
  change.
- `tests/unit/dates.test.ts` (new): fix the clock with Vitest fake timers (`vi.setSystemTime`) and set
  `process.env.TZ` per test, restoring both afterwards. Cases: 00:40 on 2026-10-14 in `Asia/Ho_Chi_Minh` gives
  `2026-10-14`; 18:00 on 2026-10-13 in `America/Los_Angeles` gives `2026-10-13`; midday in both zones gives the
  local date; single-digit months and days are zero-padded.
- No change to the API, the database or the expense list display: `spentOn` is stored and shown as a calendar date
  without a time zone (the list formats it in UTC from `Date.UTC`, which is consistent).

## Merge request

`fix/expense_date_previous_day` into `develop`: `todayLocal()` now builds the default expense date from the device's
local calendar fields instead of the UTC date, with unit tests that fix the clock and the time zone (UTC+7 just
after midnight, UTC-7 in the evening, and midday). The zone-switching tests rely on the `forks` pool, which is
pinned in `vitest.config.ts`.

The merge request is opened on GitLab from this branch; its link is added when it exists.

## Review

Approved by the AI team lead after one round: typecheck, 107 unit and API tests and 6 e2e tests pass. Review
comments addressed: the forks pool is pinned and the tests assert that the time zone switch took effect.
