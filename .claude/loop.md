Maintenance pass for the Tally training repository. Work through these in order and stop at the first step that
has something to do. Follow `CLAUDE.md` throughout.

1. Continue any unfinished work from this conversation.
2. In `practice/tally/tickets/waiting-to-merge/`, take the oldest ticket and check out its branch in its own
   worktree. Run `npm run typecheck` and `npm test` in `practice/tally`. If anything fails, report the failure in
   one short paragraph with the first error, and fix it only if the fix is small and inside the ticket's scope.
3. In `practice/tally/tickets/in-progress/`, report tickets whose `## Plan` is missing or whose branch has no
   commit in the last day.
4. If nothing is pending, say so in one line.

Never push, never merge into `develop` or `main`, never commit on `develop`, and never read `tally-*-answers.md`.
