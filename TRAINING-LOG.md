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

## Day 05: 2026-10-14

Goal: memory, context and sessions; two more seeded bugs through the loop.
Left over from the previous day: the permission modes tour, the explain-and-verify exercise and the unaided loop.
Shipped (merge requests, artifacts, screenshots):
- `fix/expense_date_previous_day` merged: the default date came from `toISOString()`, which is the UTC date, so
  before 07:00 in UTC+7 the form suggested the previous day. `todayLocal()` now builds the date from the device's
  local fields. The tests switch time zones; Vitest is pinned to the forks pool and each test asserts that the
  switch took effect.
- `fix/guest_can_delete_expense` merged: the delete check was skipped for a caller without a member id, so a guest
  could delete any expense. `requireCanDeleteExpense` in `worker/policy.ts` now lets the owner through first and
  requires everyone else to be a member and the author. API tests cover a guest, another member, the author and an
  owner who holds only the owner key.
- Memory: `CLAUDE.md` kept as the shared rule file; auto memory holds facts that are not in the repository (for
  example, that a subagent model override fails here, and where drafts and patches live).
Observations (positive / negative):
- A long session was compacted, then stopped by a usage limit while three background agents were working. The
  summary kept the rules, the decisions and the list of open steps. The agents were resumed from their own
  transcripts and finished their work without repeating it.
- What does not survive compaction is anything that was only said and never written down. Progress notes kept in
  a local file were the reliable source after the break, but the file had to be kept current to be useful.
- The time zone bug was first seen live, not in a test: at 00:40 the form showed the previous day. On a build
  server that runs in UTC the bug cannot appear, so the test has to set the time zone itself to catch it.
For the retro:
- Write progress down as it happens; a summary written at the end of a long session misses steps.
Open before the next day:
- [ ] Prove that context matters: the same task in a fresh session and in one that has read the codebase; compare
  quality and token use
- [ ] Make a bad edit on purpose and undo it with `/rewind`
- [ ] Review `CLAUDE.md` as a team: does it still fit on one screen?

## Day 06: 2026-10-14

Goal: flagship features and parallel work: two tickets in separate worktrees at the same time, an artifact, and
Developer Checkpoint 2.
Left over from the previous day: the fresh-session comparison, `/rewind` and the `CLAUDE.md` team review.
Shipped (merge requests, artifacts, screenshots):
- `feat/language_picker` and `feat/theme_picker` built in parallel, each in its own git worktree with its own
  agent, reviewed and merged. The second merge conflicted in the header (`App.tsx`, `App.scss`, `docs/design.md`);
  both pickers were kept inside `.app__controls`. Typecheck, 132 unit and API tests and 18 e2e tests pass on
  `develop` after the merge.
- `stale_language_messages` added to the backlog: found in review, error and status messages keep the language that
  was active when they appeared.
- Artifact: a merge request walkthrough of the two pickers (behaviour, code tour, the conflict, review comments,
  test steps for `ready-to-review`), published privately; it is shared from its own page.
- `.claude/loop.md` drafted on `chore/loop-md`: the default prompt for a bare `/loop` (test the oldest ticket that
  waits to merge, report stalled tickets; never push or merge).
Checkpoint 2 (Developer track):
- [x] Two parallel sessions, both merged
- [ ] One plan-mode change steered through diff comments
- [x] One artifact (published; sharing it with a peer is still open)
- [ ] One Remote Control steer
- [ ] One `/loop` run
Observations (positive / negative):
- Worktrees kept the two agents apart: no shared working copy, so neither could overwrite the other's files. The
  conflict appeared only at merge time, in the one place both tickets had to touch, and the merge request had
  predicted the header conflict.
- The `theme_picker` ticket was merged without first moving it to `ready-to-review/`. A step that lives only in a
  checklist is easy to skip under time pressure; it was fixed with a follow-up commit and merge instead of
  rewriting `develop`.
For the retro:
- Parallel agents save time on independent tickets, but the shared files (header, locales, README tables) need a
  merge order decided up front.
