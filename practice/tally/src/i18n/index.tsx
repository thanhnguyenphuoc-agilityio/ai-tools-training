// Localization. All user-facing text lives in ./locales; components get it
// through useI18n(). Adding a language = one locale file + one LOCALES entry.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { CURRENCIES, type CurrencyInfo } from '../../shared/currency';
import { formatMoney, parseAmount, parseShareAmount } from '../../shared/money';
import { ApiError } from '../api';
import { enLocale } from './locales/en';
import { viLocale } from './locales/vi';
import type { LocaleBundle, MessageKey, PluralKey, UiMessage, Vars } from './types';

export type { MessageVar, MessageVars, UiMessage } from './types';

export const LOCALES = {
  vi: viLocale,
  en: enLocale,
} satisfies Record<string, LocaleBundle>;

export type Locale = keyof typeof LOCALES;
export const DEFAULT_LOCALE: Locale = 'vi';
const STORAGE_KEY = 'tally.locale';

export const isLocale = (value: unknown): value is Locale => typeof value === 'string' && value in LOCALES;

/** The languages a picker offers, each named in its own language. */
export function localeOptions(): { value: Locale; label: string }[] {
  return (Object.keys(LOCALES) as Locale[]).map((value) => ({ value, label: LOCALES[value].label }));
}

/** Remembers the choice on this device only; detectLocale() reads it first. */
export function saveLocale(locale: Locale): void {
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // storage unavailable: the choice lasts for this page only
  }
}

/** Saved choice, then the browser's languages, then the default. */
export function detectLocale(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (isLocale(saved)) return saved;
  } catch {
    // storage unavailable
  }
  for (const tag of navigator.languages ?? [navigator.language]) {
    const base = tag.toLowerCase().split('-')[0];
    if (isLocale(base)) return base;
  }
  return DEFAULT_LOCALE;
}

function lookup(bundle: LocaleBundle, key: string): unknown {
  return key
    .split('.')
    .reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], bundle.messages);
}

function interpolate(template: string, vars?: Vars): string {
  return vars ? template.replace(/\{(\w+)\}/g, (match, name) => (name in vars ? String(vars[name]) : match)) : template;
}

export function createTranslator(locale: Locale) {
  const bundle: LocaleBundle = LOCALES[locale];
  const plural = new Intl.PluralRules(bundle.intl);
  const dayFormat = new Intl.DateTimeFormat(bundle.intl, {
    timeZone: 'UTC',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const localDateFormat = new Intl.DateTimeFormat(bundle.intl, { day: '2-digit', month: '2-digit', year: 'numeric' });
  const dateTimeFormat = new Intl.DateTimeFormat(bundle.intl, { dateStyle: 'short', timeStyle: 'short' });
  const currencyNames = new Intl.DisplayNames(bundle.intl, { type: 'currency' });

  const t = (key: MessageKey, vars?: Vars): string => {
    const value = lookup(bundle, key);
    return typeof value === 'string' ? interpolate(value, vars) : key;
  };

  /** Plural-aware: picks the Intl.PluralRules category, falling back to "other". */
  const tp = (key: PluralKey, count: number, vars?: Vars): string => {
    const node = lookup(bundle, key) as Record<string, string> | undefined;
    const template = node?.[plural.select(count)] ?? node?.other;
    return template ? interpolate(template, { count, ...vars }) : key;
  };

  /** Turns anything thrown by the API client into a sentence for the user. */
  const errorMessage = (err: unknown): string => {
    if (err instanceof ApiError) {
      const known = err.code ? bundle.messages.errors[err.code] : undefined;
      return known ? interpolate(known, err.params) : err.message;
    }
    if (err instanceof TypeError) return t('common.networkError');
    return err instanceof Error ? err.message : String(err);
  };

  /** Formats a message kept in state. Runs on render, so it follows the active language. */
  const message = (m: UiMessage): string => {
    if (m.key === undefined) return errorMessage(m.error);
    // A variable can be a message itself (for example the amount examples), so it translates with the sentence.
    const vars: Vars = {};
    for (const [name, value] of Object.entries(m.vars ?? {})) {
      vars[name] = typeof value === 'object' ? t(value.key, value.vars) : value;
    }
    if (m.error !== undefined) vars.message = errorMessage(m.error);
    return t(m.key, vars);
  };

  return {
    locale,
    intl: bundle.intl,
    t,
    tp,
    errorMessage,
    message,
    defaultCurrency: bundle.defaultCurrency in CURRENCIES ? bundle.defaultCurrency : Object.keys(CURRENCIES)[0],
    /** Minor units of `currency` -> display string. */
    money: (amount: number, currency: CurrencyInfo) => formatMoney(amount, currency, bundle.intl),
    /** Typed text -> minor units of `currency`, or null. */
    parseMoney: (input: string, currency: CurrencyInfo) => parseAmount(input, bundle.amountInput, currency),
    /** One participant's amount in an exact split: like parseMoney, but empty or a typed zero is 0. */
    parseShareMoney: (input: string, currency: CurrencyInfo) => parseShareAmount(input, bundle.amountInput, currency),
    /** e.g. "VND - Vietnamese Dong" in the UI language. */
    currencyName: (code: string) => `${code} - ${currencyNames.of(code) ?? code}`,
    /** "2026-10-10" (a calendar day, no timezone) in the locale's short form. */
    day: (isoDay: string) => {
      const [y, m, d] = isoDay.split('-').map(Number);
      return dayFormat.format(Date.UTC(y, m - 1, d));
    },
    localDate: (iso: string) => localDateFormat.format(new Date(iso)),
    dateTime: (iso: string) => dateTimeFormat.format(new Date(iso)),
  };
}

export type I18n = ReturnType<typeof createTranslator> & { setLocale: (locale: Locale) => void };

const I18nContext = createContext<I18n | null>(null);

export function I18nProvider({ children, initialLocale }: { children: ReactNode; initialLocale?: Locale }) {
  const [locale, setLocaleState] = useState<Locale>(() => initialLocale ?? detectLocale());

  const setLocale = useCallback((next: Locale) => {
    saveLocale(next);
    setLocaleState(next);
  }, []);

  const value = useMemo(() => ({ ...createTranslator(locale), setLocale }), [locale, setLocale]);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = value.t('app.title');
  }, [locale, value]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside <I18nProvider>');
  return ctx;
}
