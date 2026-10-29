// Receipt photos (receipt_photos): the limits and checks shared by the Worker and the browser.

/** Largest accepted upload, in bytes. The browser shrinks photos below this before uploading. */
export const MAX_RECEIPT_BYTES = 1_048_576;
/** Longest side of a stored photo, in pixels. */
export const RECEIPT_MAX_SIDE = 1600;
export const RECEIPT_TYPES = ['image/webp', 'image/jpeg', 'image/png'] as const;
export type ReceiptType = (typeof RECEIPT_TYPES)[number];

/** True when `value` is one of RECEIPT_TYPES (narrows the string without a cast). */
export function isReceiptType(value: string): value is ReceiptType {
  return (RECEIPT_TYPES as readonly string[]).includes(value);
}

/** The image type named by the leading bytes (magic numbers), or null when they match none of RECEIPT_TYPES. */
export function sniffImageType(bytes: Uint8Array): ReceiptType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'image/png';
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp';
  }
  return null;
}

/** Width and height that fit inside `maxSide` on the longest edge, keeping the aspect ratio. */
export function targetDimensions(
  width: number,
  height: number,
  maxSide = RECEIPT_MAX_SIDE,
): { width: number; height: number } {
  if (width <= maxSide && height <= maxSide) {
    return { width, height };
  }
  if (width >= height) {
    return {
      width: maxSide,
      height: Math.max(1, Math.round((height * maxSide) / width)),
    };
  }
  return {
    width: Math.max(1, Math.round((width * maxSide) / height)),
    height: maxSide,
  };
}

/** R2 object key: everything of a group sits under `<code>/`, so a purge deletes one prefix. */
export function receiptKey(code: string, expenseId: string, id: string): string {
  return `${code}/${expenseId}/${id}`;
}
