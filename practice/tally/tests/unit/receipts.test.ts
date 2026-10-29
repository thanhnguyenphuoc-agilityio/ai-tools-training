import { describe, expect, it } from 'vitest';
import {
  MAX_RECEIPT_BYTES,
  receiptKey,
  RECEIPT_MAX_SIDE,
  sniffImageType,
  targetDimensions,
} from '../../shared/receipts';

const bytesOf = (...values: number[]) => new Uint8Array(values);
const PNG_HEADER = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const WEBP_HEADER = [0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50];

describe('sniffImageType', () => {
  it('recognises JPEG, PNG and WebP by their leading bytes', () => {
    expect(sniffImageType(bytesOf(0xff, 0xd8, 0xff, 0xe0))).toBe('image/jpeg');
    expect(sniffImageType(bytesOf(...PNG_HEADER))).toBe('image/png');
    expect(sniffImageType(bytesOf(...WEBP_HEADER))).toBe('image/webp');
  });

  it('returns null for text, an empty body and truncated headers', () => {
    expect(sniffImageType(new TextEncoder().encode('not an image'))).toBeNull();
    expect(sniffImageType(new Uint8Array(0))).toBeNull();
    expect(sniffImageType(bytesOf(0x89, 0x50, 0x4e, 0x47))).toBeNull();
    expect(sniffImageType(bytesOf(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x41))).toBeNull();
  });
});

describe('targetDimensions', () => {
  it('keeps images that already fit', () => {
    expect(targetDimensions(800, 600)).toEqual({ width: 800, height: 600 });
  });

  it('scales a large landscape photo so its longest side is the maximum', () => {
    expect(targetDimensions(4000, 3000)).toEqual({ width: RECEIPT_MAX_SIDE, height: 1200 });
  });

  it('scales a large portrait photo on its height', () => {
    expect(targetDimensions(3000, 4000)).toEqual({ width: 1200, height: RECEIPT_MAX_SIDE });
  });
});

describe('receiptKey and limits', () => {
  it('puts every object of a group under its code prefix', () => {
    expect(receiptKey('abcd-efgh-jkmn', 'exp-1', 'att-1')).toBe('abcd-efgh-jkmn/exp-1/att-1');
  });

  it('allows one mebibyte', () => {
    expect(MAX_RECEIPT_BYTES).toBe(1_048_576);
  });
});
