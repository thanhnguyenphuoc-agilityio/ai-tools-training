import { describe, expect, it } from 'vitest';
import { CODE_ALPHABET, generateGroupCode, GROUP_CODE_RE, normalizeGroupCode } from '../../shared/groupCode';

describe('generateGroupCode', () => {
  it('produces xxxx-xxxx-xxxx from the safe alphabet', () => {
    for (let i = 0; i < 200; i++) expect(generateGroupCode()).toMatch(GROUP_CODE_RE);
  });

  it('never uses look-alike characters', () => {
    expect(CODE_ALPHABET).not.toMatch(/[01ilo]/);
    expect(CODE_ALPHABET).toHaveLength(31);
  });

  it('does not repeat in a small sample', () => {
    const codes = new Set(Array.from({ length: 1000 }, generateGroupCode));
    expect(codes.size).toBe(1000);
  });
});

describe('normalizeGroupCode', () => {
  it.each([
    ['x7kq-m2pz-9hfw', 'x7kq-m2pz-9hfw'],
    ['X7KQ M2PZ 9HFW', 'x7kq-m2pz-9hfw'],
    ['x7kqm2pz9hfw', 'x7kq-m2pz-9hfw'],
    ['https://tally.example.workers.dev/g/x7kq-m2pz-9hfw#owner=abc', 'x7kq-m2pz-9hfw'],
  ])('normalizes %s', (input, expected) => {
    expect(normalizeGroupCode(input)).toBe(expected);
  });

  it.each(['', 'x7kq-m2pz', 'o7kq-m2pz-9hfw', 'x7kq-m2pz-9hfw-aaaa'])('rejects %s', (input) => {
    expect(normalizeGroupCode(input)).toBeNull();
  });
});
