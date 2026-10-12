// Light/dark theme. "system" follows prefers-color-scheme; "light"/"dark" set
// data-theme on <html>, which the SCSS theme layer honours. A picker UI can
// call setThemePreference (see ticket theme_picker).
export type ThemePreference = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'tally.theme';

export function getThemePreference(): ThemePreference {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    // storage unavailable
  }
  return 'system';
}

export function applyThemePreference(pref: ThemePreference): void {
  const root = document.documentElement;
  if (pref === 'system') delete root.dataset.theme;
  else root.dataset.theme = pref;
}

export function setThemePreference(pref: ThemePreference): void {
  try {
    if (pref === 'system') localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, pref);
  } catch {
    // storage unavailable: applies to this page only
  }
  applyThemePreference(pref);
}
