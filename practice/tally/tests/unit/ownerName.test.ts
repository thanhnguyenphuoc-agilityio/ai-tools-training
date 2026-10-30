import { describe, expect, it } from 'vitest';
import { createOwnerName } from '../../src/ownerName';

// "Nguy\u1ec5n Minh" with diacritics, written as escapes.
const VI_ACCOUNT = 'Nguy\u1ec5n Minh';

describe('createOwnerName', () => {
  it('signed out: shows the typed value, unlocked', () => {
    expect(createOwnerName(undefined, false, 'Sam')).toEqual({ value: 'Sam', locked: false });
  });

  it('signed in with the box unchecked: shows the account name, locked', () => {
    expect(createOwnerName('Sam Kim', false, 'ignored typed text')).toEqual({ value: 'Sam Kim', locked: true });
  });

  it('signed in with the box checked: shows the typed value, unlocked', () => {
    expect(createOwnerName('Sam Kim', true, 'Sam')).toEqual({ value: 'Sam', locked: false });
  });

  it('cuts an account name longer than 40 characters to 40', () => {
    const long = 'A'.repeat(41);
    expect(createOwnerName(long, false, '')).toEqual({ value: 'A'.repeat(40), locked: true });
  });

  it('blank account name: shows the typed value, unlocked', () => {
    expect(createOwnerName('', false, 'Sam')).toEqual({ value: 'Sam', locked: false });
    expect(createOwnerName('   ', false, 'Sam')).toEqual({ value: 'Sam', locked: false });
  });

  it('keeps a Vietnamese account name with diacritics', () => {
    expect(createOwnerName(VI_ACCOUNT, false, '')).toEqual({ value: VI_ACCOUNT, locked: true });
  });
});
