// Groups this browser has opened. Device-only convenience; storage may be
// unavailable (private mode), so every access is guarded.
const KEY = 'tally.history';
const MAX = 20;

export interface HistoryEntry {
  code: string;
  name: string;
  visitedAt: string;
}

export function readHistory(): HistoryEntry[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(entries: HistoryEntry[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(entries.slice(0, MAX)));
  } catch {
    // ignore
  }
}

export function rememberGroup(code: string, name: string) {
  write([{ code, name, visitedAt: new Date().toISOString() }, ...readHistory().filter((e) => e.code !== code)]);
}

export function forgetGroup(code: string) {
  write(readHistory().filter((e) => e.code !== code));
}
