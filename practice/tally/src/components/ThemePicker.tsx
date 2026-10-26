// Light/dark switch in the app header (ticket theme_picker). The choice is
// stored on this device by setThemePreference; "system" follows the device.
// Each option is an icon (ticket header_controls_icons); its name stays in the
// DOM for screen readers and in the tooltip.
import { useState } from 'react';
import { useI18n } from '../i18n';
import { getThemePreference, setThemePreference, THEME_PREFERENCES, type ThemePreference } from '../theme';
import { Icon, type IconName } from './Icon';
import './ThemePicker.scss';

const ICONS: Record<ThemePreference, IconName> = { system: 'monitor', light: 'sun', dark: 'moon' };

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
          title={t(`theme.options.${option}`)}
          className={`theme-picker__option${option === preference ? ' theme-picker__option--active' : ''}`}
        >
          <input
            type="radio"
            name="theme"
            value={option}
            className="theme-picker__input"
            checked={option === preference}
            onChange={() => choose(option)}
          />
          <Icon name={ICONS[option]} />
          <span className="theme-picker__name">{t(`theme.options.${option}`)}</span>
        </label>
      ))}
    </fieldset>
  );
}
