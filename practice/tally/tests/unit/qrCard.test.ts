import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import banks from '../../shared/banks.json';
import { QR_OPTIONS, bankLogo } from '../../src/qrCard';

describe('qrCard', () => {
  it('draws the code with error correction H', () => {
    expect(QR_OPTIONS.errorCorrectionLevel).toBe('H');
  });

  it('bundles exactly one logo per bank in banks.json', () => {
    const files = readdirSync(resolve(__dirname, '../../public/bank-logos')).sort();
    expect(files).toEqual(banks.map((b) => `${b.bin}.png`).sort());
    expect(bankLogo('970436')).toBe('/bank-logos/970436.png');
  });
});
