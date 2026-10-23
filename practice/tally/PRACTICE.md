# Practice guide

This is a personal project, so there is no real team. AI models play the other roles of a project team (see
"Simulated roles" in the repository README). The trainee plays one role at a time; each simulated role uses its own
chat thread.

| Thread | Simulated role |
|---|---|
| `Owner-sim` | Opus, product owner: business rules, priorities, acceptance |
| `User-sim` | Haiku (group member) and Gemini (group treasurer), end users |
| `Tester-sim` | Sonnet, QA tester |
| `Lead-sim` | Team lead: runs e2e, reviews and merges merge requests into `develop`, prepares releases to `main`; also seeds bugs and assesses the work |

The trainee is the final human check: features merged into `develop` wait in `tickets/ready-to-review/` until
the trainee has tested them by hand. Only then are they released to `main`.

## 0. Seeding: bugs the trainee does not know about (once, before Day 2)

The original plan assumes a lead has already seeded bugs. Here **a separate Claude Code session** plays the lead:

1. Open a new session in the Code tab on this repository, on branch `develop`.
2. Paste the prompt below. Approve the permission requests, **but do not read the diff or the session content**.
   Keep the diff pane collapsed and read only the final message.
3. Close the session. Do not reopen it and do not read `git log -p`.
4. Push `develop` (`git push origin develop`) without reading the diff, so that feature branches and merge requests
   start from the seeded code.

Seeding is one of the listed exceptions to the merge-request workflow (see `CLAUDE.md`): the lead commits directly
on `develop`.

The answer key is written **outside the repository** (`../tally-seeded-answers.md`, next to the repository folder)
and is never committed. It is opened only for self-assessment after the exercise.

### Prompt A: bugs for Day 2-3

```
You are the lead of a training course. This repository contains the app practice/tally (read README.md,
docs/business-rules.md, docs/design.md and tickets/README.md).
Seed 5 subtle bugs into the app, one of each kind:
1) money / rounding, 2) dates / time zones, 3) permissions, 4) configuration or environment, 5) data shown in the UI.
Requirements:
- Build, typecheck, `npm test` and `npm run e2e` must still pass. Prefer areas the existing tests do not cover. Do not delete tests.
- One commit per bug on develop, with ordinary-looking messages (refactor, tidy, perf...). Add 1 harmless commit.
- No comments, names or messages that hint at a bug.
- For each bug, write one ticket in tickets/backlog/ in the format of tickets/README.md, with a short snake_case
  file name that describes the symptom, labels `type::bug` and `source::seeded`, and a reporter that is either
  "Haiku (end user, group member)", "Gemini (end user, group treasurer)" or "Sonnet (QA tester)". The ticket says
  what the reporter did, saw and expected, in a neutral tone. No files, code or causes. One ticket may guess the
  cause wrongly. Commit the tickets in a separate commit.
- Write the answer key (ticket, file, line, kind, fix, test to write) to ../tally-seeded-answers.md, OUTSIDE the
  repository. Do not commit it.
- Do not push.
End the reply ONLY with the list of ticket files created. Do not summarise the changes.
```

### Prompt B: review branch for Day 10

```
You are the lead of a training course, preparing a code review exercise. From develop, create branch
seeded/review and implement tickets/backlog/remove_member.md (owner removes a member) in a reasonable way, with
tests. Inside that change, seed 4-6 bugs of different kinds that a reviewer should catch: a money logic error,
unvalidated input, a hard-coded FAKE secret, a missing permission check (policy.ts bypassed), a change outside the
ticket's scope, and a contradiction with docs/business-rules.md.
Use ordinary commit messages. Do not push. Write the answer key to ../tally-review-answers.md, OUTSIDE the
repository, and do not commit it.
End the reply ONLY with: "Branch ready."
```

### Conflict for Day 2-3

The conflict does not need to be a surprise. This exercise is an exception to the merge-request workflow (see
`CLAUDE.md`):
1. Create two branches from `develop`. Each changes the same line in `docs/business-rules.md` (for example the
   maximum amount) to a different value.
2. Merge the first branch, then merge the second and resolve the conflict.

## 1. Running the app and reproducing bugs

```bash
npm run dev           # http://localhost:5173
npm run seed          # (second terminal) creates a demo group and prints its link and owner recovery link
```

