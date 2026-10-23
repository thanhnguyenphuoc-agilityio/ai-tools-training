// VietQR (NAPAS 247) payload builder. The payload is EMVCo "merchant presented
// mode": a flat list of TLV fields (2-digit id, 2-digit length, value) ending
// with a CRC-16/CCITT-FALSE checksum. Banking apps scan the payload string; the
// QR image itself is drawn by the UI.

import { MAX_AMOUNT } from './currency';

const NAPAS_GUID = 'A000000727';
const SERVICE_TO_ACCOUNT = 'QRIBFTTA';
const CURRENCY_VND = '704';
export const MAX_MESSAGE_LENGTH = 50;

export interface VietQrInput {
  /** 6-digit bank BIN, e.g. 970436 for Vietcombank. */
  bin: string;
  accountNo: string;
  /** Integer VND. Omit for a static QR where the payer types the amount. */
  amount?: number;
  /** Transfer description. Sanitized to ASCII by sanitizeTransferMessage. */
  message?: string;
}

function tlv(id: string, value: string): string {
  if (value.length > 99) throw new Error(`VietQR field ${id} is longer than 99 characters`);
  return id + String(value.length).padStart(2, '0') + value;
}

/** CRC-16/CCITT-FALSE: poly 0x1021, init 0xFFFF, no reflection, no final xor. */
export function crc16ccitt(data: string): string {
  let crc = 0xffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/**
 * Banks reject most non-ASCII in the transfer description, so: strip
 * diacritics, map the Vietnamese d-with-stroke (U+0111 / U+0110) to D,
 * upper-case, keep only A-Z, 0-9 and single spaces, cap the length.
 */
export function sanitizeTransferMessage(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0111/g, 'd')
    .replace(/\u0110/g, 'D')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_MESSAGE_LENGTH)
    .trim();
}

export function buildVietQrPayload(input: VietQrInput): string {
  if (!/^\d{6}$/.test(input.bin)) throw new Error('bank BIN must be 6 digits');
  if (!/^[0-9A-Za-z]{4,19}$/.test(input.accountNo)) throw new Error('account number must be 4-19 letters or digits');
  if (input.amount !== undefined && (!Number.isSafeInteger(input.amount) || input.amount <= 0 || input.amount > MAX_AMOUNT)) {
    throw new Error('amount must be a positive integer');
  }

  const beneficiary = tlv('00', input.bin) + tlv('01', input.accountNo);
  const merchantInfo = tlv('00', NAPAS_GUID) + tlv('01', beneficiary) + tlv('02', SERVICE_TO_ACCOUNT);
  const message = input.message ? sanitizeTransferMessage(input.message) : '';

  let payload =
    tlv('00', '01') +
    tlv('01', input.amount ? '12' : '11') +
    tlv('38', merchantInfo) +
    tlv('53', CURRENCY_VND);
  if (input.amount) payload += tlv('54', String(input.amount));
  payload += tlv('58', 'VN');
  if (message) payload += tlv('62', tlv('08', message));

  payload += '6304';
  return payload + crc16ccitt(payload);
}

/** Splits a payload back into top-level fields. Used by tests and for debugging scans. */
export function parseTlv(payload: string): Map<string, string> {
  const fields = new Map<string, string>();
  let i = 0;
  while (i < payload.length) {
    const id = payload.slice(i, i + 2);
    const len = Number(payload.slice(i + 2, i + 4));
    if (!Number.isInteger(len) || i + 4 + len > payload.length) throw new Error(`malformed TLV at ${i}`);
    fields.set(id, payload.slice(i + 4, i + 4 + len));
    i += 4 + len;
  }
  return fields;
}
