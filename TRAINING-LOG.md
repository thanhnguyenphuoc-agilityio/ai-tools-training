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
- [x] Sign in to claude.ai, Claude Desktop and the Claude mobile app
- [x] Push `develop` to GitLab, set it as the default branch, enable a CI runner and confirm the pipeline passes
  (the GitLab pipeline was later removed; CI runs on GitHub Actions since Day 08)
- [x] Run Prompt A (`practice/tally/PRACTICE.md`) in a separate session to create the seeded bug tickets
- [x] Select the Day 11 role: web (Windows)

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
- [x] Day 01 exercise in Claude chat: three real work questions (a bug summary, an explanation, a draft) and the
  prompt changes that improved each answer
- [x] Git block on GitLab: clone, branch, commit, push
- [x] Push `develop` with the seeded commits so that feature branches start from them

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
- [x] Finish Claude 101

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
- [x] Push the branches and open the merge requests on GitLab, so CI runs on them

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
- [x] Permission modes tour (default, acceptEdits, plan, auto) on a throwaway change
- [x] "Explain how feature X works" in a fresh session, then verify two of its claims by reading the code
- [x] Repeat the full loop on a ticket in the Code tab without help, steering once with a hunk comment in the diff
  pane
- [x] Course: Claude Code in action

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
- [x] Prove that context matters: the same task in a fresh session and in one that has read the codebase; compare
  quality and token use
- [x] Make a bad edit on purpose and undo it with `/rewind`
- [x] Review `CLAUDE.md` as a team: does it still fit on one screen?

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
- [x] One plan-mode change steered through diff comments
- [x] One artifact (published and shared with a peer)
- [x] One Remote Control steer (2026-10-21)
- [x] One `/loop` run (2026-10-19)
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
- [x] Share the walkthrough artifact with a peer
- [x] Steer a plan-mode change through diff comments
- [x] `/rc` at the desk, connect from the phone through claude.ai/code and send one steer
- [x] `/loop 15m` on an open merge request, then a custom `/loop 5m` check; try the repository `loop.md`
- [x] `ultrathink` and `/effort` levels on the same hard bug; compare (in Claude Code 2.1.306, `ultrathink` and
  `ultracode` only add a message to the prompt)
- [x] A cloud session for a long task, checked from claude.ai/code with the laptop closed
- [x] Course: Introduction to subagents

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
- [x] Browse a plugin marketplace, install one plugin (for example code intelligence) and evaluate it
- [ ] Try `/start-ticket` and the `release-checklist` skill in a real session
- [x] Course: Introduction to agent skills

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
- [x] Add the GitHub connector with a personal access token and query a pull request or a workflow run on the
  GitHub mirror from a session
- [x] Push to the GitHub mirror and check the first GitHub Actions run (the e2e failure on Linux fonts became
  `fix/exact_split_name_overlap` on Day 10)
- [x] Drive the app through the Playwright MCP server in a session (approve the project server first)
- [x] Course: Introduction to model context protocol

## Day 09: 2026-10-14

Goal: hooks and automation: format-on-edit, block-forbidden-command and notify-on-finish hooks through merge
requests; ship `csv_export`.
Left over from the previous day: the GitHub connector, the first GitHub Actions run, and a session driven through
the Playwright MCP server.
Shipped (merge requests, artifacts, screenshots):
- `feat/answer_key_guard` merged after one round: a `PreToolUse` hook that blocks common ways to read the
  `tally-*-answers.md` files (key paths, wildcards, searches of the folder above the repository, Bash and
  PowerShell commands), with 16 tests (`node --test .claude/hooks/guard-answer-keys.test.mjs`).
- `feat/claude_code_hooks` merged after one round: a `PostToolUse` hook that formats each app file Claude Code
  edits with Prettier (only edited files, so no large reformatting diff), and a `Stop` hook that shows a desktop
  notification when a reply ends (`CLAUDE_NOTIFY=off` turns it off); 28 hook tests
  (`node --test .claude/hooks/*.test.mjs`).
- `feat/csv_export` merged after one round: "Download CSV" for joined members, one file of expenses and transfers,
  UTF-8 with BOM, RFC 4180 quoting and a guard against spreadsheet formulas; 221 unit and API tests and 22 e2e
  tests pass.
Observations (positive / negative):
- The first version of the guard let seven kinds of command through: a key named as the first word of a command,
  a key inside a nested substitution, a quoted heredoc fed to a shell, and options written as `-Path:value`. The
  review found them by running each command against the hook; each now has a test that failed before the fix.
