import { TimeRangePreset, WeekStartDay } from '../enums/index';

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
 * Map WeekStartDay string or enum to JavaScript getUTCDay number (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
 */
export function getWeekStartDayIndex(day: WeekStartDay | string = 'monday'): number {
  switch (day.toLowerCase()) {
    case 'sunday':
      return 0;
    case 'monday':
      return 1;
    case 'tuesday':
      return 2;
    case 'wednesday':
      return 3;
    case 'thursday':
      return 4;
    case 'friday':
      return 5;
    case 'saturday':
      return 6;
    default:
      return 1;
  }
}

/**
 * Resolve a TimeRangePreset to UTC start and end Dates with customizable week start day
 */
export function resolveTimeRange(
  preset: TimeRangePreset,
  customStart?: string | Date,
  customEnd?: string | Date,
  weekStartDay: WeekStartDay | string = 'monday'
): DateRange {
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
      const currentDay = now.getUTCDay();
      const startDayIndex = getWeekStartDayIndex(weekStartDay);
      const diff = (currentDay - startDayIndex + 7) % 7;
      const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - diff, 0, 0, 0, 0));
      return { startDate: start, endDate: now };
    }

    case TimeRangePreset.LAST_WEEK: {
      const currentDay = now.getUTCDay();
      const startDayIndex = getWeekStartDayIndex(weekStartDay);
      const diff = (currentDay - startDayIndex + 7) % 7;
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

/**
 * Render a visual ASCII progress bar: [████████░░] 80.0%
 */
export function renderProgressBar(percentage: number, length: number = 10): string {
  const clamped = Math.max(0, percentage);
  const fillRatio = Math.min(1, clamped / 100);
  const filledBlocks = Math.round(fillRatio * length);
  const emptyBlocks = Math.max(0, length - filledBlocks);

  const bar = '█'.repeat(filledBlocks) + '░'.repeat(emptyBlocks);
  const formattedPercent = clamped.toFixed(1);

  return `[${bar}] ${formattedPercent}%`;
}
