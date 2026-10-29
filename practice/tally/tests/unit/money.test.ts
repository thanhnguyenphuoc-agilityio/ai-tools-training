import { describe, expect, it } from 'vitest';
import { CURRENCIES } from '../../shared/currency';
import {
  exactSplitDifference,
  formatAmountInput,
  formatMoney,
  MAX_AMOUNT,
  parseAmount,
  parseShareAmount,
  splitAmount,
  splitExact,
  toDecimalString,
} from '../../shared/money';
import { enLocale } from '../../src/i18n/locales/en';
import { viLocale } from '../../src/i18n/locales/vi';

const { VND, USD, JPY, THB } = CURRENCIES;
// Dong signs, written as escapes so the source stays ASCII.
const DONG = '\u0111';
const DONG_SIGN = '\u20ab';
const vi = viLocale.amountInput;
const en = enLocale.amountInput;

describe('parseAmount, zero-digit currency (VND)', () => {
  it.each([
    ['77500', 77_500],
    ['77.500', 77_500],
    ['77,500', 77_500],
    ['1.250.000', 1_250_000],
    ['77.5k', 77_500],
    ['50k', 50_000],
    ['1,2tr', 1_200_000],
    ['2m', 2_000_000],
    ['150.000vnd', 150_000],
    [' 30 000 ', 30_000],
  ])('vi parses %s', (input, expected) => {
    expect(parseAmount(input, vi, VND)).toBe(expected);
  });

  it.each(['', 'abc', '1.5', '0', '-5000', '12.34.5', '1.2345k', '2000tr'])('vi rejects %s', (input) => {
    expect(parseAmount(input, vi, VND)).toBeNull();
  });

  it('accepts the dong signs for VND', () => {
    expect(parseAmount(`150.000${DONG}`, vi, VND)).toBe(150_000);
    expect(parseAmount(`50k${DONG_SIGN}`, en, VND)).toBe(50_000);
  });

  it('rejects a thousands-looking separator before a suffix as ambiguous', () => {
    expect(parseAmount('1,500k', en, VND)).toBeNull();
    expect(parseAmount('1.500k', vi, VND)).toBeNull();
  });

  it('only knows the suffixes of the locale', () => {
    expect(parseAmount('1tr', en, VND)).toBeNull();
    expect(parseAmount('1m', en, VND)).toBe(1_000_000);
  });
});

describe('parseAmount, two-digit currency (USD), returns cents', () => {
  it.each([
    ['12', 1_200],
    ['12.5', 1_250],
    ['12.50', 1_250],
    ['1,250.50', 125_050],
    ['usd 7', 700],
    ['1.5k', 150_000],
  ])('en parses %s', (input, expected) => {
    expect(parseAmount(input, en, USD)).toBe(expected);
  });

  it.each([
    ['12,50', 1_250],
    ['1.250,50', 125_050],
  ])('vi uses comma decimals: %s', (input, expected) => {
    expect(parseAmount(input, vi, USD)).toBe(expected);
  });

  it.each(['12.505', '1,25', '.5'])('en rejects %s', (input) => {
    expect(parseAmount(input, en, USD)).toBeNull();
  });

  it('does not accept dong signs for other currencies', () => {
    expect(parseAmount(`150k${DONG_SIGN}`, en, USD)).toBeNull();
    expect(parseAmount(`100${DONG}`, vi, THB)).toBeNull();
  });
});

describe('CURRENCIES', () => {
  it.each(Object.values(CURRENCIES))('$code minor digits match Intl', (currency) => {
    const intl = new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.code }).resolvedOptions();
    expect(intl.maximumFractionDigits).toBe(currency.minorDigits);
    expect(currency.roundOptions[0]).toBe(1);
  });
});

describe('formatMoney', () => {
  it('formats minor units with the locale and currency', () => {
    const intlVnd = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(1_250_000);
    expect(formatMoney(1_250_000, VND, 'vi-VN')).toBe(intlVnd);
    expect(formatMoney(125_050, USD, 'en-US')).toBe('$1,250.50');
    expect(formatMoney(1_500, JPY, 'en-US')).toBe('\u00a51,500');
  });
});

describe('toDecimalString', () => {
  it('writes zero-digit currencies as whole numbers without grouping', () => {
    expect(toDecimalString(1_250_000, VND)).toBe('1250000');
    expect(toDecimalString(1_500, JPY)).toBe('1500');
    expect(toDecimalString(0, VND)).toBe('0');
  });

  it('writes two-digit currencies with a dot and both minor digits', () => {
    expect(toDecimalString(125_050, USD)).toBe('1250.50');
    expect(toDecimalString(5, USD)).toBe('0.05');
    expect(toDecimalString(70, THB)).toBe('0.70');
    expect(toDecimalString(0, USD)).toBe('0.00');
    expect(toDecimalString(1_000_000_001, USD)).toBe('10000000.01');
  });

  it('keeps the sign of a negative amount', () => {
    expect(toDecimalString(-5, USD)).toBe('-0.05');
    expect(toDecimalString(-1_000, VND)).toBe('-1000');
  });

  it('rejects an amount that is not an integer', () => {
    expect(() => toDecimalString(12.5, USD)).toThrow(RangeError);
  });
});

