import { describe, expect, it } from 'vitest';
import { isPaidToward } from '../../shared/expenseLock';

// isPaidToward (TAL-61): a transfer at or after the expense's createdAt, involving its payer or a member with a share
// above zero, on either side. Shares of zero do not count.
const expense = (payerId: string, shares: [string, number][], createdAt = '2026-10-10T10:00:00.000Z') => ({
  payerId,
  createdAt,
  shares: shares.map(([memberId, amount]) => ({ memberId, weight: 1, amount })),
});
const transfer = (fromId: string, toId: string, createdAt: string) => ({ fromId, toId, createdAt });

describe('isPaidToward', () => {
  const sam = 'sam';
  const alex = 'alex';
  const jamie = 'jamie';
  const base = expense(sam, [
    [sam, 150_000],
    [alex, 150_000],
  ]);

  it('is false with no transfers', () => {
    expect(isPaidToward(base, [])).toBe(false);
  });

  it('is true for a transfer strictly after the expense', () => {
    expect(isPaidToward(base, [transfer(alex, sam, '2026-10-10T10:00:01.000Z')])).toBe(true);
  });

  it('is true when the transfer has the same timestamp as the expense (boundary)', () => {
    expect(isPaidToward(base, [transfer(alex, sam, '2026-10-10T10:00:00.000Z')])).toBe(true);
  });

  it('is false for a transfer recorded before the expense', () => {
    expect(isPaidToward(base, [transfer(alex, sam, '2026-10-10T09:59:59.999Z')])).toBe(false);
  });

  it('counts the payer on the receiver side of a transfer', () => {
    // Alex (a sharer) pays Sam (the payer): Sam is the receiver, and the payer is involved.
    expect(isPaidToward(base, [transfer(alex, sam, '2026-10-10T11:00:00.000Z')])).toBe(true);
  });

  it('counts the payer on the sender side of a transfer', () => {
    expect(isPaidToward(base, [transfer(sam, alex, '2026-10-10T11:00:00.000Z')])).toBe(true);
  });

  it('counts a sharer on the receiver side of a transfer (payer not involved)', () => {
    const shared = expense(sam, [
      [sam, 100_000],
      [jamie, 100_000],
    ]);
    expect(isPaidToward(shared, [transfer(alex, jamie, '2026-10-10T11:00:00.000Z')])).toBe(true);
  });

  it('ignores a transfer between two members not in the expense', () => {
    const riley = 'riley';
    expect(isPaidToward(base, [transfer(jamie, riley, '2026-10-10T11:00:00.000Z')])).toBe(false);
  });

  it('ignores a member with a zero share, even when they are part of the transfer', () => {
    const exact = expense(sam, [
      [sam, 100_000],
      [alex, 0],
    ]);
    expect(isPaidToward(exact, [transfer(alex, jamie, '2026-10-10T11:00:00.000Z')])).toBe(false);
  });

  it('still counts a payer with a zero share of their own', () => {
    // The payer is always involved, whatever their share.
    const payerZero = expense(sam, [
      [alex, 100_000],
      [sam, 0],
    ]);
    expect(isPaidToward(payerZero, [transfer(sam, jamie, '2026-10-10T11:00:00.000Z')])).toBe(true);
  });

  it('uses the stored createdAt string as text (ISO strings compare correctly)', () => {
    expect(isPaidToward(base, [transfer(alex, sam, '2026-10-10T10:00:00.001Z')])).toBe(true);
    expect(isPaidToward(base, [transfer(alex, sam, '2026-10-09T23:59:59.999Z')])).toBe(false);
  });
});
