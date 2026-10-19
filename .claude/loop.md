Maintenance pass for the Tally training repository. This pass only reports: it does not edit files, commit, move
tickets, push, merge, or delete branches or worktrees. Follow `CLAUDE.md` throughout. Do one step per pass and stop
at the first step that has something to report.

1. Continue unfinished work from this conversation, except anything that waits for the human's answer or needs
   confirmation under `CLAUDE.md` (a commit, a merge, a push).
2. Take the oldest ticket in `practice/tally/tickets/waiting-to-merge/` whose branch head has changed since the last
   report in this conversation. The branch is named in the ticket's `## Merge request` section (`feat/<ticket>` or
   `fix/<ticket>`). Use its worktree in `.scratch/wt/<branch with "/" replaced by "-">` if one exists; otherwise
   report that the branch has no worktree and stop. In that worktree, run `npm run typecheck` and `npm test` in
   `practice/tally`. Report pass or fail in one short paragraph with the first error; rerun once if an API test
   times out before calling it a failure.
3. Report tickets in `practice/tally/tickets/in-progress/` that have no `## Plan` section, or whose branch has had
   no commit for a day.
4. If nothing is pending, say so in one line.

Never read `tally-*-answers.md` or anything outside this repository.
