// Date helpers that are not about display (display lives in i18n).

/**
 * Today's date in the device's time zone, as YYYY-MM-DD. Built from the local
 * calendar fields: toISOString() would give the UTC date, which is a day off
 * around midnight for any zone other than UTC.
 */
export function todayLocal(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
