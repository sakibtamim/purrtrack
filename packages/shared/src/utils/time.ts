import { TimeRangePreset, WeekStartDay } from "../enums/index";

/**
 * Format total seconds into a clean human-readable duration string: "2h 15m 30s" or "45m 10s"
 */
export function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return "0s";

  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const parts: string[] = [];
  if (hrs > 0) parts.push(`${hrs}h`);
  if (mins > 0 || hrs > 0) parts.push(`${mins}m`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

  return parts.join(" ");
}

/**
 * Format seconds into standard clock format: "HH:MM:SS" (e.g. 02:15:30)
 */
export function formatDurationClock(seconds: number): string {
  if (!seconds || seconds <= 0) return "00:00:00";

  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
}

export interface DateRange {
  startDate: Date;
  endDate: Date;
}

/**
 * Map WeekStartDay string or enum to JavaScript day number (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
 */
export function getWeekStartDayIndex(day: WeekStartDay | string = "monday"): number {
  switch (day.toLowerCase()) {
    case "sunday":
      return 0;
    case "monday":
      return 1;
    case "tuesday":
      return 2;
    case "wednesday":
      return 3;
    case "thursday":
      return 4;
    case "friday":
      return 5;
    case "saturday":
      return 6;
    default:
      return 1;
  }
}

const SHORT_WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export interface ZonedDateParts {
  year: number;
  month: number; // 0-indexed (0 = Jan, 11 = Dec)
  day: number;
  hour: number;
  minute: number;
  second: number;
  dayOfWeek: number; // 0 = Sun, 1 = Mon, ..., 6 = Sat
}

/**
 * Breaks down a Date into its calendar components in a given timezone
 */
export function getZonedDateParts(date: Date, tz: string = "UTC"): ZonedDateParts {
  const zone = tz || "UTC";
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      weekday: "short",
      hour12: false,
    });
    const parts = Object.fromEntries(formatter.formatToParts(date).map((p) => [p.type, p.value]));
    const weekdayIdx = SHORT_WEEKDAYS.indexOf(parts.weekday);
    return {
      year: parseInt(parts.year, 10),
      month: parseInt(parts.month, 10) - 1,
      day: parseInt(parts.day, 10),
      hour: parseInt(parts.hour === "24" ? "0" : parts.hour, 10),
      minute: parseInt(parts.minute, 10),
      second: parseInt(parts.second, 10),
      dayOfWeek: weekdayIdx >= 0 ? weekdayIdx : 0,
    };
  } catch {
    return {
      year: date.getUTCFullYear(),
      month: date.getUTCMonth(),
      day: date.getUTCDate(),
      hour: date.getUTCHours(),
      minute: date.getUTCMinutes(),
      second: date.getUTCSeconds(),
      dayOfWeek: date.getUTCDay(),
    };
  }
}

/**
 * Converts local calendar components in a specific timezone to a UTC Date object
 */
export function zonedDateToUtc(
  year: number,
  month: number,
  day: number,
  hour: number = 0,
  minute: number = 0,
  second: number = 0,
  ms: number = 0,
  tz: string = "UTC"
): Date {
  const zone = tz || "UTC";
  const approx = new Date(Date.UTC(year, month, day, hour, minute, second, ms));
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      timeZoneName: "longOffset",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      hour12: false,
    }).formatToParts(approx);
    const partMap = Object.fromEntries(parts.map((p) => [p.type, p.value]));
    const tzName = partMap.timeZoneName || "GMT";
    const match = tzName.match(/GMT([+-])(\d{1,2}):?(\d{2})?/);
    let offsetMs = 0;
    if (match) {
      const sign = match[1] === "+" ? 1 : -1;
      const h = parseInt(match[2], 10);
      const m = match[3] ? parseInt(match[3], 10) : 0;
      offsetMs = sign * (h * 60 + m) * 60 * 1000;
    }
    return new Date(Date.UTC(year, month, day, hour, minute, second, ms) - offsetMs);
  } catch {
    return approx;
  }
}

