import { describe, expect, it } from 'vitest';
import { computeBalances, simplifyDebts } from '../../shared/settle';

describe('computeBalances', () => {
  it('credits the payer and debits each share', () => {
    const balances = computeBalances(
      ['a', 'b', 'c'],
      [{ payerId: 'a', amount: 300, shares: [{ memberId: 'a', amount: 100 }, { memberId: 'b', amount: 100 }, { memberId: 'c', amount: 100 }] }],
      [],
    );
    expect(Object.fromEntries(balances)).toEqual({ a: 200, b: -100, c: -100 });
  });

  it('counts confirmed transfers only', () => {
    const balances = computeBalances(
      ['a', 'b'],
      [{ payerId: 'a', amount: 200, shares: [{ memberId: 'a', amount: 100 }, { memberId: 'b', amount: 100 }] }],
      [
        { fromId: 'b', toId: 'a', amount: 60, status: 'confirmed' },
        { fromId: 'b', toId: 'a', amount: 40, status: 'sent' },
      ],
    );
    expect(Object.fromEntries(balances)).toEqual({ a: 40, b: -40 });
  });

  it('always sums to zero', () => {
    const balances = computeBalances(
      ['a', 'b', 'c'],
      [
        { payerId: 'a', amount: 1000, shares: [{ memberId: 'b', amount: 600 }, { memberId: 'c', amount: 400 }] },
        { payerId: 'c', amount: 90, shares: [{ memberId: 'a', amount: 45 }, { memberId: 'c', amount: 45 }] },
      ],
      [],
    );
    expect([...balances.values()].reduce((x, y) => x + y, 0)).toBe(0);
  });
});

describe('simplifyDebts', () => {
  it('settles everyone with at most n-1 transfers', () => {
    const balances = new Map([
      ['a', 150],
      ['b', -50],
      ['c', -50],
      ['d', -50],
    ]);
    const plan = simplifyDebts(balances);
    expect(plan).toHaveLength(3);
    expect(plan.every((t) => t.toId === 'a' && t.amount === 50)).toBe(true);
  });

  it('applies the plan and ends at zero', () => {
    const balances = new Map([
      ['a', 70],
      ['b', 30],
      ['c', -45],
      ['d', -55],
    ]);
    const after = new Map(balances);
    for (const t of simplifyDebts(balances)) {
      after.set(t.fromId, after.get(t.fromId)! + t.amount);
      after.set(t.toId, after.get(t.toId)! - t.amount);
    }
    expect([...after.values()].every((v) => v === 0)).toBe(true);
  });

  it('returns nothing when everyone is even', () => {
    expect(simplifyDebts(new Map([['a', 0], ['b', 0]]))).toEqual([]);
  });
});
