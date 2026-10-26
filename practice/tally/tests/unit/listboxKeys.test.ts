import { describe, expect, it } from 'vitest';
import { nextActiveIndex } from '../../src/components/listboxKeys';

// Keyboard rules of the header language menu (header_controls_icons).
describe('language menu keys', () => {
  it('moves down and up, wrapping at both ends', () => {
    expect(nextActiveIndex('ArrowDown', 0, 3)).toBe(1);
    expect(nextActiveIndex('ArrowDown', 2, 3)).toBe(0);
    expect(nextActiveIndex('ArrowUp', 1, 3)).toBe(0);
    expect(nextActiveIndex('ArrowUp', 0, 3)).toBe(2);
  });

  it('jumps to the first and last option', () => {
    expect(nextActiveIndex('Home', 2, 3)).toBe(0);
    expect(nextActiveIndex('End', 0, 3)).toBe(2);
  });

  it('leaves other keys to the caller', () => {
    for (const key of ['Enter', ' ', 'Escape', 'Tab', 'a']) expect(nextActiveIndex(key, 1, 3)).toBeNull();
  });

  it('has no active option in an empty list', () => {
    expect(nextActiveIndex('ArrowDown', 0, 0)).toBeNull();
  });
});
