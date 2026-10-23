import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTranslator, detectLocale, LOCALES, localeOptions, saveLocale } from '../../src/i18n';

// Minimal in-memory localStorage: the choice is kept on the device only.
function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => void data.delete(key),
    setItem: (key, value) => void data.set(key, String(value)),
  };
}

function browserLanguages(...languages: string[]) {
  vi.stubGlobal('navigator', { languages, language: languages[0] });
}

describe('language picker', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('offers every locale, named in its own language', () => {
    expect(localeOptions()).toEqual(
      Object.entries(LOCALES).map(([value, bundle]) => ({ value, label: bundle.label })),
    );
    expect(localeOptions().map((o) => o.value)).toEqual(['vi', 'en']);
  });

  it('follows the browser while nothing is chosen', () => {
    browserLanguages('en-US', 'vi');
    expect(detectLocale()).toBe('en');
  });

  it('uses the stored choice ahead of the browser languages', () => {
    browserLanguages('en-US');
    saveLocale('vi');
    expect(localStorage.getItem('tally.locale')).toBe('vi');
    expect(detectLocale()).toBe('vi');
  });

  it('ignores a stored value that is not a known locale', () => {
    browserLanguages('en-GB');
    localStorage.setItem('tally.locale', 'xx');
    expect(detectLocale()).toBe('en');
  });

  it('still works when storage is unavailable', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    });
    browserLanguages('en-US');
    expect(() => saveLocale('vi')).not.toThrow();
    expect(detectLocale()).toBe('en');
  });

  it('each locale suggests its default currency', () => {
    expect(createTranslator('vi').defaultCurrency).toBe('VND');
    expect(createTranslator('en').defaultCurrency).toBe('USD');
  });
});
