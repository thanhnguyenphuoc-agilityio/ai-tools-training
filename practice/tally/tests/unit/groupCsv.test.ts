import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ExpenseDto, GroupDto, MemberDto, TransferDto } from '../../shared/types';
import { UTF8_BOM } from '../../src/csv';
import { buildGroupCsv, csvFileName, type Translate } from '../../src/groupCsv';
import { enLocale } from '../../src/i18n/locales/en';
import { viLocale } from '../../src/i18n/locales/vi';
import type { LocaleBundle } from '../../src/i18n/types';

function translator(bundle: LocaleBundle): Translate {
  return (key, vars = {}) => {
    const template = key.split('.').reduce<unknown>((n, p) => (n as Record<string, unknown>)[p], bundle.messages);
    if (typeof template !== 'string') throw new Error(`no message for ${key}`);
    return template.replace(/\{(\w+)\}/g, (m, name) => (name in vars ? String(vars[name]) : m));
  };
}
const en = translator(enLocale);

const member = (id: string, name: string): MemberDto => ({
  id,
  name,
  isOwner: id === 'alex',
  claimed: true,
  removed: false,
  removedReason: null,
  bankBin: null,
  accountNo: null,
  accountName: null,
});

const expense = (e: Partial<ExpenseDto> & Pick<ExpenseDto, 'id' | 'payerId' | 'amount' | 'shares'>): ExpenseDto => ({
  description: 'Expense',
  spentOn: '2026-10-01',
  splitMode: 'equal',
  createdBy: e.payerId,
  createdAt: '2026-10-01T09:00:00.000Z',
  ...e,
});

const share = (memberId: string, amount: number) => ({ memberId, weight: 1, amount });

// A transfer's date is the local day it was recorded on, so the tests fix the time zone (UTC+7). Changing
// process.env.TZ at run time only works in a forked process (see `pool` in vitest.config.ts).
let originalTz: string | undefined;
beforeAll(() => {
  originalTz = process.env.TZ;
  process.env.TZ = 'Asia/Ho_Chi_Minh';
  expect(new Date('2026-10-01T18:30:00.000Z').getDate()).toBe(2);
});
afterAll(() => {
  if (originalTz === undefined) delete process.env.TZ;
  else process.env.TZ = originalTz;
});

const transfer = (t: Pick<TransferDto, 'id' | 'fromId' | 'toId' | 'amount' | 'status' | 'createdAt'>): TransferDto => ({
  confirmedAt: t.status === 'confirmed' ? t.createdAt : null,
  ...t,
});

function group(overrides: Partial<GroupDto> = {}): GroupDto {
  return {
    code: 'abcd-efgh-jkmn',
    name: 'Weekend trip',
    currency: 'USD',
    roundTo: 1,
    createdAt: '2026-10-01T08:00:00.000Z',
    lastActivityAt: '2026-10-03T12:00:00.000Z',
    expiresAt: '2026-10-13T12:00:00.000Z',
    currencyLocked: true,
    members: [member('alex', 'Alex'), member('sam', 'Sam'), member('jamie', 'Jamie')],
    // The API lists expenses and transfers newest first.
    expenses: [
      expense({
        id: 'e2',
        payerId: 'sam',
        amount: 9_000,
        description: 'Dinner, first night',
        spentOn: '2026-10-02',
        createdAt: '2026-10-02T20:00:00.000Z',
        shares: [share('alex', 3_000), share('sam', 3_000), share('jamie', 3_000)],
      }),
      expense({
        id: 'e1',
        payerId: 'alex',
        amount: 1_000,
        description: 'Snacks',
        shares: [share('alex', 500), share('sam', 500)],
      }),
    ],
    transfers: [
      transfer({
        id: 't2',
        fromId: 'alex',
        toId: 'sam',
        amount: 2_500,
        status: 'sent',
        createdAt: '2026-10-03T12:00:00.000Z',
      }),
      transfer({
        id: 't1',
        fromId: 'jamie',
        toId: 'sam',
        amount: 3_000,
        status: 'confirmed',
        createdAt: '2026-10-01T12:00:00.000Z',
      }),
    ],
    canLinkAccount: false,
    me: { memberId: 'alex', isOwner: true },
    ...overrides,
  };
}

/** The CSV without its BOM, split into lines (the final CRLF leaves an empty last item, dropped here). */
function lines(csv: string): string[] {
  expect(csv.startsWith(UTF8_BOM)).toBe(true);
  expect(csv.endsWith('\r\n')).toBe(true);
  return csv.slice(UTF8_BOM.length, -2).split('\r\n');
}

