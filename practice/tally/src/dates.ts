// Date helpers that are not about display (display lives in i18n).

/** Today's date in the browser's timezone, as YYYY-MM-DD. */
export function todayLocal(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
