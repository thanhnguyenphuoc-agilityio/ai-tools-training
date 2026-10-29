import { describe, expect, it } from 'vitest';
import type { MemberDto } from '../../shared/types';
import { involvesRemovedMember, memberName, payerName, sessionLabel } from '../../src/expenseRow';
import { createTranslator } from '../../src/i18n';

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
  hasAccount: false,
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

  it('does not depend on whether the expense was edited', () => {
    const edited = { ...expense('alex', { alex: 50, jamie: 50 }), editedAt: '2026-10-10T00:00:00.000Z' };
    expect(involvesRemovedMember(edited, withJamieRemoved)).toBe(true);
    const editedZero = { ...expense('alex', { alex: 100, jamie: 0 }), editedAt: '2026-10-10T00:00:00.000Z' };
    expect(involvesRemovedMember(editedZero, withJamieRemoved)).toBe(false);
  });
});

// expense_session_link: the shared label joins the formatted day, the time range and the next-day note.
describe('sessionLabel', () => {
  const { t, day } = createTranslator('en');

  it('joins the day and the time range of a session that ends the same day', () => {
    const label = sessionLabel({ day: '2026-10-29', startsAt: '19:00', endsAt: '21:00' }, t, day);
    expect(label).toBe(`${day('2026-10-29')} · 19:00 – 21:00`);
  });

  it('adds the next-day note when the session ends after midnight', () => {
    const label = sessionLabel({ day: '2026-10-29', startsAt: '21:00', endsAt: '00:30' }, t, day);
    expect(label).toBe(`${day('2026-10-29')} · 21:00 – 00:30 · (+1 day)`);
  });
});