describe('formatAmountInput', () => {
  it('round-trips through parseAmount for VND and a two-digit currency, in both locales', () => {
    // Zero is left out: parseAmount rejects it (an empty share field is the way to type zero).
    const cases: [number, typeof VND, typeof vi][] = [
      [300_000, VND, vi],
      [1_250_000, VND, en],
      [125_050, USD, en],
      [5, USD, en],
      [125_050, USD, vi],
    ];
    for (const [amount, currency, rules] of cases) {
      expect(parseAmount(formatAmountInput(amount, rules, currency), rules, currency)).toBe(amount);
    }
  });

  it('uses the locale decimal separator and writes both minor digits', () => {
    expect(formatAmountInput(125_050, en, USD)).toBe('1250.50');
    expect(formatAmountInput(125_050, vi, USD)).toBe('1250,50');
    expect(formatAmountInput(300_000, vi, VND)).toBe('300000');
  });
});

describe('splitAmount', () => {
  const equal = (ids: string[]) => ids.map((memberId) => ({ memberId, weight: 1 }));
  const sum = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0);

  it('splits evenly when it divides', () => {
    const shares = splitAmount(300_000, equal(['a', 'b', 'c']), { roundTo: 1, payerId: 'a' });
    expect([...shares.values()]).toEqual([100_000, 100_000, 100_000]);
  });

  it('hands remainder units to the earliest parts and keeps the total', () => {
    const shares = splitAmount(100, equal(['a', 'b', 'c']), { roundTo: 1, payerId: 'z' });
    expect(Object.fromEntries(shares)).toEqual({ a: 34, b: 33, c: 33 });
  });

  it('rounds to thousands and gives the sub-thousand leftover to the payer', () => {
    const shares = splitAmount(465_500, equal(['a', 'b', 'c', 'd', 'e', 'f']), { roundTo: 1000, payerId: 'c' });
    expect(sum(shares)).toBe(465_500);
    for (const [id, v] of shares) if (id !== 'c') expect(v % 1000).toBe(0);
    expect(shares.get('c')! % 1000).toBe(500);
  });

  it('rounds cents to whole dollars the same way', () => {
    const shares = splitAmount(10_050, equal(['a', 'b', 'c']), { roundTo: 100, payerId: 'b' });
    expect(Object.fromEntries(shares)).toEqual({ a: 3_400, b: 3_350, c: 3_300 });
  });

  it('splits by weight', () => {
    const shares = splitAmount(
      180_000,
      [
        { memberId: 'p1', weight: 1 },
        { memberId: 'p2', weight: 1 },
        { memberId: 'p3', weight: 0.8 },
      ],
      { roundTo: 1000, payerId: 'p1' },
    );
    expect(Object.fromEntries(shares)).toEqual({ p1: 64_000, p2: 64_000, p3: 52_000 });
    expect(sum(shares)).toBe(180_000);
  });

  // Weights such as 2.3 and 1.15 have no exact binary form: 2.3 * 100 is 229.99999999999997.
  it('uses the exact hundredths of weights that floats cannot represent', () => {
    const pair = (weight: number) => [
      { memberId: 'alex', weight: 1 },
      { memberId: 'sam', weight },
    ];
    expect(Object.fromEntries(splitAmount(1_000_000, pair(2.3), { roundTo: 1, payerId: 'alex' }))).toEqual({
      alex: 303_030,
      sam: 696_970,
    });
    expect(Object.fromEntries(splitAmount(1_000_000, pair(1.15), { roundTo: 1, payerId: 'alex' }))).toEqual({
      alex: 465_116,
      sam: 534_884,
    });
    expect(Object.fromEntries(splitAmount(1_000_000, pair(2.3), { roundTo: 1000, payerId: 'alex' }))).toEqual({
      alex: 303_000,
      sam: 697_000,
    });
  });

  it('uses the intended hundredths for every valid weight', () => {
    // With a total of k + 100 hundredths and an amount of k + 100, each hundredth is worth exactly 1.
    const wrong: number[] = [];
    for (let k = 1; k <= 10_000; k++) {
      const shares = splitAmount(
        k + 100,
        [
          { memberId: 'a', weight: k / 100 },
          { memberId: 'b', weight: 1 },
        ],
        { roundTo: 1, payerId: 'a' },
      );
      if (shares.get('a') !== k || shares.get('b') !== 100) wrong.push(k / 100);
    }
    expect(wrong).toEqual([]);
  });

  it('rejects empty participants, bad weights and bad rounding', () => {
    expect(() => splitAmount(1000, [], { roundTo: 1, payerId: 'a' })).toThrow();
    expect(() => splitAmount(1000, [{ memberId: 'a', weight: 0 }], { roundTo: 1, payerId: 'a' })).toThrow();
    // At most two decimals: 0.001 would round to a zero weight, 0.333 would be split as 0.33.
    expect(() => splitAmount(1000, [{ memberId: 'a', weight: 0.001 }], { roundTo: 1, payerId: 'a' })).toThrow();
    expect(() => splitAmount(1000, [{ memberId: 'a', weight: 0.333 }], { roundTo: 1, payerId: 'a' })).toThrow();
    expect(() => splitAmount(1000, equal(['a']), { roundTo: 0, payerId: 'a' })).toThrow();
  });
});

