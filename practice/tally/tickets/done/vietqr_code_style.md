# The settle-up QR code should look like a standard VietQR code

| Field | Value |
|---|---|
| ID | `TAL-41` |
| Labels | `type::improvement`, `priority::low`, `area::settle` |
| Reporter | Product owner (human) |
| Assignee | Haiku (developer) |
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

## Analysis

`src/components/QrDialog.tsx` draws the code with `QRCode.toCanvas(canvas, payload, { width: 260, margin: 2 })`
(default error correction `M`) and lists bank, account number, account holder and transfer note below it. The bank
list (`shared/banks.json`) has only `bin` and `shortName`; the app has no bank or VietQR images.

- A mark in the centre hides part of the code, so the code needs error correction `H` (about 30% recovery) and the
  mark must stay small (at most about 20% of the code width).
- `docs/business-rules.md` says the QR is generated in the browser and account numbers are never sent to a third
  party. Loading logos from a third-party host at runtime would tell that host which bank the recipient uses, so the
  images are bundled with the app.
- The code keeps its white background in both themes (`--color-qr-bg`), so it scans in dark mode.

## Clarifying questions

1. Which logo goes in the centre of the code: VietQR or the recipient's bank?
2. What should the card show next to the code?

## Answers

From the product owner (human):

1. The recipient's bank logo when the app has one; otherwise the VietQR mark.
2. The bank name, the account number and the amount.

## Plan

Branch: `feat/vietqr_code_style` from `develop`. The payload, the amount and the transfer message do not change.

Layout of the card (only for VND groups with a bank account, as today):

- Top: the VietQR wordmark, as in the reference.
- Middle: the code inside a thin frame, error correction `H`, with the centre mark on a white rounded square: the
  recipient's bank logo, or the VietQR mark when the app has no logo for that bank or the image fails to load.
- Bottom, inside the frame: bank name, account number, amount. The account holder and transfer note stay in the
  details list below the card.

Files:

- `public/qr/vietqr.svg`, `public/qr/vietqr-mark.svg`: VietQR wordmark and mark.
- `public/bank-logos/<bin>.png`: logos of the banks in `shared/banks.json`, bundled once from the logo URLs in the
  same public VietQR bank list the file came from. Banks without a logo are left out and use the fallback.
- `src/qrCard.ts` (new): `QR_OPTIONS` (`errorCorrectionLevel: 'H'`, width, margin), `BANK_LOGO_BINS` and
  `qrMarkFor(bank)` returning the bank logo path or the VietQR mark.
- `src/components/QrDialog.tsx`: the card markup; the centre mark is an `<img>` over the canvas with an `alt` from
  `t()`, switching to the VietQR mark on `onError`.
- `src/components/QrDialog.scss`: `qr-dialog__card`, `__brand`, `__frame`, `__mark`, `__summary` (BEM, mobile first,
  the card fits a 360px screen).
- `src/styles/base/_themes.scss`: `--color-qr-frame` in light and dark.
- `src/i18n/locales/en.ts`, `vi.ts`: `qr.amount`, `qr.bankLogo` (`{bank} logo`), `qr.vietqrLogo`.

Tests:

- `tests/unit/qrCard.test.ts`: `qrMarkFor` returns the bank logo for a bank in `BANK_LOGO_BINS` and the VietQR mark
  for one outside it or for no bank; every bin in `BANK_LOGO_BINS` has a file in `public/bank-logos/` and is in
  `shared/banks.json`; `QR_OPTIONS.errorCorrectionLevel` is `H`.
- `e2e/settle-up.spec.ts`: the card shows the bank name, account number `0123456789` and amount; the centre mark is
  the bank logo; for a bank without a logo it is the VietQR mark. A screenshot of the frame with the mark on top is
  decoded with `jsqr` (new dev dependency, with `pngjs` to read the PNG) and must equal `buildVietQrPayload` for the
  same input, which shows the code still scans with the mark.
- Existing `tests/unit/vietqr.test.ts` passes unchanged (payload untouched).

Docs:

- `docs/business-rules.md` (VietQR): the look of the code, the logo fallback, and that logos are bundled so no
  third party learns the recipient's bank.
- `docs/design.md`: a `vietqr_code_style` section (error correction `H`, mark size, bundled assets, fallback).

Checks: typecheck, lint, unit and API tests, e2e on desktop and mobile. Manual check by the human: scan the code
with at least two banking apps, in light and dark theme.

Known question: bank and VietQR logos are trademarks of their owners; they are used only to identify the bank of
the transfer.

## Result

Implemented by Haiku (developer) from the plan; changed after review and manual test (below).

- src/qrCard.ts: QR_OPTIONS (error correction H), the wordmark and mark paths, ankLogo(bin).
- src/components/QrDialog.tsx, .scss: the card (wordmark, framed code with the bank logo in the centre, bank
  name, account number, amount). The logo falls back to the VietQR mark on onError. For VND groups the details list
  below keeps only the account holder and transfer note; other currencies keep the full list.
- src/styles/base/_themes.scss: --color-qr-frame, --color-qr-text (the card is white in both themes).
- src/i18n/locales/en.ts, i.ts: qr.bankLogo, qr.vietqrLogo.
- Dev dependencies jsqr, pngjs, @types/pngjs for the e2e decode.
- Tests: 	ests/unit/qrCard.test.ts (level H; exactly one logo file per bank in anks.json);
  e2e/settle-up.spec.ts (card content, bank logo, a screenshot of the code with the logo decodes to the payload,
  fallback to the VietQR mark when the logo returns 404 and stays on it).
- Docs: docs/business-rules.md (VietQR), docs/design.md (ietqr_code_style).

Typecheck and lint clean, 291 unit and API tests and 54 e2e tests pass.

## Review

Manual test by Sonnet (QA tester) with Claude in Chrome: 14 checks pass (six banks, fallback, network only to the
app origin, vi and en, long values, non-VND group, member without account, "I have sent it"). The Haiku (tester)
run stopped three times on an API error; its checks were rerun by the AI team lead with a Playwright script
(desktop light, 360px dark). Code review by Sonnet and the AI team lead with eview-checklist. Fixed:

- Major: in dark theme the bank, account and amount were light text on the white card. The card now uses
  --color-qr-text, and the frame color no longer changes with the theme.
- Major: the centre box was 48px square regardless of the code size, and wide bank logos shrank inside it. It is now
  32% by 14% of the code, without a shadow, so the logo is readable and covers about 5% of the code.
- Minor: bank and account number were shown twice (card and list); the list drops them for VND groups.
- Simpler: BANK_LOGO_BINS, the logo set, the QrOptions interface and two of the three mark states removed (one
  logoFailed flag); the unit test checks the real invariant (logo files match anks.json); docs shortened.
- Not a defect: the review suspected the logo fallback could flip back, since ank looked like a new object each
  render. indBank returns the same entry of the static BANKS list; the state is now a single flag anyway, and the
  e2e test checks the mark stays.
- Left as is (pre-existing, all dialogs): no focus trap, Escape does not close the dialog, focus does not move into
  it. Worth a separate ticket.
- Still to do by the human: scan the code with two banking apps, in light and dark theme.
- Confirmed by the human on the Cloudflare deploy of `develop`. Released in release/2026-10-27-2.
