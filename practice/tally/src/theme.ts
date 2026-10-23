// Light/dark theme. "system" follows prefers-color-scheme; "light"/"dark" set
// data-theme on <html>, which the SCSS theme layer honours. The choice is
// picked in ThemePicker and stored on this device. index.html applies the
// stored value before first paint, so it must use the same storage key.
export const THEME_PREFERENCES = ['system', 'light', 'dark'] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];

export const THEME_STORAGE_KEY = 'tally.theme';

export const isThemePreference = (value: unknown): value is ThemePreference =>
  typeof value === 'string' && (THEME_PREFERENCES as readonly string[]).includes(value);

export function getThemePreference(): ThemePreference {
  try {
    // "system" is never stored (it is the absence of a choice), so reading it back is harmless.
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (isThemePreference(saved)) return saved;
  } catch {
    // storage unavailable
  }
  return 'system';
}

export function applyThemePreference(pref: ThemePreference): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (pref === 'system') delete root.dataset.theme;
  else root.dataset.theme = pref;
}

export function setThemePreference(pref: ThemePreference): void {
  try {
    if (pref === 'system') localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, pref);
  } catch {
    // storage unavailable: applies to this page only
  }
  applyThemePreference(pref);
}