describe('buildGroupCsv', () => {
  it('writes expenses and transfers in one chronological table with a share column per member', () => {
    expect(lines(buildGroupCsv(group(), en))).toEqual([
      'Type,Date,Description,Paid by,Received by,Amount,Currency,Status,Share: Alex,Share: Sam,Share: Jamie',
      'Expense,2026-10-01,Snacks,Alex,,10.00,USD,,5.00,5.00,',
      'Transfer,2026-10-01,,Jamie,Sam,30.00,USD,Confirmed,,,',
      'Expense,2026-10-02,"Dinner, first night",Sam,,90.00,USD,,30.00,30.00,30.00',
      'Transfer,2026-10-03,,Alex,Sam,25.00,USD,Sent,,,',
    ]);
  });

  it('dates a transfer with the local day it was recorded on', () => {
    // 18:30 UTC on 1 October is 01:30 on 2 October in UTC+7.
    const late = group({
      expenses: [],
      transfers: [
        transfer({
          id: 't1',
          fromId: 'alex',
          toId: 'sam',
          amount: 100,
          status: 'sent',
          createdAt: '2026-10-01T18:30:00.000Z',
        }),
      ],
    });
    expect(lines(buildGroupCsv(late, en))[1]).toBe('Transfer,2026-10-02,,Alex,Sam,1.00,USD,Sent,,,');
  });

  it('writes whole numbers for a zero-digit currency', () => {
    const vnd = group({
      currency: 'VND',
      expenses: [
        expense({
          id: 'e1',
          payerId: 'alex',
          amount: 300_000,
          shares: [share('alex', 150_000), share('sam', 150_000)],
        }),
      ],
      transfers: [],
    });
    expect(lines(buildGroupCsv(vnd, en))[1]).toBe('Expense,2026-10-01,Expense,Alex,,300000,VND,,150000,150000,');
  });

  it('keeps a zero share apart from a member who does not take part', () => {
    const rounded = group({
      expenses: [expense({ id: 'e1', payerId: 'alex', amount: 100, shares: [share('alex', 100), share('sam', 0)] })],
      transfers: [],
    });
    expect(lines(buildGroupCsv(rounded, en))[1]).toBe('Expense,2026-10-01,Expense,Alex,,1.00,USD,,1.00,0.00,');
  });

  it('reads the stored shares, whatever the split mode', () => {
    const exact = group({
      expenses: [
        expense({
          id: 'e1',
          payerId: 'sam',
          amount: 1_000,
          splitMode: 'exact',
          shares: [share('alex', 700), share('jamie', 300)],
        }),
      ],
      transfers: [],
    });
    expect(lines(buildGroupCsv(exact, en))[1]).toBe('Expense,2026-10-01,Expense,Sam,,10.00,USD,,7.00,,3.00');
  });

  it('guards descriptions and names against formulas and quotes them per RFC 4180', () => {
    const risky = group({
      members: [member('alex', '@Alex'), member('sam', 'Sam "S"')],
      expenses: [
        expense({
          id: 'e1',
          payerId: 'alex',
          amount: 100,
          description: '=HYPERLINK("x")',
          shares: [share('alex', 100)],
        }),
        expense({
          id: 'e2',
          payerId: 'sam',
          amount: 100,
          description: '-5 deposit\nreturned',
          shares: [share('sam', 100)],
        }),
      ],
      transfers: [],
    });
    // A line break inside a quoted field is a bare LF; rows end with CRLF.
    expect(lines(buildGroupCsv(risky, en))).toEqual([
      `Type,Date,Description,Paid by,Received by,Amount,Currency,Status,Share: @Alex,"Share: Sam ""S"""`,
      `Expense,2026-10-01,"'=HYPERLINK(""x"")",'@Alex,,1.00,USD,,1.00,`,
      `Expense,2026-10-01,"'-5 deposit\nreturned","Sam ""S""",,1.00,USD,,,1.00`,
    ]);
  });

  it('keeps non-ASCII text as it is', () => {
    const accented = group({
      expenses: [
        expense({
          id: 'e1',
          payerId: 'alex',
          amount: 100,
          description: '\u0102n t\u1ed1i',
          shares: [share('alex', 100)],
        }),
      ],
      transfers: [],
    });
    expect(lines(buildGroupCsv(accented, en))[1]).toContain(',\u0102n t\u1ed1i,');
  });

  it('adds a column for a share whose member is not in the group, so shares still add up', () => {
    const gone = group({
      members: [member('alex', 'Alex')],
      expenses: [
        expense({ id: 'e1', payerId: 'alex', amount: 1_000, shares: [share('alex', 600), share('left', 400)] }),
      ],
      transfers: [],
    });
    expect(lines(buildGroupCsv(gone, en))).toEqual([
      'Type,Date,Description,Paid by,Received by,Amount,Currency,Status,Share: Alex,Share: (unknown 1)',
      'Expense,2026-10-01,Expense,Alex,,10.00,USD,,6.00,4.00',
    ]);
  });

  it('numbers the columns of several missing members so their headers stay distinct', () => {
    const gone = group({
      members: [member('alex', 'Alex')],
      expenses: [
        expense({ id: 'e2', payerId: 'alex', amount: 900, shares: [share('alex', 300), share('left-b', 600)] }),
        expense({ id: 'e1', payerId: 'alex', amount: 1_000, shares: [share('alex', 600), share('left-a', 400)] }),
      ],
      transfers: [],
    });
    const [header, ...rows] = lines(buildGroupCsv(gone, en));
    const shareHeaders = header.split(',').slice(8);
    expect(shareHeaders).toEqual(['Share: Alex', 'Share: (unknown 1)', 'Share: (unknown 2)']);
    expect(new Set(shareHeaders).size).toBe(shareHeaders.length);
    // Each row's shares still add up to its amount (both columns are in major units, two digits).
    for (const row of rows) {
      const cells = row.split(',');
      const shares = cells
        .slice(8)
        .filter((c) => c !== '')
        .map((c) => Math.round(Number(c) * 100));
      expect(shares.reduce((a, b) => a + b, 0)).toBe(Math.round(Number(cells[5]) * 100));
    }
  });

  it('writes only the header for an empty group', () => {
    expect(lines(buildGroupCsv(group({ expenses: [], transfers: [] }), en))).toEqual([
      'Type,Date,Description,Paid by,Received by,Amount,Currency,Status,Share: Alex,Share: Sam,Share: Jamie',
    ]);
  });

  it('takes headers, types and statuses from the locale', () => {
    const vi = translator(viLocale);
    const [header, , confirmed] = lines(buildGroupCsv(group(), vi));
    expect(header.split(',').slice(0, 9)).toEqual([
      ...Object.values(viLocale.messages.csvExport.columns),
      vi('csvExport.shareOf', { name: 'Alex' }),
    ]);
    expect(confirmed.startsWith(`${vi('csvExport.types.transfer')},`)).toBe(true);
    expect(confirmed).toContain(`,${vi('csvExport.status.confirmed')},`);
  });

  it('rejects a currency it does not know', () => {
    expect(() => buildGroupCsv(group({ currency: 'XXX' }), en)).toThrow();
  });
});

