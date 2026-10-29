export const meta = {
  name: 'ticket-batch-fast',
  description: 'Ticket batch: Opus plan, Haiku build (Sonnet if Haiku fails), Opus review per chunk of up to 6 tickets, merge and e2e',
  whenToUse: 'A batch of approved tickets when speed matters; no per-ticket Sonnet review, one Opus reviewer per 6 tickets',
  phases: [
    { title: 'Plan', model: 'opus' },
    { title: 'Build', model: 'haiku' },
    { title: 'Batch review', model: 'opus' },
    { title: 'Integrate', model: 'opus' },
  ],
}

// args: see ticket-batch-core.js ({ date, tickets: [{ name, id, branch, answers? }], ticketsDir?, chunkSize?, fixBranch?, e2ePort? }).
return await workflow('ticket-batch-core', { ...(args || {}), mode: 'fast' })
