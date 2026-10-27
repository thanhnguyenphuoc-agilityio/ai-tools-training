# The settle-up QR code should look like a standard VietQR code

| Field | Value |
|---|---|
| ID | `TAL-41` |
| Labels | `type::improvement`, `priority::low`, `area::settle` |
| Reporter | Product owner (human) |
| Assignee | - |
| Depends on | - |
| Related | - |

## Description

The QR code in the settle-up dialog is a plain black-and-white code. The product owner would like it to look like
the VietQR codes that banks and shops display, so that people recognise it as a bank transfer code before they scan
it.

The reference shared by the product owner shows:

- the VietQR wordmark above the code;
- the code inside a thin rectangular frame;
- a small VietQR mark in the centre of the code.

## Notes from the reporter

- Only the look changes; the payload, the amount and the transfer message stay as they are.
- The code must still scan in the common banking apps.
