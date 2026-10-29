export const meta = {
  name: 'ticket-batch-thorough',
  description: 'Ticket batch: Opus plan, Haiku build (Sonnet if Haiku fails), Sonnet review per ticket, Opus batch review, merge and e2e',
  whenToUse: 'A batch of approved tickets where each ticket deserves its own QA review before the lead merges',
  phases: [
    { title: 'Plan', model: 'opus' },
    { title: 'Build', model: 'haiku' },
    { title: 'Review', model: 'sonnet' },
    { title: 'Batch review', model: 'opus' },
  ],
}

// args: see ticket-batch-core.js ({ date, tickets: [{ name, id, branch, answers? }], ticketsDir?, chunkSize?, fixBranch?, e2ePort? }).
return await workflow('ticket-batch-core', { ...(args || {}), mode: 'thorough' })
