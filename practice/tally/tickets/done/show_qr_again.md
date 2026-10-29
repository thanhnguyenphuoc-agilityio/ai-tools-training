# Show the payment QR again after marking a transfer as sent

| Field | Value |
|---|---|
| ID | `TAL-58` |
| Labels | `type::improvement`, `priority::medium`, `area::ui` |
| Reporter | Product owner (human) |
| Assignee | Haiku (developer) |
| Depends on | - |
| Related | `duplicate_sent_transfers`, `vietqr_payment` |

## Description

A payer sometimes presses "I have sent it" before scanning the QR. The suggestion then shows "Waiting for ... to
confirm" and the QR can no longer be opened, so the payer cannot finish the bank transfer from the app.

## Acceptance criteria

- On a suggestion waiting for confirmation, the payer sees "Show QR again".
- It opens the payment dialog with the receiver's account, the QR and the amount marked as sent.
- The reopened dialog has no button to record the transfer; Close and Escape close it.
- Other members and the owner (on someone else's debt) do not see the button.

## Plan

- `src/components/QrDialog.tsx`: optional `viewOnly` prop that hides the record button; `onRecorded` optional.
- `src/components/SettlePanel.tsx`: "Show QR again" on a waiting suggestion of the current member, with the amount of
  the pending transfer.
- `src/i18n/locales/*.ts`: `settle.showQrAgain`.
- `e2e/settle-up.spec.ts`: reopen the QR after marking as sent; no record button.
- `docs/business-rules.md`, `docs/design.md`.

## Review

- Typecheck, lint, unit/API tests and e2e pass. Merged into `develop`.

Confirmed by the human on local `develop`. Released in release/2026-10-29.
