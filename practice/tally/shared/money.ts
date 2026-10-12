// Amounts are always integers in the group currency's minor units (see
// shared/currency.ts). Never use floats for amounts.
import { MAX_AMOUNT, type CurrencyInfo } from './currency';

export { MAX_AMOUNT };
export const MAX_WEIGHT = 100;

/** A weight is > 0, at most MAX_WEIGHT and has at most two decimal places (it is split in hundredths). */
export function isValidWeight(weight: number): boolean {
  return weight > 0 && weight <= MAX_WEIGHT && Math.abs(weight * 100 - Math.round(weight * 100)) < 1e-9;
}

/** Formats minor units for display, using the locale's grouping and the currency sign. */
export function formatMoney(amount: number, currency: CurrencyInfo, intlLocale: string): string {
  return new Intl.NumberFormat(intlLocale, { style: 'currency', currency: currency.code }).format(
    amount / 10 ** currency.minorDigits,
  );
}

/**
 * How people type amounts in one locale. Lives in the locale files
 * (src/i18n/locales) because separators and shorthand are language-specific.
 */
export interface AmountInputRules {
  /** Decimal separator; the other of "." and "," is the thousands separator. */
  decimalSeparator: '.' | ',';
  /** Lower-case suffix -> multiplier of whole units, e.g. { k: 1_000 }. */
  suffixes: Record<string, number>;
  /**
   * Lower-case marks ignored at the start or end, per currency code, besides the code itself,
   * e.g. { VND: ['vnd', 'dong sign'] }. A mark is only accepted for its own currency.
   */
  currencyMarks: Partial<Record<string, string[]>>;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function stripMarks(s: string, marks: string[]): string {
  for (const mark of [...marks].sort((a, b) => b.length - a.length)) {
    if (s.endsWith(mark)) return s.slice(0, -mark.length);
    if (s.startsWith(mark)) return s.slice(mark.length);
  }
  return s;
}

/** "12" + "5" with 2 minor digits -> 1250. Null if `frac` has too many digits. */
function toMinor(whole: string, frac: string, digits: number): number | null {
  if (frac.length > digits) return null;
  return Number(whole) * 10 ** digits + Number(frac.padEnd(digits, '0') || 0);
}

/**
 * Parses what people type into an amount box and returns minor units, or null
 * if the input is ambiguous, malformed, non-positive or above MAX_AMOUNT.
 *
 * - Shorthand: "150k", "77.5k", "1,2tr" (suffixes from the locale; either
 *   separator works before a suffix, but three digits after it, as in "1,500k", are ambiguous).
 * - Currency marks are accepted only for their own currency (the dong sign only for VND).
 * - Zero-digit currencies (VND, JPY): digits with "." or "," as thousands
 *   separators; "1.5" is rejected as ambiguous.
 * - Two-digit currencies (USD, EUR): the locale's separators, e.g. "1,250.50"
 *   in English or "1.250,50" in Vietnamese.
 */
export function parseAmount(input: string, rules: AmountInputRules, currency: CurrencyInfo): number | null {
  let s = input.trim().toLowerCase().replace(/\s+/g, '');
  s = stripMarks(s, [...(rules.currencyMarks[currency.code] ?? []), currency.code.toLowerCase()]);
  if (s === '') return null;

  const digits = currency.minorDigits;
  let value: number | null = null;

  const suffixes = Object.keys(rules.suffixes).sort((a, b) => b.length - a.length).map(escapeRe);
  const suffixed = suffixes.length ? s.match(new RegExp(`^(\\d+)(?:[.,](\\d+))?(${suffixes.join('|')})$`)) : null;

  if (suffixed) {
    const [, whole, frac = '', suffix] = suffixed;
    // "1,500k" could mean 1.5k or 1500k; like "1.5" for VND, an ambiguous value is rejected.
    if (frac.length === 3) return null;
    const scale = 10 ** frac.length;
    const scaled = (Number(whole) * scale + Number(frac || 0)) * rules.suffixes[suffix] * 10 ** digits;
    value = scaled % scale === 0 ? scaled / scale : null;
  } else if (digits === 0) {
    if (/^\d+$/.test(s) || /^\d{1,3}(\.\d{3})+$/.test(s) || /^\d{1,3}(,\d{3})+$/.test(s)) {
      value = Number(s.replace(/[.,]/g, ''));
    }
  } else {
    const dec = escapeRe(rules.decimalSeparator);
    const thou = escapeRe(rules.decimalSeparator === '.' ? ',' : '.');
    const m = s.match(new RegExp(`^(\\d{1,3}(?:${thou}\\d{3})+|\\d+)(?:${dec}(\\d+))?$`));
    if (m) value = toMinor(m[1].replace(new RegExp(thou, 'g'), ''), m[2] ?? '', digits);
  }

  if (value === null || !Number.isSafeInteger(value) || value <= 0 || value > MAX_AMOUNT) return null;
  return value;
}

export interface SplitPart {
  memberId: string;
  /** 1 = one normal share. Up to 2 decimals, e.g. 0.8. */
  weight: number;
}

export interface SplitOptions {
  /** Rounding unit in minor units: 1 = exact, 1000 = whole thousands of dong, etc. */
  roundTo: number;
  /** Who paid. Receives any leftover that cannot be split in roundTo units. */
  payerId: string;
}

/**
 * Splits `amount` across `parts` by weight. Shares are integers, are multiples
 * of `roundTo` (except the leftover described below) and always sum to `amount`.
 *
 * Whole units are handed out by the largest-remainder method; ties go to the
 * earlier part. The sub-unit leftover (amount % roundTo) goes to the payer if
 * they take part, otherwise to the first part.
 */
export function splitAmount(amount: number, parts: SplitPart[], opts: SplitOptions): Map<string, number> {
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('amount must be a positive integer');
  if (parts.length === 0) throw new Error('at least one participant is required');
  if (!Number.isSafeInteger(opts.roundTo) || opts.roundTo < 1) throw new Error('roundTo must be a positive integer');

  const hundredths = parts.map((p) => {
    if (!isValidWeight(p.weight)) throw new Error(`invalid weight for ${p.memberId}`);
    return Math.trunc(p.weight * 100);
  });
  const totalWeight = hundredths.reduce((a, b) => a + b, 0);

  const unit = opts.roundTo;
  const units = Math.floor(amount / unit);
  const leftover = amount - units * unit;

  const base = hundredths.map((w) => Math.floor((units * w) / totalWeight));
  const remainders = hundredths.map((w) => (units * w) % totalWeight);
  let toHandOut = units - base.reduce((a, b) => a + b, 0);

  const order = parts.map((_, i) => i).sort((a, b) => remainders[b] - remainders[a] || a - b);
  for (const i of order) {
    if (toHandOut === 0) break;
    base[i] += 1;
    toHandOut -= 1;
  }

  const shares = new Map<string, number>();
  parts.forEach((p, i) => shares.set(p.memberId, (shares.get(p.memberId) ?? 0) + base[i] * unit));

  if (leftover > 0) {
    const target = shares.has(opts.payerId) ? opts.payerId : parts[0].memberId;
    shares.set(target, shares.get(target)! + leftover);
  }
  return shares;
}
