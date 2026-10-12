import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../shared/errors';
import { enLocale } from '../../src/i18n/locales/en';
import { viLocale } from '../../src/i18n/locales/vi';

const LOCALES = { en: enLocale, vi: viLocale };

// Every dot path to a string leaf, without plural categories (languages use
// different ones, e.g. Vietnamese only has "other").
function keys(node: unknown, prefix = ''): string[] {
  if (typeof node === 'string') return /\.(zero|one|two|few|many)$/.test(prefix) ? [] : [prefix];
  return Object.entries(node as Record<string, unknown>).flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k));
}

describe('locales', () => {
  it.each(Object.entries(LOCALES))('%s has exactly the keys of en', (_, bundle) => {
    expect(keys(bundle.messages).sort()).toEqual(keys(enLocale.messages).sort());
  });

  it.each(Object.entries(LOCALES))('%s translates every API error code', (_, bundle) => {
    for (const code of ERROR_CODES) expect(bundle.messages.errors[code]).toBeTruthy();
  });

  it.each(Object.entries(LOCALES))('%s keeps the same {placeholders} as en', (_, bundle) => {
    const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(',');
    const get = (root: unknown, path: string) => path.split('.').reduce((n, p) => (n as Record<string, unknown>)[p], root) as string;
    for (const key of keys(enLocale.messages)) {
      expect(placeholders(get(bundle.messages, key)), key).toBe(placeholders(get(enLocale.messages, key)));
    }
  });
});
