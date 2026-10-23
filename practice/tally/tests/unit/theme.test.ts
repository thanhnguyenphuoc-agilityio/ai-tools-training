import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyThemePreference,
  getThemePreference,
  isThemePreference,
  setThemePreference,
  THEME_STORAGE_KEY,
} from '../../src/theme';

// Vitest runs in Node: stand-ins for localStorage and <html>.
function fakeStorage(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial));
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
  };
}

const brokenStorage = {
  getItem: () => {
    throw new Error('storage disabled');
  },
  setItem: () => {
    throw new Error('storage disabled');
  },
  removeItem: () => {
    throw new Error('storage disabled');
  },
};

function fakeDocument(theme?: string) {
  const dataset: Record<string, string> = theme ? { theme } : {};
  vi.stubGlobal('document', { documentElement: { dataset } });
  return dataset;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('theme preference', () => {
  it('follows the device when nothing is stored', () => {
    vi.stubGlobal('localStorage', fakeStorage());
    expect(getThemePreference()).toBe('system');
  });

  it('reads back a stored light or dark choice', () => {
    vi.stubGlobal('localStorage', fakeStorage({ [THEME_STORAGE_KEY]: 'dark' }));
    expect(getThemePreference()).toBe('dark');
    vi.stubGlobal('localStorage', fakeStorage({ [THEME_STORAGE_KEY]: 'light' }));
    expect(getThemePreference()).toBe('light');
  });

  it('ignores an unknown stored value', () => {
    vi.stubGlobal('localStorage', fakeStorage({ [THEME_STORAGE_KEY]: 'sepia' }));
    expect(getThemePreference()).toBe('system');
  });

  it('follows the device when storage is unavailable', () => {
    vi.stubGlobal('localStorage', brokenStorage);
    expect(getThemePreference()).toBe('system');
  });

  it('stores and applies a light or dark choice', () => {
    const storage = fakeStorage();
    vi.stubGlobal('localStorage', storage);
    const dataset = fakeDocument();

    setThemePreference('dark');
    expect(storage.items.get(THEME_STORAGE_KEY)).toBe('dark');
    expect(dataset.theme).toBe('dark');
    expect(getThemePreference()).toBe('dark');

    setThemePreference('light');
    expect(storage.items.get(THEME_STORAGE_KEY)).toBe('light');
    expect(dataset.theme).toBe('light');
  });

  it('forgets the choice and removes the override for "system"', () => {
    const storage = fakeStorage({ [THEME_STORAGE_KEY]: 'dark' });
    vi.stubGlobal('localStorage', storage);
    const dataset = fakeDocument('dark');

    setThemePreference('system');
    expect(storage.items.has(THEME_STORAGE_KEY)).toBe(false);
    expect(dataset).not.toHaveProperty('theme');
    expect(getThemePreference()).toBe('system');
  });

  it('still applies the choice to the page when storage is unavailable', () => {
    vi.stubGlobal('localStorage', brokenStorage);
    const dataset = fakeDocument();
    expect(() => setThemePreference('dark')).not.toThrow();
    expect(dataset.theme).toBe('dark');
  });

  it('does nothing without a document', () => {
    expect(() => applyThemePreference('dark')).not.toThrow();
  });

  it('recognises only the three preferences', () => {
    expect(['system', 'light', 'dark'].every(isThemePreference)).toBe(true);
    expect(isThemePreference('sepia')).toBe(false);
    expect(isThemePreference(undefined)).toBe(false);
  });

  it('is applied before first paint by index.html with the same storage key', () => {
    const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
    const inline = html.indexOf(`localStorage.getItem('${THEME_STORAGE_KEY}')`);
    expect(inline).toBeGreaterThan(-1);
    // The inline script sits in <head>, before the app module that renders the page.
    expect(inline).toBeLessThan(html.indexOf('</head>'));
    expect(inline).toBeLessThan(html.indexOf('src="/src/main.tsx"'));
  });
});
