// Shrinks a phone photo before upload (receipt_photos). Drawing the image on a canvas and encoding it again also drops
// the EXIF and GPS metadata. No dependency: createImageBitmap and canvas are built into the browser.
import { MAX_RECEIPT_BYTES, RECEIPT_MAX_SIDE, targetDimensions } from '../shared/receipts';

/** The photo is still over MAX_RECEIPT_BYTES after every retry. Shown to the user as expenses.receipt.tooLarge. */
export class ReceiptTooLargeError extends Error {
  readonly code = 'RECEIPT_TOO_LARGE';
  constructor() {
    super('Receipt photo is too large');
    this.name = 'ReceiptTooLargeError';
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Canvas toBlob failed'))), type, quality);
  });
}

/**
 * Returns the photo as WebP (JPEG when the browser cannot encode WebP), at most RECEIPT_MAX_SIDE px on its longest
 * side and at most MAX_RECEIPT_BYTES. Retries with a lower quality, then a smaller size.
 */
export async function prepareReceipt(file: File | Blob): Promise<Blob> {
  if (typeof createImageBitmap === 'undefined') {
    // Without canvas the photo cannot be re-encoded: it is sent as it is when it is small enough.
    if (file.size > MAX_RECEIPT_BYTES) throw new ReceiptTooLargeError();
    return file;
  }

  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get canvas context');

    const draw = (maxSide: number) => {
      const size = targetDimensions(bitmap.width, bitmap.height, maxSide);
      canvas.width = size.width;
      canvas.height = size.height;
      ctx.clearRect(0, 0, size.width, size.height);
      ctx.drawImage(bitmap, 0, 0, size.width, size.height);
    };

    draw(RECEIPT_MAX_SIDE);
    let blob = await canvasToBlob(canvas, 'image/webp', 0.82);
    // Browsers that cannot encode WebP hand back PNG; JPEG is the fallback format.
    const format = blob.type === 'image/webp' ? 'image/webp' : 'image/jpeg';
    if (blob.type !== format) blob = await canvasToBlob(canvas, format, 0.82);

    if (blob.size > MAX_RECEIPT_BYTES) blob = await canvasToBlob(canvas, format, 0.6);

    if (blob.size > MAX_RECEIPT_BYTES) {
      draw(1200);
      blob = await canvasToBlob(canvas, format, 0.6);
    }

    if (blob.size > MAX_RECEIPT_BYTES) throw new ReceiptTooLargeError();
    return blob;
  } finally {
    bitmap.close();
  }
}
