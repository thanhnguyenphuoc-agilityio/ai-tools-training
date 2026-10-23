// Group codes look like "x7kq-m2pz-9hfw": 12 chars from a 31-char alphabet
// (lowercase + digits, without the look-alikes 0/o, 1/l/i). ~59 bits.
export const CODE_ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz';
const GROUP_SIZE = 4;
const GROUPS = 3;

export const GROUP_CODE_RE = /^[23456789abcdefghjkmnpqrstuvwxyz]{4}-[23456789abcdefghjkmnpqrstuvwxyz]{4}-[23456789abcdefghjkmnpqrstuvwxyz]{4}$/;

// Largest multiple of the alphabet size that fits in a byte. Bytes at or above
// it are rejected so every character is equally likely (no modulo bias).
const BYTE_LIMIT = 256 - (256 % CODE_ALPHABET.length);

export function generateGroupCode(): string {
  const chars: string[] = [];
  const buf = new Uint8Array(32);
  while (chars.length < GROUP_SIZE * GROUPS) {
    crypto.getRandomValues(buf);
    for (const b of buf) {
      if (b >= BYTE_LIMIT) continue;
      chars.push(CODE_ALPHABET[b % CODE_ALPHABET.length]);
      if (chars.length === GROUP_SIZE * GROUPS) break;
    }
  }
  const parts = [];
  for (let i = 0; i < GROUPS; i++) parts.push(chars.slice(i * GROUP_SIZE, (i + 1) * GROUP_SIZE).join(''));
  return parts.join('-');
}

/** Accepts what people paste ("X7KQ M2PZ 9HFW", a full link) and returns a canonical code or null. */
export function normalizeGroupCode(input: string): string | null {
  const fromLink = input.match(/\/g\/([^/?#\s]+)/);
  const raw = (fromLink ? fromLink[1] : input).toLowerCase().replace(/[\s-]/g, '');
  if (raw.length !== GROUP_SIZE * GROUPS) return null;
  const code = [raw.slice(0, 4), raw.slice(4, 8), raw.slice(8, 12)].join('-');
  return GROUP_CODE_RE.test(code) ? code : null;
}