- Reproduce in the UI first. If that fails, call the API directly (DevTools, Network, Copy as fetch).
- QA habit: try the same case both ways and record any difference.
- Two people at once: one normal window and one private window. Cookies are separate, so they act as two devices.
- Time-related bugs: change the time zone in DevTools (Sensors, Location) or change the system clock.

## 2. Persona prompt (fill in the brackets)

```
You are [model name and role] in the Tally project (group expenses with VietQR). Stay in character.
You know the following but reveal it only when asked the right question: [hidden facts].
Be realistic: busy, sometimes vague, sometimes misremembering. Do not help more than a real person would.
When I type DEBRIEF, leave the role and assess me against: [criteria]. List what I missed first.
```

Suggested hidden facts:
- **Opus, product owner (`purge_inactive_groups`, `lock_groups`):** "In a year-long shared fund, people sometimes
  open the page to check the balance but nobody enters anything." The key question is whether viewing counts as
  activity.
- **Haiku, end user (`wrong_name_claim`):** "The name was claimed by another member who thought the button showed
  that person's details." This makes it a UX problem rather than an attack.
- **Sonnet, QA tester (`group_link_guessing`):** "I only read the code; I have not tried it."

## 3. Ticket map

| Ticket | Suggested role | Skill practised |
|---|---|---|
| Seeded bugs (`source::seeded`) | QA, then Dev | Reproduce vague bugs, locate the layer (config, code or data), write a failing test first |
| `exact_amount_split`, `language_picker`, `theme_picker`, `owner_member_tools` | Dev | Small tickets through the full ticket-to-MR loop (i18n, theme) |
| `group_link_guessing`, `wrong_name_claim` | Reviewer / Lead | Security basics; distinguishing a bug from a risky design |
| `remove_member`, `edit_expense` | BA | Unclear business rules: ask the right questions, write a spec |
| `csv_export` | Dev | Client-only work, encoding (UTF-8 BOM) |
| `ui_redesign` | Dev (+ design) | SCSS/BEM, responsive layout, dark/light themes. Before/after screenshots in the MR |
| `currency_conversion` | BA, then Dev | Currencies and exchange rates: settle rounding rules before coding |
| `google_sign_in`, `joined_groups_list`, `saved_bank_details` | Dev | Features with migrations, auth and external configuration (Google) |
| `purge_inactive_groups`, `lock_groups` | Dev + BA | Cron jobs, limits, hard deletes: settle the rules before coding |
| `receipt_photos`, `attendance_split` | Capstone | Larger features: R2, image processing, sessions past midnight |

## 4. Suggested 15-day schedule

Day 0 (preparation) ends when this repository, the app, the docs and the backlog are in place.

- **Day 1:** clean clone, run the app from the README, read `docs/` and `tickets/README.md`, start
  `TRAINING-LOG.md`. Run Prompt A in a separate session.
- **Day 2:** analyse the seeded bug tickets. Reproduce one bug and write the reproduction into its ticket. Write a
  failing test. Create the conflict.
- **Day 3:** fix that bug on a branch and open a merge request. Review it with the `review-checklist` skill.
  Resolve the conflict. *Checkpoint 1.*
- **Day 4-9:** one or two small tickets per day (`language_picker`, `theme_picker`, `exact_amount_split`,
  `csv_export`, remaining seeded bugs), plus practice with memory, skills, MCP and hooks on this repository.
- **Day 10:** run Prompt B, then review branch `seeded/review`. Assess the review against the answer key.
- **Day 11 (web):** `ui_redesign`. Add Playwright e2e tests and drive the app through the browser pane or Claude
  in Chrome.
- **Day 12-15 (capstone):** the product owner (Opus) wants `google_sign_in`, `saved_bank_details`,
  `purge_inactive_groups` and `lock_groups`. BA writes the spec, Dev implements, QA writes e2e tests, then a demo.

## 5. Completion checklist

- [ ] A reproduction written into a ticket
- [ ] A bug fixed on a branch, with a test that failed first
- [ ] A merge request that a stranger can review
- [ ] At least 3 actionable review comments
- [ ] A merge request merged and a conflict resolved
- [ ] At least one mistake in AI output caught by running the code
- [ ] Tickets moved through every status folder from `todo/` to `done/`
