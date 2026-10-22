# CLAUDE.md

Training sandbox for a 15-day "AI Tools" course. All project documentation, tickets, code, and communication must use English.

## Layout

- `practice/tally/`: the training app (React SPA + Hono API on Cloudflare Workers + D1). Before any task, read the
  "Business overview" in its `README.md` (problem, concepts, main flow, constraints). Then, as needed,
  `docs/business-rules.md` (exact rules) and `docs/design.md` (architecture, extension points, planned designs per ticket).
- `practice/tally/tickets/<status>/<ticket_name>.md`: the ticket board. The folder is the status (`backlog`, `todo`,
  `in-progress`, `waiting-to-merge`, `ready-to-review`, `done`); move tickets with `git mv`. Format and labels are
  in `tickets/README.md`; seeded bugs carry `source::seeded`.
- Reporters are simulated roles named after AI models (Opus product owner, Sonnet QA tester, Haiku and Gemini end
  users). Tickets describe the app as a general group expense tool; no single-sport or single-use framing.
- `TRAINING-LOG.md`: the user's daily log. Append, never rewrite past days.

## Commands (run inside practice/tally)

- `npm run dev`: migrate local D1, then serve UI + API on http://localhost:5173
- `npm run typecheck`, `npm test` (Vitest: unit + API via Miniflare), `npm run e2e` (Playwright)
- `npm run seed`: demo group through the API (dev server must be running)

## Language

- Every file in the repo is English: code, tests, SQL, SCSS, package and resource names, and all Markdown
  (READMEs, `TRAINING-LOG.md`, `PRACTICE.md`, `docs/`, `tickets/`). The app is `tally`.
- All files and code must use English. The only place for localized non-English text (or any user-facing string) is `src/i18n/locales/*.ts`. Components call `t()`/`tp()`
  from `useI18n()`; never hard-code UI text, symbols like arrows or separators included.
- Markdown uses a neutral, factual tone: third person, no slang, no chatty asides. Tickets state the request and the
  reporter's notes; they stay vague where the exercise needs it, but not informal.
- Ticket reporters use model names with roles (Opus product owner, Sonnet QA tester, Haiku and Gemini end users); test and demo people use standard synthetic names (Alex, Sam, Jamie...), never real personal names.
- The API returns stable error `code`s (`shared/errors.ts`); every locale must translate every code (type-checked).
- When test input requires non-ASCII characters or diacritics, write them with `\uXXXX` escapes.
- Docs link only to the training plan (https://dojo.agilityio.dev/); do not reference other training sites.

## Money

- Amounts are integers in the group currency's minor units (`shared/currency.ts`). Never floats.
- `shared/money.ts` owns parsing (`parseAmount` with locale rules) and splitting. VietQR only for VND groups.

## Styles

- SCSS with BEM: `block__element--modifier`. Shared blocks in `src/styles/blocks/`, tokens and mixins in
  `src/styles/abstracts/`, component blocks in a `.scss` file next to the component.
- Mobile first: base styles for phones, `@include up(sm|md|lg)` for larger screens.
- Colors only through the CSS custom properties in `src/styles/base/_themes.scss` (light/dark).
- Prettier (`practice/tally/.prettierrc`) is the code layout. The `format-on-edit` hook formats each app file
  Claude Code edits; untouched files keep their layout until they are edited. Do not reformat whole folders.

## Rules

- Never read, open, grep or summarise `tally-*-answers.md` or anything outside this repo that looks like an answer key.
  If a task would require it, stop and ask. The hook `.claude/hooks/guard-answer-keys.mjs` blocks common ways to
  reach the keys, not every one; the rule still applies.
- Fake data only. Fake bank accounts: `0123456789`, `9876543210`. Never real names, accounts or customer data.
- Identity is resolved only in `worker/auth.ts`; permission rules live only in `worker/policy.ts`.
- Schema changes go in a new numbered migration in `migrations/`; never edit a migration that has been pushed.
- A bug fix comes with a test that fails before the fix. Run typecheck + tests before saying something works.
- One ticket per branch (`feat/<ticket_name>`, `fix/<ticket_name>`) off `develop`; merge requests target `develop`.
  Tooling changes without a ticket use `chore/<topic>` branches off `develop` with the same merge request flow.
- Workflow (details in `tickets/README.md`): in-progress -> waiting-to-merge (the AI team lead runs typecheck, tests
  and e2e, reviews with `review-checklist`, then merges into `develop`) -> ready-to-review (the human tests on
  `develop`) -> done (`release/<date>` branch, then `develop` merged into `main`). Never merge into `main`
  without the human's explicit confirmation.
- Do not commit until the user confirms. Day 0 (repository preparation) is complete only when the user says so.
  Never push to `develop` or `main` directly, and never push without being asked.
- Exceptions to "nothing directly on `develop`", each only when the user asks for it:
  - Bootstrap: the single Day 0 commit goes straight onto `develop`, which is then pushed and set as the GitLab
    default branch.
  - Seeding: Prompt A in `PRACTICE.md` commits seeded bugs and their tickets directly on `develop`; the user then
    pushes `develop`.
  - The conflict exercise in `PRACTICE.md` merges two branches into `develop` by hand and pushes the result.
- All other merges into `develop` and `main` go through GitLab merge requests.
- Commit messages and MR descriptions have no `Co-Authored-By:` trailer and no "Generated with" footer.
- When a feature lands, update `docs/business-rules.md` and `docs/design.md` in the same branch.
