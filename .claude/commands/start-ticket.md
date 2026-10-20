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
4. Read the ticket, `docs/business-rules.md` and the ticket's section in `docs/design.md`. Add `## Plan` to the
   ticket: the files to change, the tests to add (for a bug, the test that fails first), and the docs to update.
5. Show the plan and wait for approval. Do not commit and do not change any code before the human approves.
6. After approval, commit only the ticket move and the plan: `docs(tickets): start $ARGUMENTS with a plan`. If the
   human asks for changes, update the plan and show it again.
