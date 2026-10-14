# Training log

Each day has one entry. At the start of the day, record the goal and anything left over from the previous day.
At the end of the day, record what shipped (merge requests, artifacts, screenshots). The "For the retro" list
is used on Day 15.

## Template

```markdown
## Day NN: YYYY-MM-DD
Goal:
Left over from the previous day:
Shipped (merge requests, artifacts, screenshots):
Observations (positive / negative):
For the retro:
Open before the next day:
```

## Day 00: 2026-10-13

Goal: prepare the practice environment.
Left over from the previous day: -
Shipped (merge requests, artifacts, screenshots):
- Repository `ai-tools-training`, branch `develop`; training app `practice/tally` runs locally with tests and CI.
- Ticket board in `practice/tally/tickets/` with 18 tickets in `backlog/`, reported by simulated roles.
Observations (positive / negative):
- Several rounds of corrections on conventions (English-only files, neutral tone, ticket board), now recorded in
  `CLAUDE.md` so later sessions start from them.
For the retro:
- Writing conventions down in `CLAUDE.md` early avoids repeating the same corrections.
Open before the next day:
- [ ] Sign in to claude.ai, Claude Desktop and the Claude mobile app
- [ ] Push `develop` to GitLab, set it as the default branch, enable a CI runner and confirm the pipeline passes
- [ ] Run Prompt A (`practice/tally/PRACTICE.md`) in a separate session to create the seeded bug tickets
- [ ] Select the Day 11 role: web (Windows)

## Day 01: 2026-10-14

Goal: mental model and Claude basics; run the app from a clean clone; seed bugs for Days 2-3.
Left over from the previous day: the Day 00 sign-in, GitLab push and CI items and the Day 11 role choice are still
open.
Shipped (merge requests, artifacts, screenshots):
- Clean clone of `develop` verified: `npm ci`, typecheck, 103 unit and API tests and 6 e2e tests pass.
- Bug seeding (Prompt A) run in an isolated subagent: five `source::seeded` tickets in `tickets/backlog/`
  (`weighted_split_share_off`, `expense_date_previous_day`, `guest_can_delete_expense`,
  `large_group_expense_rejected`, `expense_list_wrong_payer`). The answer key stays outside the repository, unread.
- `docs/day-01-setup`: README note on the Windows path length limit for the local D1 database.
Observations (positive / negative):
- The first clean clone, in a deep temporary folder, failed at `npm run db:migrate` with `internal error` and no
  hint about the cause. Measuring the path showed that the D1 file passed the 260-character Windows limit; a short
  path worked. Running the setup from scratch found a problem the existing checkout could not show.
For the retro:
- "Works on my machine" includes the folder path; a clean-clone check belongs in onboarding.
Open before the next day:
- [ ] Day 01 exercise in Claude chat: three real work questions (a bug summary, an explanation, a draft) and the
  prompt changes that improved each answer
- [ ] Git block on GitLab: clone, branch, commit, push
- [ ] Push `develop` with the seeded commits so that feature branches start from them

## Day 02: 2026-10-14

Goal: analyse five backlog tickets; reproduce one seeded bug and express it as a failing test; create the conflict.
Left over from the previous day: the Day 01 chat exercise and the GitLab git block.
Shipped (merge requests, artifacts, screenshots):
- `docs/ticket-analysis`: `language_picker`, `theme_picker`, `exact_amount_split`, `csv_export` and `edit_expense`
  analysed (what it asks, what is ambiguous, first step), with clarifying questions answered by the simulated
  reporters (Haiku, Gemini) and the product owner (Opus); the five tickets moved to `todo/`.
- `fix/weighted_split_share_off`: reproduced in the interface and through the API (Sam 696,049 instead of
  696,970), reproduction written into the ticket, and a unit test that fails on `develop`.
- Conflict exercise prepared: `docs/max-amount-minor-units` and `docs/max-amount-constant` change the same line of
  `docs/business-rules.md`.
Observations (positive / negative):
- The hypothesis came from reading `splitAmount` and was confirmed in Node before writing the test
  (`2.3 * 100` is `229.99999999999997`), as the Day 02 habit asks: verify by running, not by trusting.
- Reproducing in the interface after midnight also showed `expense_date_previous_day` live: at 00:40 the form
  suggested the previous day.
- Review of the analysis branch found three product owner answers that contradicted `docs/business-rules.md` or
  `docs/design.md`. Answers have to be checked against the documented rules before a ticket counts as clarified.
For the retro:
- Simulated reporters answer quickly and consistently; real reporters would be vaguer and slower. The questions
  were the useful part of the exercise.
Open before the next day:
- [ ] Role-play reporter and developer with a person, and compare the analysis with a partner's
- [ ] Finish Claude 101

## For the retro

-