describe('splitExact', () => {
  it('keeps every typed part exactly, including a zero part', () => {
    const shares = splitExact(250_500, [
      { memberId: 'a', amount: 120_500 },
      { memberId: 'b', amount: 130_000 },
      { memberId: 'c', amount: 0 },
    ]);
    expect([...shares]).toEqual([
      ['a', 120_500],
      ['b', 130_000],
      ['c', 0],
    ]);
  });

  it('accepts a single part equal to the amount', () => {
    expect([...splitExact(1, [{ memberId: 'a', amount: 1 }])]).toEqual([['a', 1]]);
  });

  it.each([
    ['less than the amount', [{ memberId: 'a', amount: 400 }, { memberId: 'b', amount: 599 }]],
    ['more than the amount', [{ memberId: 'a', amount: 400 }, { memberId: 'b', amount: 601 }]],
    ['all zero', [{ memberId: 'a', amount: 0 }]],
  ])('rejects parts that add up to %s', (_, parts) => {
    expect(() => splitExact(1000, parts)).toThrow('add up');
  });

  it('rejects negative, fractional and too large parts', () => {
    expect(() => splitExact(1000, [{ memberId: 'a', amount: 1100 }, { memberId: 'b', amount: -100 }])).toThrow();
    expect(() => splitExact(1000, [{ memberId: 'a', amount: 999.5 }, { memberId: 'b', amount: 0.5 }])).toThrow();
    expect(() => splitExact(MAX_AMOUNT, [{ memberId: 'a', amount: MAX_AMOUNT + 1 }, { memberId: 'b', amount: -1 }])).toThrow();
    expect(() => splitExact(1000, [{ memberId: 'a', amount: Number.NaN }])).toThrow();
  });

  it('rejects duplicate members, empty parts and a bad amount', () => {
    expect(() => splitExact(1000, [{ memberId: 'a', amount: 500 }, { memberId: 'a', amount: 500 }])).toThrow('duplicate');
    expect(() => splitExact(1000, [])).toThrow();
    expect(() => splitExact(0, [{ memberId: 'a', amount: 0 }])).toThrow();
    expect(() => splitExact(10.5, [{ memberId: 'a', amount: 10.5 }])).toThrow();
  });
});

describe('exactSplitDifference', () => {
  it('is positive while amounts are left to assign, negative over the total and zero when they match', () => {
    expect(exactSplitDifference(1000, [{ amount: 300 }, { amount: 200 }])).toBe(500);
    expect(exactSplitDifference(1000, [{ amount: 700 }, { amount: 400 }])).toBe(-100);
    expect(exactSplitDifference(1000, [{ amount: 1000 }, { amount: 0 }])).toBe(0);
    expect(exactSplitDifference(1000, [])).toBe(1000);
  });
});

describe('parseShareAmount', () => {
  const zeroForms = ['', '   ', '0', '00', '0k', '0tr', '0vnd', ' 0 VND ', `0${DONG}`, `0 ${DONG_SIGN}`];
  it.each(zeroForms)('vi treats %j as zero for VND', (input) => {
    expect(parseShareAmount(input, vi, VND)).toBe(0);
  });

  it.each([
    ['0', en],
    ['0.00', en],
    ['0k', en],
    ['usd 0', en],
    ['0,00', vi],
  ])('treats %j as zero for USD', (input, rules) => {
    expect(parseShareAmount(input, rules, USD)).toBe(0);
  });

  it('accepts the same marks and shorthand as the amount field', () => {
    for (const input of ['150k', '150.000', `150.000${DONG}`, '150.000 vnd', `150k${DONG_SIGN}`]) {
      expect(parseShareAmount(input, vi, VND)).toBe(parseAmount(input, vi, VND));
      expect(parseShareAmount(input, vi, VND)).toBe(150_000);
    }
    expect(parseShareAmount('12.50', en, USD)).toBe(1_250);
    expect(parseShareAmount('12,50', vi, USD)).toBe(1_250);
  });

  it.each(['abc', '-5000', '-0', '1.5', '0.00', DONG, '0usd', '2000tr'])('vi rejects %j for VND', (input) => {
    expect(parseShareAmount(input, vi, VND)).toBeNull();
  });

  it('keeps zero invalid for the main amount field', () => {
    expect(parseAmount('0k', vi, VND)).toBeNull();
    expect(parseAmount(`0${DONG}`, vi, VND)).toBeNull();
  });
});
