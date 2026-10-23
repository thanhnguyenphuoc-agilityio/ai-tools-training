// Balances and settle-up suggestions. Pure functions, shared by API and UI.

export interface ExpenseLike {
  payerId: string;
  amount: number;
  shares: { memberId: string; amount: number }[];
}

export interface TransferLike {
  fromId: string;
  toId: string;
  amount: number;
  status: 'sent' | 'confirmed';
}

export interface Settlement {
  fromId: string;
  toId: string;
  amount: number;
}

/**
 * Balance per member: positive = the group owes them, negative = they owe.
 * Only confirmed transfers count; a "sent" transfer is a claim, not money received.
 */
export function computeBalances(
  memberIds: string[],
  expenses: ExpenseLike[],
  transfers: TransferLike[],
): Map<string, number> {
  const balances = new Map<string, number>(memberIds.map((id) => [id, 0]));
  const add = (id: string, delta: number) => balances.set(id, (balances.get(id) ?? 0) + delta);

  for (const e of expenses) {
    add(e.payerId, e.amount);
    for (const s of e.shares) add(s.memberId, -s.amount);
  }
  for (const t of transfers) {
    if (t.status !== 'confirmed') continue;
    add(t.fromId, t.amount);
    add(t.toId, -t.amount);
  }
  return balances;
}

/**
 * Greedy settle-up: sort debtors and creditors by amount once, then pair them
 * in order, each transfer settling as much as possible. Produces at most n-1
 * transfers. Ties are broken by member id so the result is stable between page loads.
 */
export function simplifyDebts(balances: Map<string, number>): Settlement[] {
  const byAmountThenId = (a: [string, number], b: [string, number]) => b[1] - a[1] || a[0].localeCompare(b[0]);
  const creditors = [...balances].filter(([, v]) => v > 0).sort(byAmountThenId);
  const debtors = [...balances]
    .filter(([, v]) => v < 0)
    .map(([id, v]): [string, number] => [id, -v])
    .sort(byAmountThenId);

  const result: Settlement[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(debtors[i][1], creditors[j][1]);
    result.push({ fromId: debtors[i][0], toId: creditors[j][0], amount });
    debtors[i][1] -= amount;
    creditors[j][1] -= amount;
    if (debtors[i][1] === 0) i++;
    if (creditors[j][1] === 0) j++;
  }
  return result;
}
