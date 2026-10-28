import { describe, expect, it } from 'vitest';
import {
  EXPIRY_WARNING_HOURS,
  expiresAt,
  INACTIVE_DAYS,
  INACTIVE_MS,
  inactiveBefore,
  isExpiringSoon,
} from '../../shared/rules';

describe('shared/rules', () => {
  it('constants match requirements', () => {
    expect(INACTIVE_DAYS).toBe(10);
    expect(INACTIVE_MS).toBe(10 * 24 * 60 * 60 * 1000);
    expect(EXPIRY_WARNING_HOURS).toBe(72);
  });

  it('expiresAt adds exactly 10 days', () => {
    const lastActivity = '2026-10-01T12:00:00.000Z';
    const expected = '2026-10-11T12:00:00.000Z';
    expect(expiresAt(lastActivity)).toBe(expected);
  });

  it('inactiveBefore computes cutoff 10 days before now', () => {
    const now = new Date('2026-10-15T02:00:00.000Z');
    const expectedCutoff = '2026-10-05T02:00:00.000Z';
    expect(inactiveBefore(now)).toBe(expectedCutoff);
  });

  it('isExpiringSoon correctly detects warning window around 72 hours', () => {
    const exp = '2026-10-15T12:00:00.000Z';
    const expMs = Date.parse(exp);

    // 72h + 1 minute before expiry: false
    const at72hPlus1m = new Date(expMs - (72 * 60 + 1) * 60 * 1000);
    expect(isExpiringSoon(exp, at72hPlus1m)).toBe(false);

    // exactly 72h before expiry: true
    const at72h = new Date(expMs - 72 * 60 * 60 * 1000);
    expect(isExpiringSoon(exp, at72h)).toBe(true);

    // 71h before expiry: true
    const at71h = new Date(expMs - 71 * 60 * 60 * 1000);
    expect(isExpiringSoon(exp, at71h)).toBe(true);
  });
});
