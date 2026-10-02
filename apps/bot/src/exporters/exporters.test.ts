import { describe, it, expect } from 'vitest';
import { generateCsvReport } from './csv-exporter.js';
import { generateExcelReport } from './excel-exporter.js';
import { generatePdfReport } from './pdf-exporter.js';
import { generateDiscordEmbed } from './embed-exporter.js';
import { AggregatedReportData, TimeRangePreset } from '@purrtrack/shared';

const mockReportData: AggregatedReportData = {
  guildId: '123456789012345678',
  guildName: 'PurrfectSoft Test Guild',
  timezone: 'UTC',
  targetUser: {
    id: '987654321098765432',
    username: 'test_cat',
    displayName: 'Test Cat',
  },
  period: {
    preset: TimeRangePreset.THIS_WEEK,
    startDate: new Date('2026-09-22T00:00:00Z'),
    endDate: new Date('2026-09-29T00:00:00Z'),
  },
  totalDurationSeconds: 7350,
  totalDurationFormatted: '2h 2m 30s',
  totalSessions: 2,
  uniqueActiveUsers: 1,
  topChannels: [
    {
      channelId: '111222333444555666',
      channelName: 'General Voice',
      durationSeconds: 5000,
      durationFormatted: '1h 23m 20s',
      sessionCount: 1,
    },
    {
      channelId: '777888999000111222',
      channelName: 'Gaming',
      durationSeconds: 2350,
      durationFormatted: '39m 10s',
      sessionCount: 1,
    },
  ],
  topUsers: [
    {
      userId: '987654321098765432',
      username: 'test_cat',
      displayName: 'Test Cat',
      durationSeconds: 7350,
      durationFormatted: '2h 2m 30s',
      sessionCount: 2,
    },
  ],
  sessions: [
    {
      id: 'a0000000-0000-0000-0000-000000000001',
      userId: '987654321098765432',
      username: 'test_cat',
      displayName: 'Test Cat',
      channelId: '111222333444555666',
      channelName: 'General Voice',
      startedAt: new Date('2026-09-28T10:00:00Z'),
      endedAt: new Date('2026-09-28T11:23:20Z'),
      durationSeconds: 5000,
      durationFormatted: '1h 23m 20s',
      status: 'COMPLETED',
    },
    {
      id: 'a0000000-0000-0000-0000-000000000002',
      userId: '987654321098765432',
      username: 'test_cat',
      displayName: 'Test Cat',
      channelId: '777888999000111222',
      channelName: 'Gaming',
      startedAt: new Date('2026-09-28T14:00:00Z'),
      endedAt: new Date('2026-09-28T14:39:10Z'),
      durationSeconds: 2350,
      durationFormatted: '39m 10s',
      status: 'COMPLETED',
    },
  ],
};

describe('Multi-Format Exporters', () => {
  it('CSV Exporter generates RFC 4180 output with UTF-8 BOM', async () => {
    const buffer = await generateCsvReport(mockReportData);
    expect(buffer).toBeDefined();
    expect(buffer.length).toBeGreaterThan(100);

    const str = buffer.toString('utf-8');
    // Check for UTF-8 BOM
    expect(str.charCodeAt(0)).toBe(0xfeff);
    expect(str).toContain('PurrTrack Time Tracking Report');
    expect(str).toContain('test_cat');
    expect(str).toContain('General Voice');
    expect(str).toContain('1h 23m 20s');
  });

  it('Excel Exporter generates valid .xlsx binary with ZIP signature', async () => {
    const buffer = await generateExcelReport(mockReportData);
    expect(buffer).toBeDefined();
    expect(buffer.length).toBeGreaterThan(5000);

    // Standard .xlsx file begins with ZIP magic bytes: 'PK'
    expect(buffer[0]).toBe(0x50); // P
    expect(buffer[1]).toBe(0x4b); // K
  });

  it('PDF Exporter generates valid PDF binary with %PDF- header', async () => {
    const buffer = await generatePdfReport(mockReportData);
    expect(buffer).toBeDefined();
    expect(buffer.length).toBeGreaterThan(1000);

    const header = buffer.subarray(0, 5).toString('ascii');
    expect(header).toBe('%PDF-');
  });

  it('Discord Embed Exporter builds rich embed with top channels and metrics', () => {
    const embed = generateDiscordEmbed(mockReportData);
    const json = embed.toJSON();

    expect(json.title).toContain('PurrfectSoft Test Guild');
    expect(json.description).toContain('2h 2m 30s');
    expect(json.fields?.some((f) => f.name.includes('Top Voice Channels'))).toBe(true);
  });

  it('Exporters handle contractor rates and invoice generation with BDT currency', async () => {
    const invoiceReportData: AggregatedReportData = {
      ...mockReportData,
      contractorRate: {
        hourlyRateCents: 50000,
        hourlyRateFormatted: '500.00 BDT / hr',
        currency: 'BDT',
        totalPayableCents: 102083,
        totalPayableFormatted: '1,020.83 BDT',
      },
      manualAdjustments: {
        netSeconds: 1800,
        netFormatted: '+30m',
        count: 1,
      },
    };

    // PDF Invoice
    const pdfBuffer = await generatePdfReport(invoiceReportData);
    expect(pdfBuffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');

    // Excel with line amounts
    const excelBuffer = await generateExcelReport(invoiceReportData);
    expect(excelBuffer[0]).toBe(0x50);
    expect(excelBuffer[1]).toBe(0x4b);

    // Discord Embed
    const embed = generateDiscordEmbed(invoiceReportData);
    const json = embed.toJSON();
    expect(json.fields?.some((f) => f.name.includes('Contractor Compensation'))).toBe(true);
    expect(json.fields?.some((f) => f.name.includes('Manual Adjustments'))).toBe(true);
  });
});

  it('PDF Exporter sanitizes emojis, handles unicode gracefully, and fits short reports in 1 page', async () => {
    const unicodeData: AggregatedReportData = {
      ...mockReportData,
      guildName: '🐾 Purrfect Universe 🚀',
      targetUser: {
        id: '123456789',
        username: 'sakib_zero',
        displayName: '🎧 𝐒𝐚𝐤𝐢𝐛 👑',
      },
      sessions: [
        {
          id: '1',
          userId: '123456789',
          username: 'sakib_zero',
          displayName: '🎧 𝐒𝐚𝐤𝐢𝐛 👑',
          channelId: 'c1',
          channelName: '🌟 GENERAL VOICE',
          startedAt: new Date('2026-10-02T15:40:22Z'),
          endedAt: new Date('2026-10-02T15:46:17Z'),
          durationSeconds: 355,
          durationFormatted: '5m 55s',
          status: 'COMPLETED',
        },
        {
          id: '2',
          userId: '123456789',
          username: 'sakib_zero',
          displayName: '🎧 𝐒𝐚𝐤𝐢𝐛 👑',
          channelId: 'c2',
          channelName: '🎧 MUSIC & RELAX',
          startedAt: new Date('2026-10-02T14:44:54Z'),
          endedAt: new Date('2026-10-02T15:33:37Z'),
          durationSeconds: 2923,
          durationFormatted: '48m 43s',
          status: 'COMPLETED',
        },
      ],
    };

    const pdfBuffer = await generatePdfReport(unicodeData);
    expect(pdfBuffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');

    // Count pages by counting "/Type /Page" occurrences (excluding "/Type /Pages")
    const pdfStr = pdfBuffer.toString('binary');
    const pageMatches = pdfStr.match(/\/Type\s*\/Page[^s]/g);
    expect(pageMatches?.length).toBe(1);
  });