/**
 * Resolve a TimeRangePreset to UTC start and end Dates, dynamically calculated in the specified timezone
 */
export function resolveTimeRange(
  preset: TimeRangePreset,
  customStart?: string | Date,
  customEnd?: string | Date,
  weekStartDay: WeekStartDay | string = "monday",
  timezone: string = "UTC"
): DateRange {
  const now = new Date();
  const tz = timezone || "UTC";
  const parts = getZonedDateParts(now, tz);

  switch (preset) {
    case TimeRangePreset.TODAY: {
      const start = zonedDateToUtc(parts.year, parts.month, parts.day, 0, 0, 0, 0, tz);
      return { startDate: start, endDate: now };
    }

    case TimeRangePreset.YESTERDAY: {
      const start = zonedDateToUtc(parts.year, parts.month, parts.day - 1, 0, 0, 0, 0, tz);
      const end = zonedDateToUtc(parts.year, parts.month, parts.day - 1, 23, 59, 59, 999, tz);
      return { startDate: start, endDate: end };
    }

    case TimeRangePreset.THIS_WEEK: {
      const currentDay = parts.dayOfWeek;
      const startDayIndex = getWeekStartDayIndex(weekStartDay);
      const diff = (currentDay - startDayIndex + 7) % 7;
      const start = zonedDateToUtc(parts.year, parts.month, parts.day - diff, 0, 0, 0, 0, tz);
      return { startDate: start, endDate: now };
    }

    case TimeRangePreset.LAST_WEEK: {
      const currentDay = parts.dayOfWeek;
      const startDayIndex = getWeekStartDayIndex(weekStartDay);
      const diff = (currentDay - startDayIndex + 7) % 7;
      const start = zonedDateToUtc(parts.year, parts.month, parts.day - diff - 7, 0, 0, 0, 0, tz);
      const end = zonedDateToUtc(parts.year, parts.month, parts.day - diff - 1, 23, 59, 59, 999, tz);
      return { startDate: start, endDate: end };
    }

    case TimeRangePreset.THIS_MONTH: {
      const start = zonedDateToUtc(parts.year, parts.month, 1, 0, 0, 0, 0, tz);
      return { startDate: start, endDate: now };
    }

    case TimeRangePreset.LAST_MONTH: {
      const start = zonedDateToUtc(parts.year, parts.month - 1, 1, 0, 0, 0, 0, tz);
      const end = zonedDateToUtc(parts.year, parts.month, 0, 23, 59, 59, 999, tz);
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

  const bar = "█".repeat(filledBlocks) + "░".repeat(emptyBlocks);
  const formattedPercent = clamped.toFixed(1);

  return `[${bar}] ${formattedPercent}%`;
}

/**
 * Parse focus duration input: "25", "25m", "1h", "2h", "1.5h", "90m", "120"
 * Returns duration in minutes, or null if unparseable
 */
export function parseDurationToMinutes(input?: string | number | null, defaultMinutes: number = 25): number | null {
  if (input === undefined || input === null) return defaultMinutes;

  if (typeof input === "number") {
    return Math.max(1, Math.min(720, Math.round(input)));
  }

  const str = input.trim().toLowerCase();
  if (!str) return defaultMinutes;

  // Hours: e.g. "2h", "1.5h", "2hrs", "2 hours"
  const hourMatch = str.match(/^([\d.]+)\s*(h|hr|hrs|hour|hours)$/);
  if (hourMatch) {
    const hours = parseFloat(hourMatch[1]);
    if (!isNaN(hours) && hours > 0) {
      return Math.max(1, Math.min(720, Math.round(hours * 60)));
    }
  }

  // Minutes: e.g. "25m", "90min", "120mins", "25 minutes"
  const minMatch = str.match(/^([\d.]+)\s*(m|min|mins|minute|minutes)$/);
  if (minMatch) {
    const mins = parseFloat(minMatch[1]);
    if (!isNaN(mins) && mins > 0) {
      return Math.max(1, Math.min(720, Math.round(mins)));
    }
  }

  // Plain number: e.g. "120", "25"
  const num = parseFloat(str);
  if (!isNaN(num) && num > 0) {
    return Math.max(1, Math.min(720, Math.round(num)));
  }

  return null;
}

/**
 * Parse break duration input: "5", "5m", "10m", "0", "0m", "off"
 * Returns break in minutes, or null if unparseable
 */
export function parseBreakToMinutes(input?: string | number | null, defaultMinutes: number = 5): number | null {
  if (input === undefined || input === null) return defaultMinutes;

  if (typeof input === "number") {
    return Math.max(0, Math.min(120, Math.round(input)));
  }

  const str = input.trim().toLowerCase();
  if (!str) return defaultMinutes;
  if (str === "0" || str === "0m" || str === "none" || str === "off" || str === "disable") return 0;

  // Minutes or plain number
  const minMatch = str.match(/^([\d.]+)\s*(m|min|mins|minute|minutes)?$/);
  if (minMatch) {
    const mins = parseFloat(minMatch[1]);
    if (!isNaN(mins) && mins >= 0) {
      return Math.max(0, Math.min(120, Math.round(mins)));
    }
  }

  // Hours: e.g. "0.5h"
  const hourMatch = str.match(/^([\d.]+)\s*(h|hr|hrs|hour|hours)$/);
  if (hourMatch) {
    const hours = parseFloat(hourMatch[1]);
    if (!isNaN(hours) && hours >= 0) {
      return Math.max(0, Math.min(120, Math.round(hours * 60)));
    }
  }

  return null;
}

/**
 * Format minutes into clean human-readable focus duration:
 * 120 -> "2 hours"
 * 60 -> "1 hour"
 * 90 -> "1h 30m"
 * 25 -> "25 minutes"
 */
export function formatFocusDuration(minutes: number): string {
  if (minutes <= 0) return "0 minutes";
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;

  if (hrs > 0 && mins > 0) {
    return `${hrs}h ${mins}m`;
  }
  if (hrs > 0) {
    return `${hrs} hour${hrs === 1 ? "" : "s"}`;
  }
  return `${mins} minute${mins === 1 ? "" : "s"}`;
}

/**
 * Format interval label: "2h work", "25m work", "1h 30m work"
 */
export function formatIntervalLabel(minutes: number, suffix: string = ""): string {
  if (minutes <= 0) return `0m${suffix ? ` ${suffix}` : ""}`;
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;

  let timeStr = "";
  if (hrs > 0 && mins > 0) timeStr = `${hrs}h ${mins}m`;
  else if (hrs > 0) timeStr = `${hrs}h`;
  else timeStr = `${mins}m`;

  return suffix ? `${timeStr} ${suffix}` : timeStr;
}

/**
 * Resolves a friendly dynamic timezone label (e.g. "UTC+6", "UTC", "UTC-4")
 */
export function getTimezoneLabel(tz?: string): string {
  const zone = tz || "UTC";
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      timeZoneName: "shortOffset",
    }).formatToParts(new Date());
    const tzPart = parts.find((p) => p.type === "timeZoneName")?.value;
    if (tzPart) {
      const clean = tzPart.replace("GMT", "UTC");
      return clean === "UTC+0" || clean === "UTC-0" ? "UTC" : clean;
    }
  } catch {
    // fallback
  }
  return zone;
}

