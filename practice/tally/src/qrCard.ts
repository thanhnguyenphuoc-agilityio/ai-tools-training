// Error correction H recovers about 30% of the code, so the bank logo in the centre does not stop it scanning.
export const QR_OPTIONS = { width: 260, margin: 2, errorCorrectionLevel: 'H' } as const;

export const VIETQR_WORDMARK = '/qr/vietqr.svg';
export const VIETQR_MARK = '/qr/vietqr-mark.svg';

/** Logos are bundled for every bank in `shared/banks.json`; a missing file falls back to the VietQR mark. */
export function bankLogo(bin: string): string {
  return `/bank-logos/${bin}.png`;
}
