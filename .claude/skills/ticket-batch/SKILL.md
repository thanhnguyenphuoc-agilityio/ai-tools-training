---
name: ticket-batch
description: Implement several tickets at once with the saved ticket-batch workflows (Opus plan, Haiku builds, review, merge into develop, e2e). Use when asked to implement, build, fix or port two or more tickets together, a batch of tickets, or all tickets in todo.
---

# Ticket batch

Runs a batch of tickets through `.claude/workflows/ticket-batch-thorough.js` or `ticket-batch-fast.js` (both call
`ticket-batch-core.js`). The user's request to implement the tickets is the opt-in for the Workflow tool; do not
ask again unless something below is unclear.

## 1. Collect the tickets

1. Normalise each name the user gives (drop `.md` and folders). "All tickets in todo" means every file in
   `practice/tally/tickets/todo/`.
2. Find each ticket. It must be in `todo/`, or be a `type::bug` in `backlog/`, or be an approved draft in a folder
   the user names (pass it as `ticketsDir`). Stop and report any ticket that is in another folder, or a non-bug in
   `backlog/` that has no `## Answers` (it needs clarifying first, see `tickets/README.md`).
3. Read each ticket's `ID` and labels. Branch: `fix/<name>` for `type::bug` or a ticket with `## Feedback`,
   otherwise `feat/<name>`. Answers the user gives in chat for a ticket's clarifying questions go into `answers`.
4. Merge order: bugs with `priority::high` first, then tickets others depend on (`Depends on`), then small changes
   before large ones. Keep the user's order if they gave one.

## 2. Choose the shape

- `ticket-batch-thorough` (default): Opus plans the batch; Haiku builds each ticket with unit and API tests
  (Sonnet takes over only when Haiku fails); Sonnet reviews and fixes each ticket as soon as it is built; one Opus
  lead reviews the batch, merges into `develop` and runs the full e2e suite.
- `ticket-batch-fast`: when the user asks for speed, says it is urgent, or says to skip the Sonnet review. No
  per-ticket Sonnet review; one Opus reviewer per chunk of up to 6 tickets, then one Opus lead merges and runs e2e.

## 3. Preconditions

- The main checkout is on `develop` with a clean tree (untracked `.scratch/` and `test-results/` are fine). No
  other batch workflow is running.
- Use today's date in the user's time zone for `date`.

## 4. Run

Call the Workflow tool with `name` set to the chosen workflow and `args`:

```json
{
  "date": "yyyy-mm-dd",
  "tickets": [{ "name": "ticket_name", "id": "TAL-n", "branch": "feat/ticket_name", "answers": "optional" }],
  "ticketsDir": "optional",
  "chunkSize": 6
}
```

Tell the user in two or three lines which tickets run, in which merge order, and which shape. Do not wait while it
runs; a notification arrives when it finishes.

## 5. Report

1. Read the result (or `journal.jsonl` in the run's transcript folder if it is cut off).
2. Verify with git: `git log --format='%h %an <%ae> %ad %s' <baseCommit>..develop` for authors and dates, the
   tickets in `tickets/ready-to-review/`, and a clean `develop`.
3. Report: plan risks, which builds needed Sonnet, review findings and fixes per ticket, the `develop` head, check
   counts, open issues, and what waits for the human (testing the tickets, pushing `develop`). Never push.
