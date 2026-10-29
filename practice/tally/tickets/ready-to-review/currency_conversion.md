# Paying back in VND for a foreign-currency group

| Field | Value |
|---|---|
| ID | `TAL-3` |
| Labels | `type::question`, `priority::medium`, `area::settle` |
| Reporter | Sonnet (QA tester) |
| Assignee | Haiku (developer) |
| Depends on | - |
| Related | `vnd_settle_rate` |

## Question

A group created for a trip abroad uses THB so receipts can be entered as printed. Members pay each other back by
bank transfer in VND, but the pay screen shows no QR code for a THB group, and each member converts at a different
rate. The group should be able to agree on one rate and have the app convert amounts to VND.

## Analysis

**Why there is no QR for a THB group.** `QrDialog.tsx` shows a QR only when `group.currency === VIETQR_CURRENCY`
(`'VND'`, `shared/currency.ts`). The limit is not arbitrary. `shared/vietqr.ts` follows EMVCo/NAPAS 247
(`A000000727`, service `QRIBFTTA`), and the transaction currency field (tag 53) is `704` (VND). NAPAS 247 is a domestic
VND transfer network: a VietQR payload cannot carry a THB amount, and a bank app would refuse or misread one. VietQR
therefore remains VND-only. Supporting this request means converting the amount to VND, not putting THB into the QR.

**What the data allows.** Every amount is an integer in the group currency's minor units (THB satang,
`minorDigits: 2`). Balances, shares and transfers are all in that currency. The currency can only change while the
group has no expenses or transfers (`CURRENCY_LOCKED`), so changing the group to VND is not a workaround.

**Current code.** `PATCH /groups/:code` records `group.update` through `recordChange` without details, so the audit
row cannot show what changed. For identical values it answers `changed: false` and writes no row. The follow-up must
pass details with the before and after values of the rate.

**Recommended behaviour.** The group stays in THB: balances and transfers keep being recorded in THB, so the books
never depend on a rate. The owner sets one agreed rate (VND per 1 unit of the group currency). This matches
design.md: `groups.settle_rate_e4`, with no external exchange-rate API. For a VND payout, the pay dialog shows the THB
amount, the agreed rate and the VND amount, plus a VietQR with the VND amount. The recorded transfer stays the THB
amount of the suggested transfer, so balances still reach exactly zero. Without a rate, the dialog keeps today's
behaviour (account details, no QR).

**Exactness.** The rate has decimals (for example 735.42 VND per THB), so it must not be a float. Store it as an
integer scaled by 10,000 (`settle_rate_e4 = 7354200`). The conversion is
`vnd = roundHalfUp(amountMinor * rateE4 / (10^minorDigits * 10000))`, done in BigInt because `MAX_AMOUNT * rateE4` can
exceed 2^53. The result is whole dong, rounded half up. A rounding difference of under one dong per transfer is
accepted and stated on the screen.

**Out of scope.** Live exchange rates, per-member rates, and payouts in currencies other than VND.

## Clarifying questions

1. Who sets the rate, and can it change after transfers exist?
2. Is a transfer recorded in THB or in VND?

## Answers

From the product owner (human):

1. The owner, in group settings, and only for non-VND groups. It can change at any time. A changed rate affects only
   QR codes shown afterwards. Transfers already recorded are unchanged, because they are in THB. Each change is
   audited as `group.update` with details (the values before and after), the same way an expense edit records its
   previous values.
2. In the group currency (THB), so balances stay exact. The VND figure is only a payment aid.

## Decision

The answer is yes, and the work becomes the follow-up feature `vnd_settle_rate` (TAL-50) in backlog. This branch
changes docs only. In business-rules.md, the VietQR section replaces the OPEN QUESTION with a pointer to
`vnd_settle_rate`. In design.md, the `currency_conversion` section names the planned ticket, `settle_rate_e4`, the
BigInt rule and the audit details.

## Acceptance criteria

- `docs/business-rules.md` VietQR section no longer has the OPEN QUESTION and points to `vnd_settle_rate`.
- `docs/design.md` `currency_conversion` section names TAL-50, `settle_rate_e4`, the BigInt rule and the audit details.
- `docs/design.md` Currency section, the line "Currency conversion is `currency_conversion`", points to
  `vnd_settle_rate`.
