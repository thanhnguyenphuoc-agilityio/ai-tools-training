---
description: Start work on a ticket - branch from develop, move the ticket to in-progress, and write the plan
argument-hint: <ticket_name>
---

Start work on the ticket `$ARGUMENTS` in `practice/tally/tickets/`.

1. Normalise `$ARGUMENTS` to a bare ticket name: drop a trailing `.md` and any folder path (for example
   `tickets/todo/csv_export.md` becomes `csv_export`). Use that name wherever `$ARGUMENTS` appears below. If it is
   empty, list the tickets in `tickets/todo/` and ask which one to start; do nothing else.
2. Find `$ARGUMENTS.md` in the status folders:
   - Not found: stop and list the tickets in `tickets/todo/` with names close to `$ARGUMENTS`.
   - In `in-progress/`: stop. Report the ticket's `Assignee` and whether a `feat/` or `fix/` branch for it exists;
     offer to continue on that branch instead of starting again.
   - In `waiting-to-merge/`, `ready-to-review/` or `done/`: stop and report the status; the ticket is past this
     step.
   - In `backlog/` and not a bug: stop. It must be clarified first (`## Analysis`, `## Clarifying questions`,
     `## Answers`).
   - Otherwise (`todo/`, or a bug in `backlog/`, for example a seeded bug): continue.
3. Choose the branch name: `fix/$ARGUMENTS` for `type::bug` or for a rejected ticket (one with `## Feedback`),
   otherwise `feat/$ARGUMENTS`. Create it from an up-to-date `develop`. If the session should keep the main
   checkout free, use a git worktree under `.scratch/wt/<branch-with-dash>` instead of switching branches.
4. `git mv` the ticket to `tickets/in-progress/` and set `Assignee` to `Haiku (developer)`.
5. Read the ticket, `docs/business-rules.md` and the ticket's section in `docs/design.md`. For a `type::bug`
   ticket, add `## Reproduce` (steps, expected and actual result) and `## Analysis` (likely cause and affected
   code) if they are missing, as `tickets/README.md` requires; seeded bugs may come straight from `backlog/`
   without either.
6. Add `## Plan` to the ticket: the files to change, the tests to add (for a bug, the test that fails first), and
   the docs to update.
7. Show the plan (and, for a bug, the reproduction and analysis) and wait for approval. Do not commit and do not
   change any code before the human approves.
8. After approval, commit only the ticket move and the new ticket sections:
   `docs(tickets): start $ARGUMENTS with a plan`. If the human asks for changes, update the ticket and show it
   again.
9. If the human rejects the plan or decides not to start the ticket, the branch from step 3 and the move from
   step 4 already exist but nothing is committed. Offer to undo both: restore the ticket to its previous folder
   and content, switch back to `develop` (or remove the worktree), and delete the new branch. Do each only after
   the human agrees.
