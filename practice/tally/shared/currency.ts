// Currencies a group can use. A group picks one at creation (defaulting to the
// creator's UI language) and every amount in it is an integer number of that
// currency's minor units (dong, cents, yen...). Display names come from
// Intl.DisplayNames, so no names are stored here.

export interface CurrencyInfo {
  code: string;
  /** Digits after the decimal point. Must match Intl's formatting for the code. */
  minorDigits: 0 | 2;
  /** Allowed group rounding units, in minor units. The first is "exact". */
  roundOptions: readonly number[];
}

const zeroDigit = (code: string, coarse: number): CurrencyInfo => ({ code, minorDigits: 0, roundOptions: [1, coarse] });
const twoDigit = (code: string): CurrencyInfo => ({ code, minorDigits: 2, roundOptions: [1, 100] });

export const CURRENCIES: Record<string, CurrencyInfo> = {
  VND: zeroDigit('VND', 1000),
  USD: twoDigit('USD'),
  EUR: twoDigit('EUR'),
  GBP: twoDigit('GBP'),
  AUD: twoDigit('AUD'),
  SGD: twoDigit('SGD'),
  THB: twoDigit('THB'),
  CNY: twoDigit('CNY'),
  JPY: zeroDigit('JPY', 100),
  KRW: zeroDigit('KRW', 1000),
};

export const DEFAULT_CURRENCY = 'VND';

/** Bank transfers via VietQR only exist for this currency. */
export const VIETQR_CURRENCY = 'VND';

export function getCurrency(code: string): CurrencyInfo | undefined {
  return Object.hasOwn(CURRENCIES, code) ? CURRENCIES[code] : undefined;
}

/** Largest amount per expense, in minor units (e.g. 1 billion VND, 10 million USD). */
export const MAX_AMOUNT = 1_000_000_000;