describe('csvFileName', () => {
  it('uses the group name and the date', () => {
    expect(csvFileName('Weekend trip', '2026-10-14', 'Tally')).toBe('Weekend-trip-2026-10-14.csv');
  });

  it('replaces characters that are not allowed in file names', () => {
    expect(csvFileName('Trip: 10/2026 "A|B"?', '2026-10-14', 'Tally')).toBe('Trip-10-2026-A-B-2026-10-14.csv');
  });

  it('keeps letters with diacritics', () => {
    expect(csvFileName('Qu\u1ef9 nh\u00f3m', '2026-10-14', 'Tally')).toBe('Qu\u1ef9-nh\u00f3m-2026-10-14.csv');
  });

  it('caps the name length without splitting a character', () => {
    const name = csvFileName(`${'a'.repeat(59)}\u{1F600}\u{1F600}`, '2026-10-14', 'Tally');
    expect(name).toBe(`${'a'.repeat(59)}\u{1F600}-2026-10-14.csv`);
  });

  it('removes C1 and bidirectional control characters', () => {
    // U+202E (right-to-left override) would display "Trip<RLO>vsc.exe" as "Tripexe.csv".
    expect(csvFileName('Trip\u202evsc.exe', '2026-10-14', 'Tally')).toBe('Trip-vsc.exe-2026-10-14.csv');
    expect(csvFileName('\u2066Rent\u2069\u0085', '2026-10-14', 'Tally')).toBe('Rent-2026-10-14.csv');
    expect(csvFileName('A\u202ab\u2068c\u009fd', '2026-10-14', 'Tally')).toBe('A-b-c-d-2026-10-14.csv');
  });

  it('falls back to the app title when nothing of the name is left', () => {
    expect(csvFileName('???', '2026-10-14', 'Tally')).toBe('Tally-2026-10-14.csv');
  });
});
