// Interface language for this device (ticket language_picker). setLocale()
// stores the choice in localStorage; nothing is sent to the API.
import { isLocale, localeOptions, useI18n } from '../i18n';
import './LanguagePicker.scss';

export function LanguagePicker() {
  const { t, locale, setLocale } = useI18n();

  return (
    <label className="language-picker">
      <span className="language-picker__label">{t('languagePicker.label')}</span>
      <select
        className="language-picker__control"
        value={locale}
        onChange={(e) => {
          if (isLocale(e.target.value)) setLocale(e.target.value);
        }}
      >
        {localeOptions().map(({ value, label }) => (
          <option key={value} value={value} lang={value}>
            {label}
          </option>
        ))}
      </select>
    </label>
  );
}
