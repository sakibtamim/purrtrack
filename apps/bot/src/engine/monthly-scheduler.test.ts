import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getConcludedMonthInfo,
  getMsUntilNextMidnight,
  buildMonthlyCoronationEmbed,
  MonthlyCoronationScheduler,
} from './monthly-scheduler.js';

describe('Monthly Coronation & Timezone Rollover', () => {
  describe('getConcludedMonthInfo', () => {
    it('accurately identifies concluded month in UTC', () => {
      const date = new Date('2026-10-01T05:00:00Z');
      const info = getConcludedMonthInfo(date, 'UTC');

      expect(info.currentMonthKey).toBe('2026-10');
      expect(info.prevMonthKey).toBe('2026-09');
      expect(info.monthLabel).toBe('September 2026');
    });

    it('accurately handles January rollover to previous year December', () => {
      const date = new Date('2026-01-01T02:00:00Z');
      const info = getConcludedMonthInfo(date, 'UTC');

      expect(info.currentMonthKey).toBe('2026-01');
      expect(info.prevMonthKey).toBe('2025-12');
      expect(info.monthLabel).toBe('December 2025');
    });

    it('respects timezone differences: Dhaka enters October 6 hours before UTC', () => {
      // 2026-09-30 18:30:00 UTC = 2026-10-01 00:30:00 in Asia/Dhaka (UTC+6)
      const date = new Date('2026-09-30T18:30:00Z');

      const utc = getConcludedMonthInfo(date, 'UTC');
      const dhaka = getConcludedMonthInfo(date, 'Asia/Dhaka');

      // In UTC, it is still September 30, so current month is 2026-09, concluded is 2026-08
      expect(utc.currentMonthKey).toBe('2026-09');
      expect(utc.prevMonthKey).toBe('2026-08');

      // In Dhaka, it is already October 1, so current month is 2026-10, concluded is 2026-09
      expect(dhaka.currentMonthKey).toBe('2026-10');
      expect(dhaka.prevMonthKey).toBe('2026-09');
      expect(dhaka.monthLabel).toBe('September 2026');
    });
  });

  describe('getMsUntilNextMidnight (Precision Midnight Alignment)', () => {
    it('accurately calculates milliseconds until upcoming midnight (00:00:00) in UTC', () => {
      // 23:45:00 UTC
      const date = new Date('2026-10-06T23:45:00Z');
      const { delayMs, nextMidnightUtc } = getMsUntilNextMidnight(date, 'UTC');

      // Exactly 15 minutes = 15 * 60 * 1000 = 900,000 ms
      expect(delayMs).toBe(15 * 60 * 1000);
      expect(nextMidnightUtc.toISOString()).toBe('2026-10-07T00:00:00.000Z');
    });

    it('calculates midnight in custom timezone (Asia/Dhaka UTC+6)', () => {
      // 17:30:00 UTC = 23:30:00 in Dhaka
      const date = new Date('2026-10-06T17:30:00Z');
      const { delayMs, nextMidnightUtc } = getMsUntilNextMidnight(date, 'Asia/Dhaka');

      // Exactly 30 minutes until midnight in Dhaka = 30 * 60 * 1000 = 1,800,000 ms
      expect(delayMs).toBe(30 * 60 * 1000);
      expect(nextMidnightUtc.toISOString()).toBe('2026-10-06T18:00:00.000Z'); // 18:00 UTC is 00:00 Dhaka!
    });
  });

  describe('buildMonthlyCoronationEmbed', () => {
    it('creates rich coronation embed with top 3 podium', () => {
      const embed = buildMonthlyCoronationEmbed({
        guildName: 'Purrfect HQ',
        monthLabel: 'September 2026',
        timezone: 'Asia/Dhaka',
        champions: [
          { userId: 'u-1', username: 'Champion', badgeId: 'monthly_champion_1st', rank: 1, durationSeconds: 36000 },
          { userId: 'u-2', username: 'RunnerUp', badgeId: 'monthly_champion_2nd', rank: 2, durationSeconds: 18000 },
          { userId: 'u-3', username: 'Podium', badgeId: 'monthly_champion_3rd', rank: 3, durationSeconds: 7200 },
        ],
        report: {
          totalDurationSeconds: 72000,
          totalUsers: 15,
          topChannels: [{ channelName: 'Dev Lounge', durationSeconds: 50000 }],
        },
      });

      const data = embed.toJSON();
      expect(data.title).toContain('Monthly Hall of Fame & Champion Coronation • September 2026');
      expect(data.description).toContain('Purrfect HQ');
      expect(data.fields?.length).toBe(4);
      expect(data.fields?.[0].name).toContain('🥇 Monthly Champion');
      expect(data.fields?.[0].value).toContain('<@u-1>');
      expect(data.fields?.[1].name).toContain('🥈 Monthly Runner-Up');
      expect(data.fields?.[2].name).toContain('🥉 Monthly Podium');
      expect(data.fields?.[3].name).toContain('📊 Server Monthly Highlights');
      expect(data.fields?.[3].value).toContain('#Dev Lounge');
      expect(data.footer?.text).toContain('Asia/Dhaka');
    });

    it('creates embed with empty state when no voice activity was recorded', () => {
      const embed = buildMonthlyCoronationEmbed({
        guildName: 'Quiet Guild',
        monthLabel: 'September 2026',
        timezone: 'UTC',
        champions: [],
        report: null,
      });

      const data = embed.toJSON();
      expect(data.fields?.[0].name).toContain('👑 Championship Podium');
      expect(data.fields?.[0].value).toContain('No recorded voice activity');
    });
  });

  describe('MonthlyCoronationScheduler', () => {
    it('executes coronation at midnight and marks month as announced', async () => {
      const mockSettingsRepo = {
        getSettings: vi.fn().mockResolvedValue({
          guildId: 'g-1',
          trackingEnabled: true,
          timezone: 'UTC',
          announceChannelId: 'c-announce',
          lastAnnouncedMonth: '2026-08',
          autoReportConfig: { enabled: false },
        }),
        setLastAnnouncedMonth: vi.fn().mockResolvedValue({}),
        setLastReportedMonth: vi.fn().mockResolvedValue({}),
      };

      const mockSessionRepo = {
        getAggregatedReport: vi.fn().mockResolvedValue({
          totalDurationSeconds: 5000,
          totalUsers: 3,
        }),
      };

      const mockBadgeManager = {
        evaluateMonthlyChampions: vi.fn().mockResolvedValue({
          awarded: [
            { userId: 'u-1', username: 'champ', badgeId: 'monthly_champion_1st', rank: 1, durationSeconds: 5000 },
          ],
          report: { totalDurationSeconds: 5000, totalUsers: 3 },
        }),
      };

      const mockSend = vi.fn().mockResolvedValue({});
      const mockChannel = {
        isTextBased: () => true,
        send: mockSend,
      };

      const mockGuild = {
        id: 'g-1',
        name: 'Test Server',
        channels: {
          cache: new Map([['c-announce', mockChannel]]),
          fetch: vi.fn().mockResolvedValue(mockChannel),
        },
      };

      const mockClient = {
        guilds: {
          cache: new Map([['g-1', mockGuild]]),
        },
      } as any;

      const scheduler = new MonthlyCoronationScheduler(
        mockClient,
        mockSettingsRepo as any,
        mockSessionRepo as any,
        {} as any,
        mockBadgeManager as any
      );

      await scheduler.onMidnight(mockGuild as any, 'UTC');

      expect(mockBadgeManager.evaluateMonthlyChampions).toHaveBeenCalled();
      expect(mockSend).toHaveBeenCalled();
      expect(mockSettingsRepo.setLastAnnouncedMonth).toHaveBeenCalled();
    });

    it('delivers automated monthly report when autoReportConfig is enabled', async () => {
      const mockSettingsRepo = {
        getSettings: vi.fn().mockResolvedValue({
          guildId: 'g-1',
          trackingEnabled: true,
          timezone: 'UTC',
          announceChannelId: 'c-announce',
          lastAnnouncedMonth: '2026-09', // Already announced
          autoReportConfig: {
            enabled: true,
            channelId: 'c-reports',
            format: 'excel',
            includePayroll: true,
          },
          lastReportedMonth: '2026-08', // Needs reporting
        }),
        setLastAnnouncedMonth: vi.fn().mockResolvedValue({}),
        setLastReportedMonth: vi.fn().mockResolvedValue({}),
      };

      const mockSessionRepo = {
        getAggregatedReport: vi.fn().mockResolvedValue({
          guildId: 'g-1',
          guildName: 'Test Server',
          period: {
            startDate: new Date('2026-09-01'),
            endDate: new Date('2026-09-30'),
            preset: 'last_month',
          },
          totalDurationSeconds: 15000,
          totalUsers: 4,
          topUsers: [],
          topChannels: [],
          dailyStats: [],
          sessions: [],
        }),
      };

      const mockSend = vi.fn().mockResolvedValue({});
      const mockReportChannel = {
        isTextBased: () => true,
        send: mockSend,
      };

      const mockGuild = {
        id: 'g-1',
        name: 'Test Server',
        channels: {
          cache: new Map([['c-reports', mockReportChannel]]),
          fetch: vi.fn().mockResolvedValue(mockReportChannel),
        },
      };

      const mockClient = {
        guilds: {
          cache: new Map([['g-1', mockGuild]]),
        },
      } as any;

      const scheduler = new MonthlyCoronationScheduler(
        mockClient,
        mockSettingsRepo as any,
        mockSessionRepo as any,
        {} as any,
        {} as any
      );

      await scheduler.onMidnight(mockGuild as any, 'UTC');

      expect(mockSessionRepo.getAggregatedReport).toHaveBeenCalled();
      expect(mockSend).toHaveBeenCalled();
      expect(mockSettingsRepo.setLastReportedMonth).toHaveBeenCalled();
    });
  });
});


