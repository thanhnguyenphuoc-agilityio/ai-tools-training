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

## Day 03: 2026-10-14

Goal: fix the Day 02 bug on a branch with small commits, write the merge request description, review, merge, and
resolve the conflict (Checkpoint 1).
Left over from the previous day: role play with a person and Claude 101.
Shipped (merge requests, artifacts, screenshots):
- `fix/weighted_split_share_off` merged into `develop`: the fix (round the scaled weight instead of truncating it),
  a check over every valid weight added after review, and a self-contained merge request description.
- Review by the AI team lead with the `review-checklist` skill: three actionable comments (test over all weights,
  incomplete commit list in the description, stored weight versus used weight). The third became the ticket
  `stored_weight_rounding`.
- Conflict exercise: `docs/max-amount-minor-units` merged, then `docs/max-amount-constant` merged with the conflict
  in `docs/business-rules.md` resolved by keeping both changes on one line.
- `docs/ticket-analysis` merged after two review rounds; `docs/day-01-setup` merged.
Checkpoint 1:
- [x] Reproduce an assigned bug and write the repro in the ticket
- [x] Fix on a branch with a test that failed first
- [x] Merge request with a self-contained description
- [x] One review with at least 3 actionable comments; one merge with a conflict resolved
Observations (positive / negative):
- The review showed that 573 of the 10,000 valid weights were affected, not only the two in the ticket; a test over
  the whole input range is cheap here and proves the claim in the description.
- Two reviewers reported that `CLAUDE.md` still used the old status name `waiting-to-review`. A search of the
  repository showed no such text: the reviewers had read an older copy of the instructions from their own context.
  A claim from an AI reviewer is checked against the files before it is acted on.
For the retro:
- Writing the merge request description before review made the reviewer's job faster, and the reviewer still found
  a factual slip in it (the commit count).
Open before the next day:
- [ ] Peer swap with a person: could they review or implement from the merge request description alone?
- [ ] Push the branches and open the merge requests on GitLab, so CI runs on them
- [ ] Course (BA/QA path, optional): Real-World AI for Everyone

## Day 04: 2026-10-14

Goal: the daily loop in the Code tab; take two seeded bug tickets through the full loop (ticket, plan, fix, test,
merge request, review, merge).
Left over from the previous day: the peer swap and pushing the branches to GitLab.
Shipped (merge requests, artifacts, screenshots):
- `fix/expense_list_wrong_payer` merged: the expense row named the author (`createdBy`) instead of the payer
  (`payerId`). A unit test for the new `payerName` helper and an e2e assertion on the row text, which fails with the
  old behaviour.
- `fix/large_group_expense_rejected` merged after two review rounds: the request body limit was 2 KB, not the
  documented 16 KB. Tests for a 35-member expense and for a body of exactly 16 KB and one byte more; the maximum
  group size is recorded as an open question in `docs/business-rules.md`.
Observations (positive / negative):
- The first version of the 35-member test passed even with the old 2 KB limit: short test ids made the request
  only about 1.5 KB. The test was run against the unfixed code on purpose, which showed the gap; it now uses ids of
  real length and asserts that the body is larger than 2 KB. A test that has never been seen to fail proves little.
- The same test took about 15 s at first because it added 32 members through the API. Seeding them with one SQL
  statement brought the test body down to about 2 s.
For the retro:
- Running a new test against the unfixed code is a cheap step that catches tests that do not test anything.
Open before the next day:
- [ ] Permission modes tour (default, acceptEdits, plan, auto) on a throwaway change
- [ ] "Explain how feature X works" in a fresh session, then verify two of its claims by reading the code
- [ ] Repeat the full loop on a ticket in the Code tab without help, steering once with a hunk comment in the diff
  pane
- [ ] Course: Claude Code in action

## For the retro

-
