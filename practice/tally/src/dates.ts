// Date helpers that are not about display (display lives in i18n).

/** Today's date in the browser's timezone, as YYYY-MM-DD. */
export function todayLocal(): string {
  return new Date().toISOString().slice(0, 10);
}
