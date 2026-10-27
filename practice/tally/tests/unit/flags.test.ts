import { describe, expect, it } from 'vitest';
import { LOCALES, localeOptions } from '../../src/i18n';

// The header menu shows each language by its own name; the human asked for these two
// (header_controls_icons). A new locale also needs a flag in src/components/Flag.tsx (type-checked).
describe('language menu entries', () => {
  it('names each language in itself', () => {
    expect(localeOptions()).toEqual([
      { value: 'vi', label: 'Tiếng Việt' },
      { value: 'en', label: 'English' },
    ]);
    expect(Object.keys(LOCALES)).toEqual(['vi', 'en']);
  });
});
