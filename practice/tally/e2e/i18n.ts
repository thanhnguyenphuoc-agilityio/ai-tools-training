// E2E tests run the app in Vietnamese (see playwright.config.ts) and read the
// expected text from the same locale file, so copy changes do not break tests.
import { CURRENCIES } from '../shared/currency';
import { formatMoney } from '../shared/money';
import { viLocale } from '../src/i18n/locales/vi';
import type { MessageKey, Vars } from '../src/i18n/types';

export const LOCALE = viLocale;

export function t(key: MessageKey, vars: Vars = {}): string {
  const template = key.split('.').reduce<unknown>((n, p) => (n as Record<string, unknown>)[p], LOCALE.messages);
  if (typeof template !== 'string') throw new Error(`no message for ${key}`);
  return template.replace(/\{(\w+)\}/g, (m, name) => (name in vars ? String(vars[name]) : m));
}

export const vnd = (amount: number) => formatMoney(amount, CURRENCIES.VND, LOCALE.intl);
