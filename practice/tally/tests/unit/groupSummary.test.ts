import { describe, expect, it } from 'vitest';
import type { ExpenseDto, MemberDto, TransferDto } from '../../shared/types';
import { groupSummary } from '../../src/groupSummary';

// Figures above the group tabs (ui_redesign). Fake data only.
const member = (id: string, extra: Partial<MemberDto> = {}): MemberDto => ({
  id,
  name: id,
  isOwner: false,
  claimed: true,
  removed: false,
  removedReason: null,
  left: false,
  bankBin: null,
  accountNo: null,
  accountName: null,
  bankSource: null,
  hasAccount: false,
  invited: false,
  ...extra,
});

const expense = (payerId: string, amount: number, shares: [string, number][]): ExpenseDto => ({
  id: `e-${payerId}-${amount}`,
  payerId,
  amount,
  description: 'Dinner',
  spentOn: '2026-10-19',
  splitMode: 'equal',
  shares: shares.map(([memberId, a]) => ({ memberId, weight: 1, amount: a })),
  createdBy: payerId,
  createdAt: '2026-10-19T12:00:00Z',
  editedAt: null,
  receipt: null,
  sessionId: null,
  hiddenAt: null,
  paidToward: false,
});

const transfer = (fromId: string, toId: string, amount: number, status: TransferDto['status']): TransferDto => ({
  id: `t-${fromId}-${toId}`,
  fromId,
  toId,
  amount,
  status,
  createdAt: '2026-10-19T13:00:00Z',
  confirmedAt: status === 'confirmed' ? '2026-10-19T14:00:00Z' : null,
});

const members = [member('alex'), member('sam'), member('jamie')];
const dinner = expense('alex', 300_000, [
  ['alex', 100_000],
  ['sam', 100_000],
  ['jamie', 100_000],
]);
const group = (memberId: string | null, transfers: TransferDto[] = []) => ({
  members,
  expenses: [dinner],
  transfers,
  me: { memberId, isOwner: memberId === 'alex', accountLinked: false },
});

describe('group summary', () => {
  it('totals the expenses and counts current members', () => {
    const s = groupSummary(group('alex'));
    expect(s.total).toBe(300_000);
    expect(s.members).toBe(3);
  });

  it('gives the payer a positive balance and a participant a negative one', () => {
    expect(groupSummary(group('alex')).myBalance).toBe(200_000);
    expect(groupSummary(group('sam')).myBalance).toBe(-100_000);
  });

  it('counts only confirmed transfers, so a member is settled once the receiver confirms', () => {
    expect(groupSummary(group('sam', [transfer('sam', 'alex', 100_000, 'sent')])).myBalance).toBe(-100_000);
    expect(groupSummary(group('sam', [transfer('sam', 'alex', 100_000, 'confirmed')])).myBalance).toBe(0);
  });

  it('has no balance for a visitor who has not joined', () => {
    expect(groupSummary(group(null)).myBalance).toBeNull();
  });

  it('leaves removed members out of the count but keeps their expenses in the total', () => {
    const s = groupSummary({ ...group('alex'), members: [...members, member('riley', { removed: true })] });
    expect(s.members).toBe(3);
    expect(s.total).toBe(300_000);
  });
});
