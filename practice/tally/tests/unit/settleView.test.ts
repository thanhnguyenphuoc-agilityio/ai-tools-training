import { describe, expect, it } from 'vitest';
import type { ExpenseDto, MemberDto } from '../../shared/types';
import { settleView } from '../../src/settleView';

const member = (id: string, removed = false): MemberDto => ({
  id,
  name: id,
  isOwner: false,
  claimed: true,
  bankBin: null,
  accountNo: null,
  accountName: null,
  removed,
  removedReason: removed ? 'Moved out' : null,
  bankSource: null,
  hasAccount: false,
  invited: false,
});
const expense = (payerId: string, shares: Record<string, number>): ExpenseDto => ({
  id: crypto.randomUUID(),
  payerId,
  amount: Object.values(shares).reduce((a, b) => a + b, 0),
  description: 'Utilities',
  spentOn: '2026-10-10',
  splitMode: 'exact',
  shares: Object.entries(shares).map(([memberId, amount]) => ({ memberId, weight: 1, amount })),
  createdBy: payerId,
  createdAt: '2026-10-10T10:00:00.000Z',
  editedAt: null,

  receipt: null,
});

describe('settle view', () => {
  it('suggests transfers between current members', () => {
    const view = settleView({
      members: [member('alex'), member('sam')],
      expenses: [expense('alex', { alex: 50, sam: 50 })],
      transfers: [],
    });
    expect(view.plan).toEqual([{ fromId: 'sam', toId: 'alex', amount: 50 }]);
    expect(view.removedWithBalance).toEqual([]);
  });

  it('never suggests a transfer to or from a removed member', () => {
    const view = settleView({
      members: [member('alex'), member('sam'), member('jamie', true)],
      expenses: [expense('jamie', { alex: 30, sam: 30 })],
      transfers: [],
    });
    expect(view.plan).toEqual([]);
    expect(view.activeMembers.map((m) => m.id)).toEqual(['alex', 'sam']);
    expect(view.removedWithBalance.map((m) => m.id)).toEqual(['jamie']);
  });

  it('keeps the suggestions between current members when a removed member has a balance', () => {
    const view = settleView({
      members: [member('alex'), member('sam'), member('jamie', true)],
      expenses: [expense('alex', { alex: 10, sam: 40, jamie: 20 })],
      transfers: [],
    });
    expect(view.plan).toEqual([{ fromId: 'sam', toId: 'alex', amount: 40 }]);
  });
});
