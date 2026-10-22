// CSV text for spreadsheet downloads (RFC 4180). Pure: no DOM, so it runs in Node tests.

/** Byte order mark. Without it, Excel reads a UTF-8 file in the system code page and garbles non-ASCII text. */
export const UTF8_BOM = '\ufeff';

const LINE_BREAK = '\r\n';

/** A cell: text written by people (guarded against formulas) or a value the app formatted itself. */
export type CsvCell = { text: string } | { raw: string };

export const text = (value: string): CsvCell => ({ text: value });
export const raw = (value: string): CsvCell => ({ raw: value });

/**
 * Characters that make a spreadsheet treat a cell as a formula (or start one after a tab or line break):
 * `=`, `+`, `-`, `@`, tab, carriage return and line feed, as in the OWASP "CSV injection" guidance.
 * Full-width variants are not included.
 */
const FORMULA_START = /^[=+\-@\t\r\n]/;

/** Prefixes a leading `'` so a spreadsheet shows the text instead of evaluating it. */
export function guardFormula(value: string): string {
  return FORMULA_START.test(value) ? `'${value}` : value;
}

/** Quotes a field per RFC 4180 when it contains a comma, a double quote, CR or LF; quotes are doubled. */
export function quoteField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function csvCell(cell: CsvCell): string {
  return quoteField('text' in cell ? guardFormula(cell.text) : cell.raw);
}

/** Rows -> CSV text with CRLF line endings, a final line break and a UTF-8 BOM. */
export function toCsv(rows: CsvCell[][]): string {
  return UTF8_BOM + rows.map((row) => row.map(csvCell).join(',') + LINE_BREAK).join('');
}
