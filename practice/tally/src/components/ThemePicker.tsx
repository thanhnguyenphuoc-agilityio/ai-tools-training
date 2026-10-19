// Light/dark switch in the app header (ticket theme_picker). The choice is
// stored on this device by setThemePreference; "system" follows the device.
import { useState } from 'react';
import { useI18n } from '../i18n';
import { getThemePreference, setThemePreference, THEME_PREFERENCES, type ThemePreference } from '../theme';
import './ThemePicker.scss';

export function ThemePicker() {
  const { t } = useI18n();
  const [preference, setPreference] = useState<ThemePreference>(getThemePreference);

  function choose(next: ThemePreference) {
    setThemePreference(next);
    setPreference(next);
  }

  return (
    <fieldset className="theme-picker">
      <legend className="theme-picker__legend">{t('theme.label')}</legend>
      {THEME_PREFERENCES.map((option) => (
        <label
          key={option}
          className={`theme-picker__option${option === preference ? ' theme-picker__option--active' : ''}`}
          title={option === 'system' ? t('theme.systemHint') : undefined}
        >
          <input
            type="radio"
            name="theme"
            value={option}
            className="theme-picker__input"
            checked={option === preference}
            onChange={() => choose(option)}
          />
          {t(`theme.options.${option}`)}
        </label>
      ))}
    </fieldset>
  );
}