Open before the next day:
- [ ] Share the walkthrough artifact with a peer
- [ ] Steer a plan-mode change through diff comments
- [ ] `/rc` at the desk, connect from the phone through claude.ai/code and send one steer
- [ ] `/loop 15m` on an open merge request, then a custom `/loop 5m` check; try the repository `loop.md`
- [ ] `ultrathink` and `/effort` levels on the same hard bug; compare
- [ ] A cloud session for a long task, checked from claude.ai/code with the laptop closed
- [ ] Course: Introduction to subagents

## Day 07: 2026-10-14

Goal: skills, commands and plugins: one team skill and one custom slash command, shipped through a merge request
into `.claude/`.
Left over from the previous day: the Checkpoint 2 items that need a person (plan-mode steer, Remote Control, `/loop`
run, sharing the artifact).
Shipped (merge requests, artifacts, screenshots):
- `chore/release-checklist-skill` merged after two review rounds: the team skill `release-checklist` (release from
  `develop` to `main`) and the command `/start-ticket <ticket_name>` (branch, ticket to `in-progress/`, plan before
  code). `CLAUDE.md` now names `chore/<topic>` branches for tooling changes without a ticket.
Observations (positive / negative):
- The first version of the skill stopped only when a ticket had been rejected, so a ticket that nobody had tested
  yet would still have reached `main`. The rule existed in `tickets/README.md`; the skill had restated it loosely.
- The first version of `/start-ticket` committed the plan before showing it, which contradicts "do not commit until
  the user confirms". Instructions written for an agent need the same review as code.
- A skill that writes to `TRAINING-LOG.md` has to know where the day's entry lives (an open `docs/day-NN-log`
  branch), or the release and the log collide in the same place.
For the retro:
- Encoding a process as a skill exposes the gaps in the written process itself.
Open before the next day:
- [ ] Browse a plugin marketplace, install one plugin (for example code intelligence) and evaluate it
- [ ] Try `/start-ticket` and the `release-checklist` skill in a real session
- [ ] Course: Introduction to agent skills

## Day 08: 2026-10-14

Goal: MCP and connectors: add the Playwright MCP server and use one MCP tool end to end; ship `exact_amount_split`.
Left over from the previous day: the plugin evaluation and a real run of the new skill and command.
Shipped (merge requests, artifacts, screenshots):
- `chore/playwright-mcp` merged: project `.mcp.json` with `@playwright/mcp` pinned to 0.0.83; README notes on
  approval, local-scope overrides, Windows and the browser build.
- `feat/exact_amount_split` merged after one round: a third split mode, "Exact shares", with new error codes
  `SPLIT_SUM_MISMATCH` and `INVALID_SHARE_AMOUNT`; 220 unit and API tests and 22 e2e tests pass.
- `fix/exact_split_share_layout` merged: found while taking screenshots for the merge request through the browser
  pane, where the share fields covered the member names.
- `chore/github-mcp` merged: README notes on adding the GitHub connector at local scope with a personal access
  token; the token is kept out of `.mcp.json`.
- `chore/github-actions` merged: the repository is mirrored to GitHub, and `.github/workflows/ci.yml` runs
  typecheck, unit/API tests and e2e on pull requests and on `develop`/`main`.
Observations (positive / negative):
- The review found an API test that passed about one time in six: it expected shares in insertion order, while the
  query returns them in the order of random ids. The suite had passed once, and the merge request reported it as
  green.
- All tests and e2e passed while the form was unusable on a phone. The e2e test found fields by their accessible
  labels, which stayed correct while the fields covered the names. A screenshot showed it at once, and a second
  look at phone width after the first fix showed a name that was still cut off.
- Two claims from a reviewer were wrong when checked against the installed package: the Playwright MCP server
  blocks `file://` by default, and `--browser chromium` needs a different Chromium build from the one the e2e
  setup installs.
For the retro:
- Look at the screen before merging UI work, at phone width too; tests check what they are told to check.
Open before the next day:
- [ ] Add the GitHub connector with a personal access token and query a pull request or a workflow run on the
  GitHub mirror from a session
- [ ] Push to the GitHub mirror and check the first GitHub Actions run
- [ ] Drive the app through the Playwright MCP server in a session (approve the project server first)
- [ ] Course: Introduction to model context protocol

## For the retro

-