- Prettier rewrote CRLF files as LF on Windows; Git hid it because of `core.autocrlf`. `endOfLine: auto` keeps the
  ending each file already has.
- A guard can also fail by blocking ordinary work. The tests check what must stay allowed (commit messages that
  mention the files, listing the parent folder) as much as what must be blocked.
- An e2e run reused a dev server left open by another checkout on port 5173 and tested the wrong code; eight
  failures had nothing to do with the branch.
For the retro:
- Check which server an e2e run talks to before reading its failures.
Open before the next day:
- [x] Automation ladder: `/goal` on a bounded task, a Desktop scheduled task (morning briefing), the Routines
  overview, and `@claude` in GitHub Actions on the GitHub mirror (the Desktop scheduled task produced
  `chore/daily-review-2026-10-22`)
- [x] Evaluate the comments of an automated review on the next pull request

## Day 10: 2026-10-23

Goal: review and quality: review a branch with seeded defects, compare the signal of two reviews, fix what they
found.
Left over from the previous day: the automation ladder and an automated review on a merge request.
Shipped (merge requests, artifacts, screenshots):
- `seeded/review` created with Prompt B by a separate session: `remove_member` with seeded defects. The answer key
  was written outside the repository and was not opened by the reviewing sessions; the branch is kept unchanged for
  the human review against the key.
- Two independent reviews of `seeded/review`: one with the `review-checklist` skill, one with `/code-review` (high
  effort) and a security pass. Both found the same 8 core defects; the second added an exposure of bank details and
  a translation error (12 findings in total, including process).
- `feat/remove_member` merged after three review rounds: the Prompt B commits rebased onto `develop`, then one commit
  per finding, each with a test that fails before the fix, an accessible in-app `RemoveMemberDialog` replacing the
  native prompt, and `e2e/remove-member.spec.ts`. A third round with `/code-review ultra` added 8 findings (two
  races between a removal and a concurrent write, settle-up suggestions naming a removed member, and UX and cleanup
  items), all fixed on the same branch. Typecheck, 273 unit and API tests, 28 hook tests, and 26 e2e tests pass.
Observations (positive / negative):
- The seeded branch passed its own 141 tests and typecheck; none of the defects was caught by the suite.
- Running throwaway tests to confirm each finding separated real defects from plausible ones; the security pass
  also listed what it checked and rejected, which shows its coverage.
- One test written after a fix passed on the seeded code because an earlier defect hid it; it fails on the commit
  just before its own fix, which is the commit that matters.
- Round 2 found two minor defects introduced by the fixes (an expense with a zero exact share could not be deleted;
  a reason of only spaces was refused).
- The ultra review found check-then-write races that no single-request test could show; an API test helper that
  commits a competing write just before the route's write made them reproducible.
- Replacing `window.prompt` with an in-app `RemoveMemberDialog` makes the confirmation dialog accessible, styleable,
  and consistent across browsers and devices.
For the retro:
- A seeded review branch is the clearest way to measure a review: the defects are known, so missed and false
  findings can be counted.
Open before the next day:
- [x] Compare the 12 findings with the answer key (`tally-review-answers.md`, human only) and note missed and false
  findings
- [x] Run `/code-review ultra` on `seeded/review` and compare its signal with the two local reviews
- [x] Security plugins walkthrough (security-guidance, Claude Security scan)
- [x] Install the `frontend-design` plugin before Day 11 (`ui_redesign`)

## Day 11: 2026-10-26

Goal: role day (web) and Developer Checkpoint 3: verify the running app, not only the code; ship
`header_controls_icons` and `ui_redesign`.
Left over from the previous day: none.
Shipped (merge requests, artifacts, screenshots):
- `docs/ticket-ids` merged: every ticket has an `ID` field (`TAL-1` to `TAL-37`, in the order the tickets were
  added); `tickets/README.md` says how the next ID is chosen.
- `feat/header_controls_icons` (`TAL-27`) merged after one review round: the language picker is a menu button
  with a flag and the language name, the theme picker shows a monitor, a sun and a moon, and the header fits on one
  row from 360px up.
