import { describe, expect, it } from 'vitest';
import { csvCell, guardFormula, quoteField, raw, text, toCsv, UTF8_BOM } from '../../src/csv';

describe('guardFormula', () => {
  it.each(['=SUM(A1:A9)', '+1', '-2+3', '@cmd', '\tx', '\rx', '\n=1+1'])('prefixes %j with a quote', (value) => {
    expect(guardFormula(value)).toBe(`'${value}`);
  });

  it.each(['Dinner', '', '1+1', 'a=b', ' =1', "'quoted"])('leaves %j as it is', (value) => {
    expect(guardFormula(value)).toBe(value);
  });
});

describe('quoteField', () => {
  it('leaves plain fields unquoted', () => {
    expect(quoteField('Dinner')).toBe('Dinner');
    expect(quoteField('')).toBe('');
  });

  it('quotes fields with commas, quotes or line breaks and doubles the quotes', () => {
    expect(quoteField('Taxi, airport')).toBe('"Taxi, airport"');
    expect(quoteField('The "big" one')).toBe('"The ""big"" one"');
    expect(quoteField('line 1\nline 2')).toBe('"line 1\nline 2"');
    expect(quoteField('a\r\nb')).toBe('"a\r\nb"');
  });
});

describe('csvCell', () => {
  it('guards text cells, then quotes them', () => {
    expect(csvCell(text('=HYPERLINK("x")'))).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell(text('-5, maybe'))).toBe(`"'-5, maybe"`);
  });

  it('does not guard raw cells written by the app', () => {
    expect(csvCell(raw('-12.50'))).toBe('-12.50');
  });
});

describe('toCsv', () => {
  it('starts with a BOM and ends every row with CRLF', () => {
    const csv = toCsv([
      [text('Name'), text('Amount')],
      [text('Caf\u00e9'), raw('12.50')],
    ]);
    expect(csv.startsWith(UTF8_BOM)).toBe(true);
    expect(csv).toBe(`${UTF8_BOM}Name,Amount\r\nCaf\u00e9,12.50\r\n`);
  });

  it('keeps empty cells as empty fields', () => {
    expect(toCsv([[text('a'), text(''), raw('')]])).toBe(`${UTF8_BOM}a,,\r\n`);
  });

  it('writes a BOM only for no rows', () => {
    expect(toCsv([])).toBe(UTF8_BOM);
  });
});