- The follow-up ticket `tickets/backlog/vnd_settle_rate.md` exists (TAL-50).
- No code changes.

## Test matrix

Docs only, so no unit or API test is added. The existing checks stay unchanged and must pass before the ticket moves
to `waiting-to-merge/`: `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:hooks`, and the e2e suite run
with `npx playwright test --config playwright.local.config.ts`.

## Plan

1. Commit "docs(tickets): start currency_conversion with a plan": move the ticket from `backlog/` to `in-progress/`
   with `git mv`, set the assignee to Haiku (developer) and Related to `vnd_settle_rate`, and add the Analysis,
   Clarifying questions, Answers, Decision, Acceptance criteria, Test matrix and Plan sections.
   Files: `tickets/in-progress/currency_conversion.md`.
2. Commit "docs: answer currency_conversion in business rules and design": in `docs/business-rules.md`, the VietQR
   bullet replaces the OPEN QUESTION sentence with a pointer to `vnd_settle_rate` (backlog). In `docs/design.md`, the
   last sentence of the VietQR bullet in the Currency section points to `vnd_settle_rate`, and the two bullets of
   `### currency_conversion` are replaced with the planned TAL-50 design. No other lines change.
3. Commit "docs(tickets): add vnd_settle_rate follow-up": create `tickets/backlog/vnd_settle_rate.md` as TAL-50 with
   its notes. `tickets/README.md` is not touched, so the next free ID stays as it is.
4. Run the checks, self-check with the review-checklist skill, then commit "docs(tickets): move currency_conversion to
   waiting-to-merge": `git mv` the ticket to `waiting-to-merge/` and add a `## Merge request` section with the branch,
   the changes, and the commands and results.

## Merge request

- Branch: `docs/currency_conversion` into `develop`.
- Commits: the plan, the answers in `docs/business-rules.md` and `docs/design.md`, the `vnd_settle_rate` follow-up
  ticket (TAL-50, `tickets/backlog/vnd_settle_rate.md`), and the move of this ticket to `waiting-to-merge/`.
- Changes: the VietQR OPEN QUESTION in `docs/business-rules.md` now points to `vnd_settle_rate`. In `docs/design.md`,
  the Currency section points to `vnd_settle_rate`, and `### currency_conversion` names TAL-50, `settle_rate_e4`, the
  BigInt conversion rule and the `group.update` audit details. No code changes.
- Commands and results (run in `practice/tally`):
  - `npm run typecheck`: exit 0.
  - `npm run lint`: exit 0.
  - `npm test`: 44 test files passed, 515 tests passed.
  - `npm run test:hooks`: 29 passed, 0 failed.
  - `npx playwright test --config playwright.local.config.ts`: 142 passed, 2 skipped.
- Self-review with the review-checklist skill: approve with nits. Nits: `docs/design.md` `currency_conversion` bullet
  on the audit and conversion rule is longer than the 120-column wrap used in the file; `tickets/README.md` still
  shows the next free ID as `TAL-50` until the batch's last merge sets it, which is intentionally not changed here.

## Review

Reviewed by Opus (AI team lead).

Findings:

- [nit] `docs/design.md` `### currency_conversion`: the bullets were longer than the 120-column wrap of the file and
  had no blank line after the first sentence. Fixed: rewrapped, wording unchanged.
- The decision follows both Answers: the rate is set by the owner for non-VND groups, audited as `group.update` with
  the previous values, and balances stay in the group currency. The planned BigInt rule is needed because
  `MAX_AMOUNT * rateE4` can exceed 2^53. The follow-up `vnd_settle_rate` (TAL-50) carries a new migration.

Verdict: approve. Docs only; commit authors and dates checked.

Checks: `npm run typecheck` and `npm run lint` passed, `npm test` 44 files / 515 passed, `npm run test:hooks` 29
passed, e2e 142 passed / 2 skipped (no code changed since that run). Typecheck and `npm test` rerun on `develop` after
the merge.
