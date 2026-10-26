// Figures shown above the group tabs (ui_redesign): total spent, current members
// and the viewer's own balance. Pure, so it is unit tested without a browser.
import { computeBalances } from '../shared/settle';
import type { GroupDto } from '../shared/types';

export interface GroupSummary {
  total: number;
  members: number;
  /** The viewer's balance (positive: owed to them), or null for a visitor who has not joined. */
  myBalance: number | null;
}

export function groupSummary(group: Pick<GroupDto, 'members' | 'expenses' | 'transfers' | 'me'>): GroupSummary {
  const total = group.expenses.reduce((sum, e) => sum + e.amount, 0);
  const members = group.members.filter((m) => !m.removed).length;
  const myId = group.me.memberId;
  if (!myId) return { total, members, myBalance: null };
  const balances = computeBalances(group.members.map((m) => m.id), group.expenses, group.transfers);
  return { total, members, myBalance: balances.get(myId) ?? 0 };
}
