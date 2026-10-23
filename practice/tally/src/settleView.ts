// What the settle-up panel shows, kept out of the component so it can be unit tested.
import { computeBalances, simplifyDebts, type Settlement } from '../shared/settle';
import type { GroupDto, MemberDto } from '../shared/types';

export interface SettleView {
  balances: Map<string, number>;
  /** Members who have not been removed: the only ones listed and the only ones a transfer can name. */
  activeMembers: MemberDto[];
  /** Suggested transfers between current members only (the API refuses a transfer naming a removed member). */
  plan: Settlement[];
  /** Removed members whose balance is not zero; the rules prevent this, but the panel says so instead of hiding it. */
  removedWithBalance: MemberDto[];
}

export function settleView(group: Pick<GroupDto, 'members' | 'expenses' | 'transfers'>): SettleView {
  const balances = computeBalances(
    group.members.map((m) => m.id),
    group.expenses,
    group.transfers,
  );
  const activeMembers = group.members.filter((m) => !m.removed);
  const activeIds = new Set(activeMembers.map((m) => m.id));
  const plan = simplifyDebts(new Map([...balances].filter(([id]) => activeIds.has(id))));
  const removedWithBalance = group.members.filter((m) => m.removed && (balances.get(m.id) ?? 0) !== 0);
  return { balances, activeMembers, plan, removedWithBalance };
}