/**
 * Format a Date object into local 12-hour clock in the specified timezone
 */
export function formatTimeInTz(date: Date, tz: string = "UTC"): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    }).format(date);
  } catch {
    return date.toISOString().substring(11, 19);
  }
}

/**
 * Format a Date object into local date in the specified timezone
 */
export function formatDateInTz(date: Date, tz: string = "UTC"): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric",
      month: "numeric",
      day: "numeric",
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

/**
 * Format a Date object into ISO calendar date string in the specified timezone: "2026-10-03"
 */
export function formatDateIsoInTz(date: Date, tz: string = "UTC"): string {
  const parts = getZonedDateParts(date, tz);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${parts.year}-${pad(parts.month + 1)}-${pad(parts.day)}`;
}

/**
 * Dynamically validates and normalizes an input string to a valid canonical IANA timezone
 * Accepts:
 * - Direct IANA names: "Asia/Dhaka", "America/New_York", "UTC"
 * - City names: "Dhaka", "London", "Tokyo", "Berlin"
 * - Offsets: "UTC+6", "GMT-5", "+6", "+06:00", "-4"
 */
export function normalizeTimezone(input?: string | null): string | null {
  if (!input || typeof input !== "string") return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  // 1. Direct IANA timeZone validation
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: trimmed });
    return trimmed;
  } catch {}

  // 2. City name search in supported timezones
  const cleanCity = trimmed.replace(/\s+/g, "_").toLowerCase();
  try {
    const supported = Intl.supportedValuesOf("timeZone");
    const matched = supported.find((z) => {
      const cityPart = z.split("/").pop()?.toLowerCase();
      return cityPart === cleanCity;
    });
    if (matched) return matched;
  } catch {}

  // 3. Offset format: UTC+6, GMT-5, +6, +06:00, etc.
  const offsetMatch = trimmed.match(/^(?:UTC|GMT)?\s*([+-])\s*(\d{1,2})(?::?(\d{2}))?$/i);
  if (offsetMatch) {
    const sign = offsetMatch[1];
    const hours = parseInt(offsetMatch[2], 10);
    const minutes = offsetMatch[3] ? parseInt(offsetMatch[3], 10) : 0;
    if (minutes === 0 && hours >= 0 && hours <= 14) {
      if (hours === 0) return "UTC";
      const etcSign = sign === "+" ? "-" : "+";
      const etcTz = `Etc/GMT${etcSign}${hours}`;
      try {
        new Intl.DateTimeFormat(undefined, { timeZone: etcTz });
        return etcTz;
      } catch {}
    }
  }

  return null;
}

/**
 * Dynamically searches and filters timezones for Discord slash command autocomplete
 */
export function searchTimezones(
  query: string = "",
  limit: number = 25,
  currentZone?: string
): { name: string; value: string }[] {
  const supported = ["UTC", ...Intl.supportedValuesOf("timeZone")];
  const q = query.trim().toLowerCase();
  const results: { name: string; value: string }[] = [];
  const seen = new Set<string>();

  // If a current guild zone exists and query is empty, highlight it first
  if (currentZone && !q) {
    const label = getTimezoneLabel(currentZone);
    results.push({
      name: `⭐ Current Server Timezone: ${currentZone} (${label})`.slice(0, 100),
      value: currentZone,
    });
    seen.add(currentZone);
  }

  // If user typed a direct match or offset
  if (q) {
    const normalizedDirect = normalizeTimezone(query);
    if (normalizedDirect && !seen.has(normalizedDirect)) {
      const label = getTimezoneLabel(normalizedDirect);
      const displayName = normalizedDirect === "UTC" ? "UTC (UTC)" : `${normalizedDirect} (${label})`;
      results.push({ name: displayName.slice(0, 100), value: normalizedDirect });
      seen.add(normalizedDirect);
    }
  }

  for (const zone of supported) {
    if (seen.has(zone)) continue;

    const lowerZone = zone.toLowerCase();
    const cityPart = lowerZone.split("/").pop() || lowerZone;
    const label = getTimezoneLabel(zone);
    const lowerLabel = label.toLowerCase();

    if (!q || lowerZone.includes(q) || cityPart.includes(q) || lowerLabel.includes(q)) {
      const displayName = zone === "UTC" ? "UTC (UTC)" : `${zone} (${label})`;
      results.push({ name: displayName.slice(0, 100), value: zone });
      seen.add(zone);
      if (results.length >= limit) break;
    }
  }

  return results.slice(0, limit);
}
