# Agreed VND rate for paying back a foreign-currency group

| Field | Value |
|---|---|
| ID | `TAL-50` |
| Labels | `type::feature`, `priority::medium`, `area::settle` |
| Reporter | Product owner (human) |
| Assignee | - |
| Depends on | - |
| Related | `currency_conversion` |

## Description

A group in a currency other than VND (for example THB for a trip abroad) is paid back by bank transfer in VND.
The owner should be able to set one agreed rate (VND per 1 unit of the group currency) in the group settings.
The pay screen then shows the amount in the group currency, the agreed rate, the amount in VND and a VietQR code
for the VND amount. Balances and recorded transfers stay in the group currency.

## Notes from the reporter

- No live exchange rates; the group agrees on the rate.
- The rate has decimals and must be exact: stored as an integer scaled by 10,000, converted with integer arithmetic
  and rounded half up to whole dong (see `currency_conversion` and docs/design.md).
- Without a rate the screen behaves as today. A changed rate affects only codes shown afterwards.
- A new numbered migration adds the rate column to `groups`.
- Each change is audited as `group.update` with details (the values before and after).
- The rate setting is shown only for non-VND groups. CSV export and balances stay in the group currency.
