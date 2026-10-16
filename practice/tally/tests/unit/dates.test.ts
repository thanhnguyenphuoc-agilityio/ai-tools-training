import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { todayLocal } from '../../src/dates';

// The default expense date must be "today" in the time zone of the device.
// Each test fixes both the clock and the time zone, so the result does not
// depend on the machine running the tests.
describe('todayLocal', () => {
  let originalTz: string | undefined;

  beforeEach(() => {
    originalTz = process.env.TZ;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  });

  // Changing process.env.TZ at run time only works in a forked process (see `pool` in vitest.config.ts).
  // ICU may report an alias (Asia/Saigon for Asia/Ho_Chi_Minh), so both names are compared in canonical form.
  function useTimeZone(timeZone: string): void {
    process.env.TZ = timeZone;
    const active = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const requested = new Intl.DateTimeFormat('en-US', { timeZone }).resolvedOptions().timeZone;
    if (active !== requested) {
      throw new Error(`Switching the time zone to ${timeZone} had no effect (active: ${active}); run with pool 'forks'.`);
    }
  }

  function at(timeZone: string, instant: string): string {
    useTimeZone(timeZone);
    vi.setSystemTime(new Date(instant));
    return todayLocal();
  }

  it('returns the local date just after midnight in a zone ahead of UTC', () => {
    // 2026-10-14 00:40 in UTC+7 is still 2026-10-13 in UTC.
    expect(at('Asia/Ho_Chi_Minh', '2026-10-14T00:40:00+07:00')).toBe('2026-10-14');
  });

  it('returns the local date late in the evening in a zone behind UTC', () => {
    // 2026-10-13 18:00 in UTC-7 is already 2026-10-14 in UTC.
    expect(at('America/Los_Angeles', '2026-10-13T18:00:00-07:00')).toBe('2026-10-13');
  });

  it('returns the local date in the middle of the day', () => {
    expect(at('Asia/Ho_Chi_Minh', '2026-10-14T12:00:00+07:00')).toBe('2026-10-14');
    expect(at('America/Los_Angeles', '2026-10-13T12:00:00-07:00')).toBe('2026-10-13');
  });

  it('pads single-digit months and days of the given local date', () => {
    useTimeZone('Asia/Ho_Chi_Minh');
    expect(todayLocal(new Date(2026, 2, 5, 9))).toBe('2026-03-05');
  });
});
