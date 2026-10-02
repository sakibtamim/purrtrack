import { describe, it, expect } from 'vitest';
import { parseCustomDateRange } from './report.js';

describe('parseCustomDateRange Helper', () => {
  it('returns null when no custom start date is given', () => {
    expect(parseCustomDateRange('', '')).toBeNull();
    expect(parseCustomDateRange(null, null)).toBeNull();
    expect(parseCustomDateRange(undefined, undefined)).toBeNull();
  });

  it('returns INVALID if end date is given without start date', () => {
    expect(parseCustomDateRange('', '2026-10-01')).toBe('INVALID');
  });

  it('parses keyword "today"', () => {
    const res = parseCustomDateRange('today');
    expect(res).not.toBeNull();
    expect(res).not.toBe('INVALID');
    if (res && res !== 'INVALID') {
      expect(res.label).toBe('Today (Custom)');
      expect(res.startDate.getUTCHours()).toBe(0);
    }
  });

  it('parses keyword "yesterday"', () => {
    const res = parseCustomDateRange('yesterday');
    expect(res).not.toBeNull();
    expect(res).not.toBe('INVALID');
    if (res && res !== 'INVALID') {
      expect(res.label).toBe('Yesterday (Custom)');
      expect(res.startDate.getTime()).toBeLessThan(res.endDate.getTime());
    }
  });

  it('parses whole month format YYYY-MM', () => {
    const res = parseCustomDateRange('2026-09');
    expect(res).not.toBeNull();
    expect(res).not.toBe('INVALID');
    if (res && res !== 'INVALID') {
      expect(res.label).toBe('September 2026');
      expect(res.startDate.toISOString()).toContain('2026-09-01T00:00:00.000Z');
      expect(res.endDate.toISOString()).toContain('2026-09-30T23:59:59.999Z');
    }
  });

  it('parses single date format YYYY-MM-DD', () => {
    const res = parseCustomDateRange('2026-10-01');
    expect(res).not.toBeNull();
    expect(res).not.toBe('INVALID');
    if (res && res !== 'INVALID') {
      expect(res.label).toBe('2026-10-01');
      expect(res.startDate.toISOString()).toContain('2026-10-01T00:00:00.000Z');
      expect(res.endDate.toISOString()).toContain('2026-10-01T23:59:59.999Z');
    }
  });

  it('parses date range with both start_date and end_date', () => {
    const res = parseCustomDateRange('2026-09-15', '2026-09-22');
    expect(res).not.toBeNull();
    expect(res).not.toBe('INVALID');
    if (res && res !== 'INVALID') {
      expect(res.label).toBe('2026-09-15 to 2026-09-22');
      expect(res.startDate.toISOString()).toContain('2026-09-15T00:00:00.000Z');
      expect(res.endDate.toISOString()).toContain('2026-09-22T23:59:59.999Z');
    }
  });

  it('returns INVALID if start date is after end date', () => {
    expect(parseCustomDateRange('2026-10-05', '2026-10-01')).toBe('INVALID');
  });

  it('returns INVALID for invalid date formats', () => {
    expect(parseCustomDateRange('invalid-date')).toBe('INVALID');
    expect(parseCustomDateRange('2026-13-01')).toBe('INVALID');
    expect(parseCustomDateRange('2026-02-31')).toBe('INVALID');
  });

  it("parses dates according to the provided timezone", () => {
    const res = parseCustomDateRange("2026-09-15", undefined, "Asia/Dhaka");
    expect(res).not.toBeNull();
    expect(res).not.toBe("INVALID");
    if (res && res !== "INVALID") {
      // 2026-09-15 00:00:00 in Asia/Dhaka (UTC+6) is 2026-09-14 18:00:00 UTC
      expect(res.startDate.toISOString()).toBe("2026-09-14T18:00:00.000Z");
    }
  });

});