- `feat/ui_redesign` (`TAL-17`) merged after one review round: a summary above the group tabs (total spent,
  members, the viewer's balance), a bottom tab bar on phones, confirmation toasts after saves, icon actions and a
  quieter visual style.
- Both features were first built on a draft branch and reapplied on the current `develop`. Four components
  conflicted with the remove-member work from Day 10; each keeps the `develop` behaviour with the redesign added on
  top, as described in the tickets.
- Typecheck, lint, 287 unit and API tests, 28 hook tests and 50 e2e tests pass on `develop`.
- Afternoon: a manual test of `develop` with Claude in Chrome by two subagents in separate tabs. Haiku (end-user
  view) ran 15 cases in two rounds; Sonnet (QA view, risk based) ran 18 cases in three rounds, the last one in
  Vietnamese and the dark theme. No defect; three UX suggestions.
- `feat/toast_timing` (`TAL-38`) from two of the suggestions: toasts stay six seconds instead of four, and a phone
  shows only the two newest toasts. The third (the header language button shows only the flag below `sm`) is kept,
  as agreed in `header_controls_icons`.
- `release/2026-10-26`: the human confirmed `remove_member` (`TAL-14`), `header_controls_icons` (`TAL-27`),
  `ui_redesign` (`TAL-17`) and `toast_timing` (`TAL-38`) on `develop`; the four tickets moved to `done/`, release
  notes written for the group's users, and `develop` merged into `main` on the human's confirmation.
Checkpoint 3 (Developer track):
- [x] One skill + one hook merged (`release-checklist` on Day 07, `guard-answer-keys` on Day 09)
- [x] One MCP tool used end to end (Playwright: the merged `develop` driven in a real browser)
- [x] One review report acted on (the review of each merge request, fixed before the merge)
- [x] Role-day exercise done (web: create a group, add members and expenses, remove a member, switch language and
  theme, at 360px and 1280px)
Observations (positive / negative):
- The browser check on `develop` confirmed the conflict resolutions in use: removing a member who still owes money
  shows the error in the dialog and no toast; removing a settled member shows the toast and the reason.
- The theme options are labels over hidden radio inputs; a browser tool has to click the label, as a person does.
  The control works, but a click aimed at the input times out.
- A full-page screenshot draws a fixed bottom bar in the middle of the page. A viewport screenshot is the right
  check for fixed elements.
- The new logo pushed the theme control to a second row at 360px; only the e2e test that measures the header
  caught it. A layout rule written as a test survives later changes that a screenshot review would miss.
- A native `<select>` cannot show flags, so the language picker became a custom listbox. The review found the
  usual custom-widget gaps (Tab dropping focus to the page, touch scroll moving the highlight).
- Claude in Chrome drives the user's own browser, so cookies, console and network requests are those of a real
  session. Two agents could share the browser by each opening its own tab and leaving window size to one of them.
- `resize_window` reported success but the viewport stayed at the full screen width. Phone and tablet widths were
  checked inside a same-origin iframe of 360px and 800px instead, which applies the media queries but is not a real
  device. Hover was checked with dispatched pointer events. Phone layout still needs a check in device mode.
- Two suspected defects turned out to be test artifacts: a `fetch failed` from the dev server that passed on retry,
  and a toast sampled too late after the click. Both were cleared by repeating the step with better observation
  before anything was reported.
- Manual testing by agents found no defect after the automated suites passed; its value was in UX observations
  that no assertion covers.
For the retro:
- Custom widgets cost keyboard and screen reader work that the estimate should include.
- Reapplying work built on an older base needs a note on how each conflict was resolved; without it the reviewer
  cannot see where the risk is.
Open before the next day:
- [x] Test `header_controls_icons` and `ui_redesign` by hand on `develop` (phone and desktop, both themes)
- [x] Claude in Chrome: console logs and form fill on the training app
- [x] Check the phone layout in device mode (Claude in Chrome could not resize the viewport)
- [x] Course: start the AI-native SDLC playbook

## Day 12: 2026-10-27

Goal: capstone kickoff: intake of the vague feature brief, a ticket pack with Given/When/Then and open questions,
and a test matrix drafted from the criteria.
Left over from the previous day: none.
Shipped (merge requests, artifacts, screenshots):
- `docs/capstone_intake` merged: `google_sign_in` (`TAL-6`), `saved_bank_details` (`TAL-15`),
  `purge_inactive_groups` (`TAL-12`) and `lock_groups` (`TAL-10`) moved from `backlog/` to `todo/`. Each ticket has
  an analysis, clarifying questions with four rounds of answers, acceptance criteria in Given/When/Then (36 in
  total) and a test matrix drafted by Sonnet (QA tester) with 45 cases at API and e2e level.
- The rounds: the first questions came from the intake; round 2 from a zero-questions test, in which a subagent
  tried to plan each ticket from the ticket alone and listed what it still had to ask; round 3 from a second
  zero-questions test; round 4 from a review of the ticket pack against the current `develop` (link endpoint for an
  existing member, the header at 360px, saved bank details in `GET /api/me`, confirmation toasts, the place of the
  deletion date).
- `docs/design.md`: the planned migrations renumbered after the existing ones (`0003_activity_reset` to
  `0006_attachments`) and the designs aligned with the answers.
- `delete_account` (`TAL-40`) added to the backlog: raised by an answer in `saved_bank_details`, since saved bank
  details outlive the groups that are purged.
- `chore/daily-review-2026-10-26` merged from the scheduled GitHub routine: the ticket `e2e_runner_deps_install`
  (`TAL-39`). The two tickets created in parallel had both taken `TAL-39`; `delete_account` moved to `TAL-40` and
  the next free ID is `TAL-41`.
- `fix/e2e_runner_deps_install` (`TAL-39`) merged: the CI `e2e` job runs in the Playwright image of the locked
  version instead of installing system packages on every run, with a unit test that keeps the image tag equal to
  the lockfile version.
- Ticket reporters reworded: Opus plays the AI team lead, the human is the product owner. Feature tickets are
  reported by the product owner (human), technical tickets (tooling, CI, review findings) by Opus (AI team lead).
- `release/2026-10-27`: the human confirmed `e2e_runner_deps_install` (`TAL-39`); the ticket moved to `done/`,
  release notes written, and `develop` merged into `main` on the human's confirmation, tagged `v2026.10.27`.
- `release/2026-10-27-2`: the human tested `vietqr_code_style` (`TAL-41`) and `dialog_keyboard_focus` (`TAL-42`)
  on the Cloudflare deploy of `develop` and confirmed both; the tickets moved to `done/`.
Observations (positive / negative):
- The zero-questions test made the quality of a ticket measurable: each round produced fewer questions, and the
  remaining ones were about exact codes, ordering of checks and edge cases rather than the feature itself.
- Questions only through the tickets kept every decision in the repository; the developer on Day 13 does not need
  this conversation.
- Reviewing the pack against the current `develop` found gaps the intake could not see, because Day 11 had changed
  the header and added toasts after the tickets were first written.
- Two branches created on the same day picked the same ticket ID. A shared counter in `tickets/README.md` does not
  prevent this; a check on merge would.
- Pinning the runner image removed the CI annotations but turned a 22-second step into a 13-minute download; the
  side effect showed up only in the job duration, not as a failure.
- The role rename took two corrections: first every former product owner ticket went to the human, then to Opus,
  before the rule settled on the kind of ticket.
For the retro:
- A vague brief is answered faster by a test of the ticket (can someone plan from it?) than by more questions at
  intake.
- A rule about who reports a ticket should be written as a criterion (feature or technical), not as a list of
  names.
Open before the next day:
- [ ] Push `develop` and confirm the `e2e` job is green and takes about 2 to 3 minutes in the Playwright image
- [x] Day 13: build the capstone tickets in dependency order, starting with `google_sign_in`
- [ ] Course: finish the AI-native SDLC playbook

## Day 13: 2026-10-28

Goal: build the capstone tickets in dependency order and ship the tested ones.
Left over from the previous day: none.
Shipped (merge requests, artifacts, screenshots):
- Merged into `develop`, each through review by the AI team lead: `purge_inactive_groups` (`TAL-12`),
  `google_sign_in` (`TAL-6`), `saved_bank_details` (`TAL-15`), `lock_groups` (`TAL-10`), `joined_groups_list`
  (`TAL-8`) and `delete_account` (`TAL-40`), with migrations `0003` to `0006`.
- `release/2026-10-28`: the human tested the six tickets and `board_sync_url_argument` (`TAL-43`) on the Cloudflare
  deploy of `develop` and confirmed them; the tickets moved to `done/`.
Observations (positive / negative):
- A browser pass by a subagent on the deployed app confirmed what was visible, but most checks needed writes, a
  second person or a fake clock, so the human's own test remained the real confirmation.
- The group page does not refresh when another person joins or adds an expense; a live update design is noted for
  a future ticket.
For the retro:
- A browser test that may not write data covers presence, not behaviour.
Open before the next day:
- [ ] Push `develop`, `main` and the tag
- [ ] Day 14: port `owner_link_binds_account`, `transfer_ownership`, `join_as_account` and `member_email_invite`

## For the retro

-
