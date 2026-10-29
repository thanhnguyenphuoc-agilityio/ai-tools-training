// Session time calculations and validation. Times are HH:mm in group-local time.
// No Date objects and no time zone: the times are group-local labels.

/** Matches HH:mm in 24-hour format (00:00 to 23:59). */
export const TIME_RE = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export interface ParsedSessionTime {
  hour: number;
  minute: number;
}

/** Parses HH:mm string. Returns { hour, minute } or null if invalid. */
export function parseSessionTime(value: string): ParsedSessionTime | null {
  if (typeof value !== 'string' || !TIME_RE.test(value)) return null;
  const [h, m] = value.split(':').map(Number);
  return { hour: h, minute: m };
}

/** Converts valid HH:mm to minutes from midnight (0 to 1439). Throws if invalid. */
export function toMinutes(hhmm: string): number {
  const parsed = parseSessionTime(hhmm);
  if (!parsed) throw new Error(`Invalid session time: ${hhmm}`);
  return parsed.hour * 60 + parsed.minute;
}

/** True when end is earlier in clock time than start, meaning the session crosses midnight. */
export function endsNextDay(start: string, end: string): boolean {
  return toMinutes(end) < toMinutes(start);
}

/** Duration in minutes. Adds 1440 minutes (24 h) when ending the next day. */
export function sessionMinutes(start: string, end: string): number {
  const s = toMinutes(start);
  const e = toMinutes(end);
  if (e < s) {
    return e + 1440 - s;
  }
  return e - s;
}

/** Validates that both times are valid HH:mm strings and start does not equal end. */
export function isValidSessionTimes(start: string, end: string): boolean {
  if (!parseSessionTime(start) || !parseSessionTime(end)) return false;
  return start !== end;
}

/**
 * True when the participants of a session cost are exactly the members present. A removed member who is present
 * but takes no part in the cost is ignored: a new cost can only include active members, so the flag would never
 * clear for such a session. A removed member who shares the cost is compared like anyone else.
 */
export function attendanceMatches(
  presentIds: string[],
  shares: { memberId: string }[],
  removedIds: Iterable<string>,
): boolean {
  const participants = new Set(shares.map((s) => s.memberId));
  const removed = new Set(removedIds);
  const expected = new Set(presentIds.filter((id) => !removed.has(id) || participants.has(id)));
  if (expected.size !== participants.size) return false;
  for (const id of participants) if (!expected.has(id)) return false;
  return true;
}
