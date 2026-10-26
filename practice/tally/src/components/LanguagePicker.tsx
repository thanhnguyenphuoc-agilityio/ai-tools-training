// Interface language for this device (ticket language_picker). setLocale()
// stores the choice in localStorage; nothing is sent to the API.
// A menu button with flags (ticket header_controls_icons): a native <select>
// cannot show images in its options. Keyboard rules follow a native select.
import { useEffect, useId, useRef, useState } from 'react';
import { localeOptions, useI18n, type Locale } from '../i18n';
import { Flag } from './Flag';
import { Icon } from './Icon';
import { nextActiveIndex } from './listboxKeys';
import './LanguagePicker.scss';

export function LanguagePicker() {
  const { t, locale, setLocale } = useI18n();
  const options = localeOptions();
  const current = options.find((o) => o.value === locale) ?? options[0];
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const id = useId();
  const optionId = (index: number) => `${id}-option-${index}`;

  function show() {
    setActive(Math.max(0, options.findIndex((o) => o.value === locale)));
    setOpen(true);
  }

  function close(refocus: boolean) {
    setOpen(false);
    if (refocus) button.current?.focus();
  }

  function choose(value: Locale) {
    setLocale(value);
    close(true);
  }

  useEffect(() => {
    if (!open) return;
    list.current?.focus();
    const onPointerDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) close(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  function onListKeyDown(e: React.KeyboardEvent) {
    const next = nextActiveIndex(e.key, active, options.length);
    if (next !== null) {
      e.preventDefault();
      setActive(next);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      choose(options[active].value);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close(true);
    } else if (e.key === 'Tab') {
      // Hand focus back to the button without preventing the default, so Tab and Shift+Tab move on from there.
      button.current?.focus();
      setOpen(false);
    }
  }

  return (
    <div className="language-picker" ref={root}>
      <button
        ref={button}
        type="button"
        className="language-picker__button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${id}-list` : undefined}
        aria-label={t('languagePicker.current', { language: current.label })}
        title={t('languagePicker.label')}
        onClick={() => (open ? close(true) : show())}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            show();
          }
        }}
      >
        <Flag locale={current.value} className="language-picker__flag" />
        <span className="language-picker__current" lang={current.value}>
          {current.label}
        </span>
        <Icon name="chevronDown" className="language-picker__chevron" />
      </button>
      {open && (
        <ul
          ref={list}
          id={`${id}-list`}
          role="listbox"
          tabIndex={-1}
          className="language-picker__menu"
          aria-label={t('languagePicker.label')}
          aria-activedescendant={optionId(active)}
          onKeyDown={onListKeyDown}
        >
          {options.map((o, index) => (
            <li
              key={o.value}
              id={optionId(index)}
              role="option"
              lang={o.value}
              aria-selected={o.value === locale}
              className={[
                'language-picker__option',
                index === active ? 'language-picker__option--active' : '',
                o.value === locale ? 'language-picker__option--selected' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onPointerEnter={(e) => {
                // A mouse hover moves the highlight; a touch that scrolls the page must not.
                if (e.pointerType === 'mouse') setActive(index);
              }}
              onClick={() => choose(o.value)}
            >
              <Flag locale={o.value} className="language-picker__flag" />
              <span className="language-picker__name">{o.label}</span>
              {o.value === locale && <Icon name="check" className="language-picker__check" />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
