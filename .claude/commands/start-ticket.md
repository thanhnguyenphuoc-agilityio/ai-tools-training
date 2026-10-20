---
description: Start work on a ticket - branch from develop, move the ticket to in-progress, and write the plan
argument-hint: <ticket_name>
---

Start work on the ticket `$ARGUMENTS` in `practice/tally/tickets/`.

1. Find `$ARGUMENTS.md` in `tickets/todo/` (or `tickets/backlog/` for a seeded bug). If it is in `backlog/` and is
   not a bug, stop: it must be clarified first (`## Analysis`, `## Clarifying questions`, `## Answers`).
2. Choose the branch name: `fix/$ARGUMENTS` for `type::bug`, otherwise `feat/$ARGUMENTS`. Create it from an
   up-to-date `develop`. If the session should keep the main checkout free, use a git worktree under
   `.scratch/wt/<branch-with-dash>` instead of switching branches.
3. `git mv` the ticket to `tickets/in-progress/` and set `Assignee` to `Developer (trainee)`.
4. Read the ticket, `docs/business-rules.md` and the ticket's section in `docs/design.md`. For a `type::bug`
   ticket, add `## Reproduce` (steps, expected and actual result) and `## Analysis` (likely cause and affected
   code) if they are missing, as `tickets/README.md` requires; seeded bugs may come straight from `backlog/`
   without either.
5. Add `## Plan` to the ticket: the files to change, the tests to add (for a bug, the test that fails first), and
   the docs to update.
6. Show the plan (and, for a bug, the reproduction and analysis) and wait for approval. Do not commit and do not
   change any code before the human approves.
7. After approval, commit only the ticket move and the new ticket sections:
   `docs(tickets): start $ARGUMENTS with a plan`. If the human asks for changes, update the ticket and show it
   again.
