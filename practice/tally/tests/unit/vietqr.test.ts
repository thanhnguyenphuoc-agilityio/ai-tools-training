import { describe, expect, it } from 'vitest';
import { viLocale } from '../../src/i18n/locales/vi';
import { buildVietQrPayload, crc16ccitt, parseTlv, sanitizeTransferMessage } from '../../shared/vietqr';

// Fake account numbers only. Never put a real account in tests or fixtures.
const FAKE = { bin: '970436', accountNo: '0123456789' };

// English words carrying Vietnamese diacritics, written with escapes so the source stays ASCII.
const ACCENTED_MESSAGE = 'Al\u1ec7x p\u00e0ys S\u1ea3m';
const D_STROKE_MESSAGE = 'Room \u0111ues, \u0110ay 3/2';

function strings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (value && typeof value === 'object') return Object.values(value).flatMap(strings);
  return [];
}

describe('crc16ccitt', () => {
  it('matches the CRC-16/CCITT-FALSE check value', () => {
    expect(crc16ccitt('123456789')).toBe('29B1');
  });
});

describe('sanitizeTransferMessage', () => {
  it('strips diacritics and symbols', () => {
    expect(sanitizeTransferMessage(`${ACCENTED_MESSAGE} - room 7!`)).toBe('ALEX PAYS SAM ROOM 7');
    expect(sanitizeTransferMessage(D_STROKE_MESSAGE)).toBe('ROOM DUES DAY 3 2');
  });

  it('handles decomposed (NFD) input the same as composed', () => {
    expect(sanitizeTransferMessage(ACCENTED_MESSAGE.normalize('NFD'))).toBe('ALEX PAYS SAM');
  });

  it('turns every Vietnamese UI string into bank-safe ASCII', () => {
    for (const text of strings(viLocale.messages)) {
      expect(sanitizeTransferMessage(text)).toMatch(/^[A-Z0-9 ]*$/);
    }
  });

  it('caps the length at 50', () => {
    expect(sanitizeTransferMessage('a'.repeat(80))).toHaveLength(50);
  });
});

describe('buildVietQrPayload', () => {
  it('builds a dynamic QR with amount and message', () => {
    const payload = buildVietQrPayload({ ...FAKE, amount: 77_500, message: ACCENTED_MESSAGE });
    const fields = parseTlv(payload);

    expect(fields.get('00')).toBe('01');
    expect(fields.get('01')).toBe('12');
    expect(fields.get('53')).toBe('704');
    expect(fields.get('54')).toBe('77500');
    expect(fields.get('58')).toBe('VN');
    expect(parseTlv(fields.get('62')!).get('08')).toBe('ALEX PAYS SAM');

    const merchant = parseTlv(fields.get('38')!);
    expect(merchant.get('00')).toBe('A000000727');
    expect(merchant.get('02')).toBe('QRIBFTTA');
    const beneficiary = parseTlv(merchant.get('01')!);
    expect(beneficiary.get('00')).toBe('970436');
    expect(beneficiary.get('01')).toBe('0123456789');
  });

  it('ends with a CRC over everything before it, including "6304"', () => {
    const payload = buildVietQrPayload({ ...FAKE, amount: 1000 });
    expect(payload.slice(-8, -4)).toBe('6304');
    expect(payload.slice(-4)).toBe(crc16ccitt(payload.slice(0, -4)));
  });

  it('builds a static QR without amount', () => {
    const fields = parseTlv(buildVietQrPayload(FAKE));
    expect(fields.get('01')).toBe('11');
    expect(fields.has('54')).toBe(false);
  });

  it('rejects bad input', () => {
    expect(() => buildVietQrPayload({ ...FAKE, bin: '9704' })).toThrow();
    expect(() => buildVietQrPayload({ ...FAKE, accountNo: '12 34' })).toThrow();
    expect(() => buildVietQrPayload({ ...FAKE, amount: 10.5 })).toThrow();
  });
});
