// The spreadsheet export of a group (ticket csv_export): one CSV file with every expense and transfer.
// Pure, so it is unit tested in Node; the browser download lives in download.ts.
import { getCurrency } from '../shared/currency';
import { toDecimalString } from '../shared/money';
import type { GroupDto, TransferDto } from '../shared/types';
import { raw, text, toCsv, type CsvCell } from './csv';
import { todayLocal } from './dates';
import { memberName } from './expenseRow';
import type { MessageKey, Vars } from './i18n/types';

export type Translate = (key: MessageKey, vars?: Vars) => string;

const STATUS: Record<TransferDto['status'], MessageKey> = {
  sent: 'csvExport.status.sent',
  confirmed: 'csvExport.status.confirmed',
};

/** Fixed columns, before the share columns. */
const COLUMNS: MessageKey[] = [
  'csvExport.columns.type',
  'csvExport.columns.date',
  'csvExport.columns.description',
  'csvExport.columns.paidBy',
  'csvExport.columns.receivedBy',
  'csvExport.columns.amount',
  'csvExport.columns.currency',
  'csvExport.columns.status',
];

interface Row {
  day: string;
  createdAt: string;
  id: string;
  cells: CsvCell[];
}

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Columns: type, date, description, paid by, received by, amount, currency, status, then one share column per
 * member. Expenses fill the share columns from their stored shares (whatever the split mode); transfers leave
 * them empty and fill "received by" and "status". Deleted expenses are not in the DTO, so they are not exported.
 * Rows are chronological. Amounts are in major units, with the currency code in its own column.
 */
export function buildGroupCsv(group: GroupDto, t: Translate): string {
  const currency = getCurrency(group.currency);
  if (!currency) throw new Error(`Unsupported currency: ${group.currency}`);
  const unknown = t('common.unknownMember');
  const nameOf = (id: string) => memberName(group.members, id, unknown);
  const amount = (minor: number) => raw(toDecimalString(minor, currency));
  const empty = raw('');

  // One share column per member. A share whose member is gone gets a column of its own, so no share is dropped.
  const shareColumns = group.members.map((m) => ({ id: m.id, name: m.name }));
  for (const e of group.expenses) {
    for (const s of e.shares) {
      if (!shareColumns.some((c) => c.id === s.memberId)) shareColumns.push({ id: s.memberId, name: unknown });
    }
  }

  const header = COLUMNS.map((key) => text(t(key)));
  for (const c of shareColumns) header.push(text(t('csvExport.shareOf', { name: c.name })));

  const rows: Row[] = [
    ...group.expenses.map((e) => ({
      day: e.spentOn,
      createdAt: e.createdAt,
      id: e.id,
      cells: [
        text(t('csvExport.types.expense')),
        raw(e.spentOn),
        text(e.description),
        text(nameOf(e.payerId)),
        empty,
        amount(e.amount),
        raw(currency.code),
        empty,
        ...shareColumns.map((c) => {
          const share = e.shares.find((s) => s.memberId === c.id);
          return share ? amount(share.amount) : empty;
        }),
      ],
    })),
    ...group.transfers.map((tr) => {
      // A transfer has no calendar date of its own: use the day it was recorded as sent, on this device.
      const day = todayLocal(new Date(tr.createdAt));
      return {
        day,
        createdAt: tr.createdAt,
        id: tr.id,
        cells: [
          text(t('csvExport.types.transfer')),
          raw(day),
          empty,
          text(nameOf(tr.fromId)),
          text(nameOf(tr.toId)),
          amount(tr.amount),
          raw(currency.code),
          text(t(STATUS[tr.status])),
          ...shareColumns.map(() => empty),
        ],
      };
    }),
  ];
  rows.sort((a, b) => compare(a.day, b.day) || compare(a.createdAt, b.createdAt) || compare(a.id, b.id));

  return toCsv([header, ...rows.map((r) => r.cells)]);
}

/**
 * Characters Windows, macOS or Linux do not allow in a file name, C0 and C1 control characters, and the bidi
 * embedding, override and isolate controls (U+202A-U+202E, U+2066-U+2069), which can make a name display reversed.
 */
const UNSAFE_IN_FILE_NAME = /[\\/:*?"<>|\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g;
const MAX_NAME_LENGTH = 60;

function safeFileStem(name: string): string {
  const cleaned = name
    .replace(UNSAFE_IN_FILE_NAME, '-')
    .replace(/\s+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '');
  // Cut by code point, not UTF-16 unit, so an emoji is never split in half.
  return Array.from(cleaned).slice(0, MAX_NAME_LENGTH).join('').replace(/[-.]+$/, '');
}

/**
 * "<group name>-<YYYY-MM-DD>.csv". Only the group name is used: no group code (it opens the group) and no
 * member data. `fallback` (the app title) is used when nothing of the name is left.
 */
export function csvFileName(groupName: string, today: string, fallback: string): string {
  return `${safeFileStem(groupName) || safeFileStem(fallback)}-${today}.csv`;
}
