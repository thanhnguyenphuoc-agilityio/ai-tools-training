# Tally

Tally is a web app for sharing expenses within a group of people: a trip, a dinner, a shared house, a club fund.
Members record who paid what; the app works out who owes whom, proposes the fewest transfers to settle up, and
shows a **VietQR** code so each transfer can be paid by scanning it in a Vietnamese banking app. No account or
sign-up is needed: a group is just a link.

Tally is the training app for the AI Tools course. It is used to practise the full loop: ticket, reproduction,
fix, merge request, review and merge.

**Fake data only.** Real bank accounts or personal details never go into the repository, tests or screenshots.

## Business overview

Read this section first. The precise, testable rules are in [`docs/business-rules.md`](docs/business-rules.md);
the architecture and the planned designs are in [`docs/design.md`](docs/design.md).

### Problem

When a group shares costs, one or two people usually pay upfront and everyone else has to pay them back. Keeping
track in a chat is error-prone: amounts get lost, splits are argued over, and typing account numbers by hand leads
to failed or misdirected transfers. Tally keeps one shared record per event and turns it into exact transfers.

### Concepts

| Term | Meaning |
|---|---|
| Group | One event or shared fund. Identified by a random code such as `x7kq-m2pz-9hfw`; anyone with the link can view it. Has one currency (VND, USD, THB...). |
| Owner | The person who created the group. Proven by a secret owner key, shown once as a recovery link. Can rename the group, change rounding and currency, delete any expense, remove a member who has settled up; edit other members' bank details and record transfers for others. |
| Member | A person in the group. Either joined from their own device, or added by name by someone else and claimed later ("I am <name>"). The owner can release a name that was claimed by mistake, so it can be claimed again. |
| Guest | Someone who opened the link but has not joined. Can only view. |
| Expense | One payment: who paid, how much, what for, on which date, and who shares it (equally, by weight or by exact shares). It can carry one optional receipt photo. Only its author or the owner can change or delete it. |
| Share | Each participant's part of an expense, computed once when the expense is saved. Shares always add up exactly to the amount. |
| Balance | Paid minus owed, plus confirmed transfers. Positive means the member is owed money; the balances of a group always sum to zero. |
| Transfer | A repayment between two members. It is `sent` when the payer says so, and `confirmed` when the receiver says the money arrived. Only confirmed transfers change balances. |
| Receiving account | A member's bank, account number and holder name, used to build the VietQR code. Visible to anyone with the link. |

### Main flow

1. The owner creates a group (name, own name, currency, rounding), saves the recovery link and shares the group
   link in the group chat.
2. Members open the link and join with their name, or claim a name the owner already added.
3. Whoever pays adds an expense and selects who shares it.
4. The settle-up view shows balances and the simplest list of transfers.
5. A debtor opens a transfer, scans the VietQR code in their banking app, pays and marks it as sent.
6. The receiver confirms. When every balance is zero, the group is settled.

### Constraints that shape the design

- **No sign-up required.** Access is by link; identity is a device cookie (members) or the owner key. Google
  sign-in is optional and available (`google_sign_in`): an account restores access across devices, while guests can
  view, join and pay without an account.
- **Money is exact.** Amounts are integers in the smallest unit of the group currency; rounding remainders go to
  the payer. No floating point.
- **The app never touches money.** It does not connect to banks and cannot see payments; people confirm transfers
  themselves.
- **VietQR is VND only.** Groups in other currencies show the account details without a QR code.
- **Privacy.** Groups contain bank account numbers, so codes are long and random, secrets are stored only as hashes,
  and inactive groups are deleted automatically after 10 days without changes (`purge_inactive_groups`).

### Not in the MVP

Each of these is a ticket in [`tickets/`](tickets/) (`backlog/`, or `todo/` once clarified): attendance-based splits
and currency conversion. `docs/design.md` holds a design for each of them.

### Who reports tickets

Tickets are reported by simulated roles: Opus (AI team lead), Sonnet (QA tester), Haiku and Gemini (end users),
plus the human product owner (the trainee). See the repository README.

## Running locally

Requires Node 22 or later. A Cloudflare account is not needed for local development.

On Windows, keep the full path of `practice/tally` under about 120 characters (for example, clone into
`C:\src\ai-tools-training`). The local D1 database is stored about 125 characters deeper, under
`.wrangler/state/v3/d1/`, and past the 260-character Windows path limit, `npm run db:migrate` fails with
`internal error`, which also stops `npm run dev` and `npm run e2e`.

```bash
npm install
npm run dev        # applies migrations to the local D1 database, then serves http://localhost:5173 (UI + API)
```

To run with development sign-in enabled locally, set `TALLY_DEV_LOGIN` for the one command:

```bash
# bash
TALLY_DEV_LOGIN=true npm run dev
```

```powershell
# PowerShell
$env:TALLY_DEV_LOGIN='true'; npm run dev
```

```bat
:: cmd
set TALLY_DEV_LOGIN=true && npm run dev
```

Demo data can be created from a second terminal while `dev` is running:

```bash
npm run seed
```

Local data is stored in `.wrangler/` and survives restarts. Deleting that folder resets it.

## Tests

```bash
npm run typecheck
npm run lint       # oxlint (JS/TS + UI text convention) and stylelint (BEM + theme colors)
npm test           # unit (shared/) and API (worker/, in-memory D1 via Miniflare)
npx playwright install chromium   # first run only
npm run e2e        # Playwright, desktop and mobile
```

`npm run e2e` starts its own server on port 5174 with the development sign-in enabled for that process only, and it
never reuses a server already running (so a dev server started by hand on 5173 is left alone). The same command runs
in CI without extra configuration.

The suite passes on a fresh clone. A passing suite does not mean the app has no bugs; tests only cover the
behaviour they check.

## Structure

| Path | Description |
|---|---|
| `shared/` | Pure logic shared by the UI and the API: `money.ts` (parsing, splitting), `settle.ts` (balances, debt simplification), `vietqr.ts`, `groupCode.ts`, `types.ts` |
| `worker/` | Hono API on Cloudflare Workers. `auth.ts` identifies the caller, `policy.ts` decides what the caller may do, `routes/` is split by resource |
| `migrations/` | D1 (SQLite) schema, numbered in order |
| `src/` | React SPA. `api.ts` is the typed client, `pages/` and `components/` are the UI, `i18n/` holds all user-facing text (vi, en), `styles/` is SCSS with BEM and light/dark themes |
| `tests/`, `e2e/` | Vitest and Playwright |
| `scripts/seed-demo.mjs` | Creates a demo group through the API |
| `docs/business-rules.md` | Required behaviour, as stated by the customer |
| `docs/design.md` | Architecture, extension points and up-front designs per ticket |
| `tickets/` | Backlog. Some tickets are intentionally vague |
| `PRACTICE.md` | Practice method: bug seeding, personas, ticket map, 15-day schedule |

## Practice rules

1. One ticket, one branch, one merge request into `develop`.
2. A bug fix includes a test that fails before the fix and passes after it.
3. The answer files next to the repository folder (`tally-*-answers.md`) stay closed until self-assessment.
4. AI output is a proposal until it has been run.

## Deployment

See section 8 of `docs/design.md`. The app runs on the Cloudflare Workers and D1 free tier.
