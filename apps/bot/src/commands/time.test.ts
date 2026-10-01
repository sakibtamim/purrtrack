import { describe, it, expect } from 'vitest';
import { parseDurationToSeconds, parseAdjustmentDate } from './time.js';

describe('parseDurationToSeconds Helper', () => {
  it('parses standard hours and minutes strings', () => {
    expect(parseDurationToSeconds('1h 30m')).toBe(5400);
    expect(parseDurationToSeconds('2h')).toBe(7200);
    expect(parseDurationToSeconds('45m')).toBe(2700);
    expect(parseDurationToSeconds('15min')).toBe(900);
    expect(parseDurationToSeconds('2 hours')).toBe(7200);
  });

  it('parses decimal hours', () => {
    expect(parseDurationToSeconds('1.5h')).toBe(5400);
    expect(parseDurationToSeconds('0.5h')).toBe(1800);
  });

  it('parses seconds and combined expressions', () => {
    expect(parseDurationToSeconds('90s')).toBe(90);
    expect(parseDurationToSeconds('1h 15m 30s')).toBe(3600 + 900 + 30);
  });

  it('handles plain numeric input as minutes', () => {
    expect(parseDurationToSeconds('45')).toBe(2700);
    expect(parseDurationToSeconds('60')).toBe(3600);
  });

  it('returns null for invalid strings', () => {
    expect(parseDurationToSeconds('')).toBeNull();
    expect(parseDurationToSeconds('abc')).toBeNull();
    expect(parseDurationToSeconds('hello world')).toBeNull();
  });
});

describe('parseAdjustmentDate Helper', () => {
  it('defaults to null when empty', () => {
    expect(parseAdjustmentDate('')).toBeNull();
    expect(parseAdjustmentDate(null)).toBeNull();
    expect(parseAdjustmentDate(undefined)).toBeNull();
  });

  it('parses today and yesterday keywords', () => {
    const today = parseAdjustmentDate('today') as Date;
    expect(today).toBeInstanceOf(Date);

    const yesterday = parseAdjustmentDate('yesterday') as Date;
    expect(yesterday).toBeInstanceOf(Date);
    expect(yesterday.getTime()).toBeLessThan(today.getTime());
  });

  it('parses valid ISO YYYY-MM-DD dates', () => {
    const d = parseAdjustmentDate('2026-10-01') as Date;
    expect(d).toBeInstanceOf(Date);
    expect(d.getUTCFullYear()).toBe(2026);
    expect(d.getUTCMonth()).toBe(9); // 0-indexed October
    expect(d.getUTCDate()).toBe(1);
  });

  it('returns INVALID for invalid formats', () => {
    expect(parseAdjustmentDate('not-a-date')).toBe('INVALID');
    expect(parseAdjustmentDate('2026-13-45')).toBe('INVALID');
  });
});
