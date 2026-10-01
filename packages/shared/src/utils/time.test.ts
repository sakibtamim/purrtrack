import { describe, it, expect } from 'vitest';
import { formatDuration, formatDurationClock, resolveTimeRange, renderProgressBar, getWeekStartDayIndex } from './time';
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
});

