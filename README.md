# AI Tools Training

Practice repository for the 15-day AI Tools training for developers.

- Training plan: <https://dojo.agilityio.dev/>

All exercises are done in this repository, never in customer code. Secrets and customer data are never pasted
into AI tools.

## Simulated roles

This is a personal project with a single developer. To practise the way a real project team works, AI models play
the other roles: they report tickets, answer business questions, test, review and seed bugs. Ticket reporters are
named after the model that plays them, together with the role:

| Name | Role in the project |
|---|---|
| Opus | Product owner: business rules, priorities, acceptance |
| Sonnet | QA tester: test reports, security questions |
| Haiku | End user (group member) |
| Gemini | End user (group treasurer) |
| Team lead | A Claude Code session: runs the e2e tests, reviews merge requests and merges them into `develop`; prepares releases to `main` |

The trainee plays the developer, and in some exercises the BA, QA or reviewer. The trainee is also the final human
check: every feature is tested by hand on `develop` before it reaches `main`. `practice/tally/PRACTICE.md`
describes how each role is simulated.

## Contents

| Path | Description |
|---|---|
| [`practice/tally/`](practice/tally/README.md) | Training app **Tally**: group expenses with VietQR settle-up (React + Hono on Cloudflare Workers + D1) |
| [`practice/tally/tickets/`](practice/tally/tickets/README.md) | Tickets, one folder per status (backlog, todo, in-progress, waiting-to-merge, ready-to-review, done) |
| [`practice/tally/PRACTICE.md`](practice/tally/PRACTICE.md) | Practice method, simulated roles, bug-seeding prompts, 15-day schedule |
| [`TRAINING-LOG.md`](TRAINING-LOG.md) | Daily log: goals, shipped work and retro notes |
| [`CLAUDE.md`](CLAUDE.md) | Instructions for Claude Code in this repository |
| `.claude/skills/review-checklist/` | Review skill based on the Day 3 checklist |
| `.claude/loop.md` | Default prompt for a bare `/loop`: a report-only pass that tests one ticket waiting to merge |

## Language

The repository is written in English: code, tests, documentation, tickets and the training log. The only
exception is the localization files (`practice/tally/src/i18n/locales/*.ts`), which contain the user-facing text
for each supported language.

## Getting started

Start with the **Business overview** in [`practice/tally/README.md`](practice/tally/README.md#business-overview):
what the app does, its concepts, the main flow and its constraints. Then clone the integration branch and run it
(`develop` is the default branch on GitLab once Day 0 is pushed):

```bash
git clone -b develop git@gitlab.asoft-python.com:thanh.nguyenphuoc/ai-tools-training.git
cd ai-tools-training/practice/tally
npm install
npm run dev
```

Section 0 of `practice/tally/PRACTICE.md` describes the bug-seeding step, which runs in a separate session
before Day 2.

## Git flow

- `develop`: integration branch. Every feature merge request targets it; the AI team lead runs the e2e tests,
  reviews and merges.
- `main`: released code. `develop` is merged into `main` only after a human has tested and confirmed the new
  features (see the workflow in `practice/tally/tickets/README.md`).
- Work branches: `feat/<ticket_name>`, `fix/<ticket_name>`, `chore/...`, `docs/...`, where `<ticket_name>` is the
  ticket file name without `.md`.
- Commits follow Conventional Commits (`feat:`, `fix:`, `test:`, `docs:`, `chore:`, `refactor:`).
- A merge request is self-contained: what changed, why, how it was tested, screenshots for UI changes and a
  ticket link. Typecheck, unit/API tests and e2e must pass locally.
