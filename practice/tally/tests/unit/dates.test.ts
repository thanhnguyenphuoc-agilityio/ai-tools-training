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

  function at(timeZone: string, instant: string): string {
    process.env.TZ = timeZone;
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

  it('pads single-digit months and days', () => {
    expect(at('Asia/Ho_Chi_Minh', '2026-03-05T09:00:00+07:00')).toBe('2026-03-05');
  });
});
