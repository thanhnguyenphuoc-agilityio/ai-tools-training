export type Ticket = { id: string; name: string; title: string; body: string; fields: Record<string, string> };
export type BoardField = { id: string; name: string; options?: { id: string; name: string }[] };
export type BoardItem = {
  id: string;
  kind: 'draft' | 'issue' | 'pr';
  contentId?: string;
  repo?: string;
  closed?: boolean;
  title: string;
  body: string;
  values: Record<string, string>;
};
export type Action = {
  kind: 'create' | 'convert' | 'update' | 'same';
  ticket: Ticket;
  item?: BoardItem;
  content: string[];
  fields: string[];
};

export const STATUSES: string[];
export const FIELD_KEYS: string[];
export function norm(s: unknown): string;
export function displayName(s: string): string;
export function fieldName(key: string): string;
export function findOption<T extends { name?: string }>(options: T[], value: string): T | undefined;
export function parseTicket(text: string, name: string, status: string): Ticket;
export function readTickets(dir: string): Ticket[];
export function planSync(
  tickets: Ticket[],
  items: BoardItem[],
  fields: BoardField[],
  repo?: string,
): {
  newFields: { name: string; options: string[] }[];
  missingOptions: string[];
  actions: Action[];
  unmatched: BoardItem[];
};
