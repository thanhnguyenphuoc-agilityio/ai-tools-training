import { describe, expect, it } from 'vitest';
import type { MemberDto } from '../../shared/types';
import { involvesRemovedMember, memberName, payerName } from '../../src/expenseRow';

const member = (id: string, name: string): MemberDto => ({
  id,
  name,
  isOwner: false,
  claimed: true,
  bankBin: null,
  accountNo: null,
  accountName: null,
  removed: false,
  removedReason: null,
  bankSource: null,
  invited: false,
});
const members = [member('alex', 'Alex'), member('jamie', 'Jamie')];

describe('expense list row', () => {
  it('names the selected payer when someone else entered the expense', () => {
    const enteredByAlex = { payerId: 'jamie', createdBy: 'alex' };
    expect(payerName(enteredByAlex, members, '(unknown)')).toBe('Jamie');
  });

  it('names the payer when the payer entered the expense', () => {
    const enteredByPayer = { payerId: 'alex', createdBy: 'alex' };
    expect(payerName(enteredByPayer, members, '(unknown)')).toBe('Alex');
  });

  it('falls back when the member is not in the group', () => {
    expect(memberName(members, 'gone', '(unknown)')).toBe('(unknown)');
    expect(memberName(members, null, '(unknown)')).toBe('(unknown)');
  });
});

describe('expense that involves a removed member', () => {
  const withJamieRemoved = [member('alex', 'Alex'), { ...member('jamie', 'Jamie'), removed: true }];
  const expense = (payerId: string, shares: Record<string, number>) => ({
    payerId,
    shares: Object.entries(shares).map(([memberId, amount]) => ({ memberId, weight: 1, amount })),
  });

  it('is true when the payer was removed', () => {
    expect(involvesRemovedMember(expense('jamie', { alex: 100 }), withJamieRemoved)).toBe(true);
  });

  it('is true when a removed member owes a share', () => {
    expect(involvesRemovedMember(expense('alex', { alex: 50, jamie: 50 }), withJamieRemoved)).toBe(true);
  });

  it('is false when a removed member owes zero or is not in the expense', () => {
    expect(involvesRemovedMember(expense('alex', { alex: 100, jamie: 0 }), withJamieRemoved)).toBe(false);
    expect(involvesRemovedMember(expense('alex', { alex: 100 }), withJamieRemoved)).toBe(false);
  });
});
