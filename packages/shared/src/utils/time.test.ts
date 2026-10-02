import { describe, it, expect } from 'vitest';
import {
  formatDuration,
  formatDurationClock,
  resolveTimeRange,
  renderProgressBar,
  getWeekStartDayIndex,
  parseDurationToMinutes,
  parseBreakToMinutes,
  formatFocusDuration,
  formatIntervalLabel,
  normalizeTimezone,
  getTimezoneLabel,
  formatDateIsoInTz,
  searchTimezones,
} from './time';
import { TimeRangePreset } from '../enums/index';

describe('Time Utilities', () => {
  describe('formatDuration', () => {
    it('should format 0 or negative seconds as 0s', () => {
      expect(formatDuration(0)).toBe('0s');
      expect(formatDuration(-15)).toBe('0s');
    });

    it('should format seconds only', () => {
      expect(formatDuration(45)).toBe('45s');
    });

    it('should format minutes and seconds', () => {
      expect(formatDuration(135)).toBe('2m 15s');
    });

    it('should format hours, minutes, and seconds', () => {
      expect(formatDuration(3665)).toBe('1h 1m 5s');
      expect(formatDuration(7200)).toBe('2h 0m');
    });
  });

  describe('formatDurationClock', () => {
    it('should format 0 seconds as 00:00:00', () => {
      expect(formatDurationClock(0)).toBe('00:00:00');
    });

    it('should format seconds into HH:MM:SS', () => {
      expect(formatDurationClock(3665)).toBe('01:01:05');
      expect(formatDurationClock(45)).toBe('00:00:45');
    });
  });

  describe('resolveTimeRange', () => {
    it('should resolve TODAY starting at 00:00:00 UTC', () => {
      const range = resolveTimeRange(TimeRangePreset.TODAY);
      expect(range.startDate.getUTCHours()).toBe(0);
      expect(range.startDate.getUTCMinutes()).toBe(0);
      expect(range.endDate.getTime()).toBeGreaterThan(range.startDate.getTime());
    });

    it('should resolve THIS_WEEK starting on Monday UTC by default', () => {
      const range = resolveTimeRange(TimeRangePreset.THIS_WEEK);
      expect(range.startDate.getUTCDay()).toBe(1); // Monday
      expect(range.startDate.getUTCHours()).toBe(0);
    });

    it('should resolve THIS_WEEK starting on Sunday UTC when configured', () => {
      const range = resolveTimeRange(TimeRangePreset.THIS_WEEK, undefined, undefined, 'sunday');
      expect(range.startDate.getUTCDay()).toBe(0); // Sunday
      expect(range.startDate.getUTCHours()).toBe(0);
    });

    it('should resolve THIS_WEEK starting on Saturday UTC when configured', () => {
      const range = resolveTimeRange(TimeRangePreset.THIS_WEEK, undefined, undefined, 'saturday');
      expect(range.startDate.getUTCDay()).toBe(6); // Saturday
      expect(range.startDate.getUTCHours()).toBe(0);
    });

    it('should resolve ALL_TIME from epoch', () => {
      const range = resolveTimeRange(TimeRangePreset.ALL_TIME);
      expect(range.startDate.getTime()).toBe(0);
    });
  });

  describe('getWeekStartDayIndex', () => {
    it('should map day names to correct UTC day indices', () => {
      expect(getWeekStartDayIndex('sunday')).toBe(0);
      expect(getWeekStartDayIndex('monday')).toBe(1);
      expect(getWeekStartDayIndex('tuesday')).toBe(2);
      expect(getWeekStartDayIndex('wednesday')).toBe(3);
      expect(getWeekStartDayIndex('thursday')).toBe(4);
      expect(getWeekStartDayIndex('friday')).toBe(5);
      expect(getWeekStartDayIndex('saturday')).toBe(6);
    });
  });

  describe('renderProgressBar', () => {
    it('should render 0% as empty blocks', () => {
      expect(renderProgressBar(0, 10)).toBe('[░░░░░░░░░░] 0.0%');
    });

    it('should render 50% correctly', () => {
      expect(renderProgressBar(50, 10)).toBe('[█████░░░░░] 50.0%');
    });

    it('should render 80% correctly', () => {
      expect(renderProgressBar(80, 10)).toBe('[████████░░] 80.0%');
    });

    it('should render 100% full', () => {
      expect(renderProgressBar(100, 10)).toBe('[██████████] 100.0%');
    });

    it('should cap display bar at 100% full while showing accurate percentage above 100%', () => {
      expect(renderProgressBar(125.5, 10)).toBe('[██████████] 125.5%');
    });
  });

  describe('parseDurationToMinutes', () => {
    it('should parse plain minute numbers and strings', () => {
      expect(parseDurationToMinutes(25)).toBe(25);
      expect(parseDurationToMinutes('25')).toBe(25);
      expect(parseDurationToMinutes('120')).toBe(120);
      expect(parseDurationToMinutes('90m')).toBe(90);
      expect(parseDurationToMinutes('45 mins')).toBe(45);
    });

    it('should parse hour strings into minutes', () => {
      expect(parseDurationToMinutes('1h')).toBe(60);
      expect(parseDurationToMinutes('2h')).toBe(120);
      expect(parseDurationToMinutes('2.5h')).toBe(150);
      expect(parseDurationToMinutes('3 hours')).toBe(180);
    });

    it('should return default when input is omitted', () => {
      expect(parseDurationToMinutes(undefined, 25)).toBe(25);
      expect(parseDurationToMinutes(null, 25)).toBe(25);
      expect(parseDurationToMinutes('', 25)).toBe(25);
    });

    it('should return null for invalid input', () => {
      expect(parseDurationToMinutes('invalid')).toBeNull();
      expect(parseDurationToMinutes('abc')).toBeNull();
    });
  });

  describe('parseBreakToMinutes', () => {
    it('should parse break minutes and disable keywords', () => {
      expect(parseBreakToMinutes(5)).toBe(5);
      expect(parseBreakToMinutes('5m')).toBe(5);
      expect(parseBreakToMinutes('10')).toBe(10);
      expect(parseBreakToMinutes('0')).toBe(0);
      expect(parseBreakToMinutes('off')).toBe(0);
      expect(parseBreakToMinutes(undefined, 5)).toBe(5);
    });
  });

  describe('formatFocusDuration and formatIntervalLabel', () => {
    it('should format focus durations in clean hours and minutes', () => {
      expect(formatFocusDuration(120)).toBe('2 hours');
      expect(formatFocusDuration(60)).toBe('1 hour');
      expect(formatFocusDuration(90)).toBe('1h 30m');
      expect(formatFocusDuration(25)).toBe('25 minutes');
    });

    it('should format interval labels with suffixes', () => {
      expect(formatIntervalLabel(120, 'work')).toBe('2h work');
      expect(formatIntervalLabel(25, 'work')).toBe('25m work');
      expect(formatIntervalLabel(5, 'break')).toBe('5m break');
      expect(formatIntervalLabel(90, 'work')).toBe('1h 30m work');
    });
  });

  describe("Dynamic Timezone Utilities", () => {
    describe("normalizeTimezone", () => {
      it("should accept valid IANA timezone identifiers", () => {
        expect(normalizeTimezone("Asia/Dhaka")).toBe("Asia/Dhaka");
        expect(normalizeTimezone("America/New_York")).toBe("America/New_York");
        expect(normalizeTimezone("UTC")).toBe("UTC");
        expect(normalizeTimezone("Europe/London")).toBe("Europe/London");
      });

      it("should match city names to canonical IANA timezones", () => {
        expect(normalizeTimezone("dhaka")).toBe("Asia/Dhaka");
        expect(normalizeTimezone("Dhaka")).toBe("Asia/Dhaka");
        expect(normalizeTimezone("london")).toBe("Europe/London");
        expect(normalizeTimezone("tokyo")).toBe("Asia/Tokyo");
      });

      it("should normalize offset strings", () => {
        expect(normalizeTimezone("UTC+6")).toBe("Etc/GMT-6");
        expect(normalizeTimezone("+6")).toBe("Etc/GMT-6");
        expect(normalizeTimezone("GMT-5")).toBe("Etc/GMT+5");
        expect(normalizeTimezone("-4")).toBe("Etc/GMT+4");
        expect(normalizeTimezone("UTC+0")).toBe("UTC");
      });

      it("should return null for invalid inputs", () => {
        expect(normalizeTimezone("invalid/zone")).toBeNull();
        expect(normalizeTimezone("12345")).toBeNull();
        expect(normalizeTimezone("")).toBeNull();
        expect(normalizeTimezone(null)).toBeNull();
        expect(normalizeTimezone(undefined)).toBeNull();
      });
    });

    describe("getTimezoneLabel", () => {
      it("should return dynamic offset label for various zones", () => {
        expect(getTimezoneLabel("Asia/Dhaka")).toBe("UTC+6");
        expect(getTimezoneLabel("UTC")).toBe("UTC");
        expect(getTimezoneLabel("Etc/GMT-6")).toBe("UTC+6");
      });
    });

    describe("formatDateIsoInTz", () => {
      it("should format date into YYYY-MM-DD in target timezone", () => {
        const utcDate = new Date("2026-10-02T19:00:00.000Z");
        // In UTC it is 2026-10-02, in Dhaka (UTC+6) it is 2026-10-03 at 01:00:00
        expect(formatDateIsoInTz(utcDate, "UTC")).toBe("2026-10-02");
        expect(formatDateIsoInTz(utcDate, "Asia/Dhaka")).toBe("2026-10-03");
      });
    });

    describe("searchTimezones", () => {
      it("should return matches when searching by city or offset", () => {
        const dhakaMatches = searchTimezones("dhaka");
        expect(dhakaMatches.some((m) => m.value === "Asia/Dhaka")).toBe(true);

        const offsetMatches = searchTimezones("+6");
        expect(offsetMatches.some((m) => m.name.includes("UTC+6"))).toBe(true);
      });

      it("should prioritize current server timezone when query is empty", () => {
        const results = searchTimezones("", 25, "Asia/Dhaka");
        expect(results[0].value).toBe("Asia/Dhaka");
        expect(results[0].name).toContain("Current Server Timezone");
      });
    });

    describe("resolveTimeRange in custom timezone", () => {
      it("should resolve TODAY according to server timezone", () => {
        const range = resolveTimeRange(TimeRangePreset.TODAY, undefined, undefined, "monday", "Asia/Dhaka");
        // Start date formatted in Dhaka must be midnight
        const formatted = new Intl.DateTimeFormat("en-US", {
          timeZone: "Asia/Dhaka",
          hour: "numeric",
          minute: "numeric",
          second: "numeric",
          hour12: false,
        }).format(range.startDate);
        expect(formatted).toBe("00:00:00");
      });
    });
  });

});
