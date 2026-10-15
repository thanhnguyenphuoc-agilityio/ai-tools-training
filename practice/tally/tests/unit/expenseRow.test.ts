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
});
const members = [member('alex', 'Alex'), member('jamie', 'Jamie')];

describe('expense list row', () => {
  it('names the selected payer when someone else entered the expense', () => {
    expect(payerName({ payerId: 'jamie', createdBy: 'alex' }, members, '(unknown)')).toBe('Jamie');
  });

  it('names the payer when the payer entered the expense', () => {
    expect(payerName({ payerId: 'alex', createdBy: 'alex' }, members, '(unknown)')).toBe('Alex');
  });

  it('falls back when the member is not in the group', () => {
    expect(memberName(members, 'gone', '(unknown)')).toBe('(unknown)');
    expect(memberName(members, null, '(unknown)')).toBe('(unknown)');
  });
});
