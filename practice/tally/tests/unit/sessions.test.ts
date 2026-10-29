import { describe, expect, it } from 'vitest';
import {
  attendanceMatches,
  endsNextDay,
  isValidSessionTimes,
  parseSessionTime,
  sessionMinutes,
  toMinutes,
} from '../../shared/sessions';

// attendance_split: time rules of a session. Times are HH:mm in group-local time, so no Date object is involved.
describe('sessions shared utilities', () => {
  describe('parseSessionTime', () => {
    it('parses valid HH:mm strings', () => {
      expect(parseSessionTime('00:00')).toEqual({ hour: 0, minute: 0 });
      expect(parseSessionTime('21:05')).toEqual({ hour: 21, minute: 5 });
      expect(parseSessionTime('23:59')).toEqual({ hour: 23, minute: 59 });
    });

    it('rejects out-of-range or malformed values', () => {
      expect(parseSessionTime('24:00')).toBeNull();
      expect(parseSessionTime('9:00')).toBeNull();
      expect(parseSessionTime('12:60')).toBeNull();
      expect(parseSessionTime('12-30')).toBeNull();
      expect(parseSessionTime('')).toBeNull();
    });

    it('rejects a value that is not a string', () => {
      expect(parseSessionTime(900 as unknown as string)).toBeNull();
      expect(parseSessionTime(undefined as unknown as string)).toBeNull();
    });
  });

  describe('toMinutes', () => {
    it('counts minutes from midnight', () => {
      expect(toMinutes('00:00')).toBe(0);
      expect(toMinutes('21:00')).toBe(1260);
      expect(toMinutes('23:59')).toBe(1439);
    });

    it('throws on an invalid time', () => {
      expect(() => toMinutes('24:00')).toThrow();
    });
  });

  describe('endsNextDay and sessionMinutes', () => {
    it('a session that ends after midnight ends the next day: 21:00-00:30 is 3 h 30 min', () => {
      expect(endsNextDay('21:00', '00:30')).toBe(true);
      expect(sessionMinutes('21:00', '00:30')).toBe(210);
    });

    it('a session that ends the same day does not cross midnight', () => {
      expect(endsNextDay('19:00', '21:00')).toBe(false);
      expect(sessionMinutes('19:00', '21:00')).toBe(120);
    });
  });

  describe('isValidSessionTimes', () => {
    it('accepts two different valid times', () => {
      expect(isValidSessionTimes('21:00', '00:30')).toBe(true);
      expect(isValidSessionTimes('19:00', '21:00')).toBe(true);
    });

    it('rejects equal times and malformed times', () => {
      expect(isValidSessionTimes('09:00', '09:00')).toBe(false);
      expect(isValidSessionTimes('24:00', '01:00')).toBe(false);
      expect(isValidSessionTimes('9:00', '10:00')).toBe(false);
    });
  });
});

describe('attendanceMatches', () => {
  it('matches when the participants are exactly the members present', () => {
    expect(attendanceMatches(['sam', 'alex'], [{ memberId: 'alex' }, { memberId: 'sam' }], [])).toBe(true);
  });

  it('flags a cost whose participants differ from the attendance', () => {
    expect(attendanceMatches(['sam', 'alex'], [{ memberId: 'alex' }], [])).toBe(false);
    expect(attendanceMatches(['sam'], [{ memberId: 'alex' }], [])).toBe(false);
  });

  it('ignores a removed member who is present but cannot be a participant of a new cost', () => {
    expect(attendanceMatches(['sam', 'alex', 'jamie'], [{ memberId: 'alex' }, { memberId: 'sam' }], ['jamie'])).toBe(
      true,
    );
  });

  it('keeps comparing a removed member who shares the cost', () => {
    const shares = [{ memberId: 'alex' }, { memberId: 'jamie' }];
    expect(attendanceMatches(['alex', 'jamie'], shares, ['jamie'])).toBe(true);
    expect(attendanceMatches(['alex'], shares, ['jamie'])).toBe(false);
  });
});
