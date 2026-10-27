---
description: Mirror the ticket board in practice/tally/tickets onto the GitHub Projects board
argument-hint: [project url] [--repo owner/name]
---

Sync the ticket board in `practice/tally/tickets/` to the GitHub Projects (v2) board in `$ARGUMENTS`. The
repository is the source of truth; the board only mirrors it.

1. Take the project URL and an optional `--repo <owner>/<name>` from `$ARGUMENTS`. Fall back to `TALLY_BOARD_URL`
   and `TALLY_BOARD_REPO`. If there is still no project URL, ask for it and do nothing else. With a repository the
   tickets are issues there (they can take comments); without one they are draft items.
2. Check that `GITHUB_TOKEN` is set, without printing it; on Windows it may only be in the user environment, so
   read it from there for the command. If it is missing, ask the human to set it to a token with the `project`
   scope, plus `repo` (or `public_repo` for a public repository) when a repository is used. Never ask for the token
   value in chat and never write it to a file.
3. Inside `practice/tally`, run the dry run: `npm run board:sync -- <url> [--repo <owner>/<name>]`. Show the plan
   in short form: new fields, missing options, created, converted and updated tickets, and board items that are not
   in the repository.
4. If it lists `MISSING` options, the board has a field with that name but without the option. Tell the human
   which options to add in the project settings on GitHub, then run the dry run again.
5. Ask whether to apply. Before the first conversion, say that drafts turned into issues cannot be turned back,
   and whether the repository is public. Only after a clear yes, run the same command with `--apply` and report
   the result.
6. Never move, edit or commit tickets in the repository as part of this command; status changes and comments on
   GitHub are not copied back.
