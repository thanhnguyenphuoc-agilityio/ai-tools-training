import { describe, expect, it } from 'vitest';
import type { MemberDto } from '../../shared/types';
import { memberName, payerName } from '../../src/expenseRow';

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
