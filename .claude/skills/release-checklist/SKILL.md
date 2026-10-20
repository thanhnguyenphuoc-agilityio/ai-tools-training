---
name: release-checklist
description: Prepare a release of the training app from develop to main (workflow step 6 in practice/tally/tickets/README.md) - check that every ticket in ready-to-review is confirmed by the human, open release/<yyyy-mm-dd>, move tickets to done, write release notes, and stop before main until the human confirms. Use when asked to release, cut a release, prepare a release or merge develop into main.
---

# Release checklist (workflow step 6)

A release moves tested work from `develop` to `main`. `main` only ever contains features a human has tested, so
this checklist **stops and asks** at every point where a human decision is needed. Never merge into `main`, push,
or tag without the human's explicit confirmation in this conversation.

## 1. Preconditions (read only)

1. `git fetch` if a remote exists, then confirm `develop` is clean and up to date: `git status`, `git log -1 develop`.
2. List `practice/tally/tickets/ready-to-review/` and read each ticket's `## Review` section. Also list
   `practice/tally/tickets/todo/` and read any `## Feedback` section: a ticket the human rejected moves back to
   `todo/` with that section (see "Workflow" in `practice/tally/tickets/README.md`).
3. Ask the human which tickets they have tested and confirmed. Show the list with one line per ticket (title and
   what to check). Do not assume a ticket is confirmed because it is in `ready-to-review/`.
4. Stop unless **every** ticket in `ready-to-review/` is confirmed. An untested ticket blocks the release just
   like a rejected one, because its work is already on `develop` and would reach `main` with it. For each
   rejected ticket (in `todo/` with `## Feedback`), its work must be fixed or reverted on `develop` through a merge
   request before the release; if it is not, stop. A release never ships with an unconfirmed ticket on `develop`.
5. Run the full checks on `develop` inside `practice/tally`: `npm run typecheck`, `npm test`, `npm run e2e`.
   Report the counts. If anything fails, stop.

## 2. Release branch

1. `git switch -c release/<yyyy-mm-dd> develop` (today's date in the human's time zone).
2. `git mv` every ticket from `tickets/ready-to-review/` (all confirmed in step 1.4) to `tickets/done/`. Add a line
   `Released in release/<yyyy-mm-dd>.` under its `## Review` section.
3. Write release notes for the group's users (not developers) into the merge request description, grouped as
   "New", "Fixed" and "Known questions" (open questions from `docs/business-rules.md` touched by this release).
   Plain language, no file names, one line per ticket.
4. Append the release to the day's entry in `TRAINING-LOG.md` (shipped: release branch, tickets, notes). Append
   only; past days are never rewritten. This happens here because nothing is committed to `develop` or `main`
   directly after the merges. If the day's entry is still on an open `docs/day-NN-log` branch, either merge that
   branch into `develop` first (and start the release branch after it), or add the release lines on that log
   branch instead of here, so the two branches do not both insert before `## For the retro`.
5. Show the staged changes and, once the human confirms, commit on the release branch:
   `chore(release): release <yyyy-mm-dd>` (Conventional Commits, no `Co-Authored-By` trailer).

## 3. Merges (human confirmation required for each)

1. Merge request `release/<yyyy-mm-dd>` -> `develop`. Ask before merging.
2. Merge request `develop` -> `main`. Show `git log --oneline main..develop` and the release notes, then ask:
   "Merge develop into main?" Merge only on an explicit yes.
3. Optionally tag `v<yyyy.mm.dd>` on `main` and deploy (`docs/design.md`, section 8), each only when asked.

## 4. After the release

- Ask the human whether to delete `release/<yyyy-mm-dd>`, or leave it to the "Delete source branch" option of the
  GitLab merge request. Never delete a branch without asking.
- If the log entry needs a later correction, make it on the day's `docs/day-NN-log` branch, never on `develop`.

## Output

End with a short status: tickets released, checks run (with counts), merge requests opened or merged, and what is
waiting for the human.
