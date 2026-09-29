import { TimeRangePreset } from '../enums/index';

/**
 * Format total seconds into a clean human-readable duration string: "2h 15m 30s" or "45m 10s"
 */
export function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return '0s';

  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const parts: string[] = [];
  if (hrs > 0) parts.push(`${hrs}h`);
  if (mins > 0 || hrs > 0) parts.push(`${mins}m`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

  return parts.join(' ');
}

/**
 * Format seconds into standard clock format: "HH:MM:SS" (e.g. 02:15:30)
 */
export function formatDurationClock(seconds: number): string {
  if (!seconds || seconds <= 0) return '00:00:00';

  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
}

export interface DateRange {
  startDate: Date;
  endDate: Date;
}

/**
 * Resolve a TimeRangePreset to UTC start and end Dates
 */
export function resolveTimeRange(preset: TimeRangePreset, customStart?: string | Date, customEnd?: string | Date): DateRange {
  const now = new Date();

  switch (preset) {
    case TimeRangePreset.TODAY: {
      const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
      return { startDate: start, endDate: now };
    }

    case TimeRangePreset.YESTERDAY: {
      const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1, 0, 0, 0, 0));
      const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1, 23, 59, 59, 999));
      return { startDate: start, endDate: end };
    }

    case TimeRangePreset.THIS_WEEK: {
      const day = now.getUTCDay(); // 0 is Sunday
      const diff = day === 0 ? 6 : day - 1; // Monday start
      const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - diff, 0, 0, 0, 0));
      return { startDate: start, endDate: now };
    }

    case TimeRangePreset.LAST_WEEK: {
      const day = now.getUTCDay();
      const diff = day === 0 ? 6 : day - 1;
      const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - diff - 7, 0, 0, 0, 0));
      const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - diff - 1, 23, 59, 59, 999));
      return { startDate: start, endDate: end };
    }

    case TimeRangePreset.THIS_MONTH: {
      const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
      return { startDate: start, endDate: now };
    }

    case TimeRangePreset.LAST_MONTH: {
      const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1, 0, 0, 0, 0));
      const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0, 23, 59, 59, 999));
      return { startDate: start, endDate: end };
    }

    case TimeRangePreset.ALL_TIME: {
      return { startDate: new Date(0), endDate: now };
    }

    case TimeRangePreset.CUSTOM: {
      const start = customStart ? new Date(customStart) : new Date(0);
      const end = customEnd ? new Date(customEnd) : now;
      return { startDate: start, endDate: end };
    }

    default:
      return { startDate: new Date(0), endDate: now };
  }
}
