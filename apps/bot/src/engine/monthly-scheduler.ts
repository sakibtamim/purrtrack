import { Client, Guild, EmbedBuilder, AttachmentBuilder, ChannelType } from 'discord.js';
import {
  GuildSettingsRepository,
  VoiceSessionRepository,
  UserBadgesRepository,
  ContractorRatesRepository,
  TimeAdjustmentsRepository,
} from '@purrtrack/db';
import {
  TimeRangePreset,
  resolveTimeRange,
  getZonedDateParts,
  zonedDateToUtc,
  formatDuration,
  renderBadgePill,
  ExportFormat,
  AggregatedReportData,
} from '@purrtrack/shared';
import { BadgeManager } from './badge-manager.js';
import { exportReport } from '../exporters/index.js';
import { logger } from '../core/logger.js';

export interface ConcludedMonthInfo {
  prevMonthKey: string; // e.g. "2026-09"
  prevYear: number;
  prevMonth: number;
  currentMonthKey: string; // e.g. "2026-10"
  monthLabel: string; // e.g. "September 2026"
}

/**
 * Calculates current and concluded calendar months according to the guild's timezone.
 */
export function getConcludedMonthInfo(now: Date, timeZone: string = 'UTC'): ConcludedMonthInfo {
  const parts = getZonedDateParts(now, timeZone);
  const currentMonthNum = parts.month + 1; // 1 to 12
  const currentMonthKey = `${parts.year}-${String(currentMonthNum).padStart(2, '0')}`;

  const prevYear = currentMonthNum === 1 ? parts.year - 1 : parts.year;
  const prevMonth = currentMonthNum === 1 ? 12 : currentMonthNum - 1;
  const prevMonthKey = `${prevYear}-${String(prevMonth).padStart(2, '0')}`;

  const dateObj = new Date(Date.UTC(prevYear, prevMonth - 1, 1));
  const monthName = dateObj.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' });
  const monthLabel = `${monthName} ${prevYear}`;

  return { prevMonthKey, prevYear, prevMonth, currentMonthKey, monthLabel };
}

/**
 * Calculates milliseconds remaining until the exact upcoming midnight (00:00:00) in the specified timezone.
 */
export function getMsUntilNextMidnight(
  now: Date,
  timeZone: string = 'UTC'
): { delayMs: number; nextMidnightUtc: Date } {
  const parts = getZonedDateParts(now, timeZone);
  const nextMidnightUtc = zonedDateToUtc(
    parts.year,
    parts.month,
    parts.day + 1,
    0,
    0,
    0,
    0,
    timeZone
  );

  let delayMs = nextMidnightUtc.getTime() - now.getTime();
  if (delayMs <= 0) {
    delayMs = 1000;
  }

  return { delayMs, nextMidnightUtc };
}

/**
 * Builds the rich celebratory embed for the Monthly Champions Coronation.
 */
export function buildMonthlyCoronationEmbed(params: {
  guildName: string;
  monthLabel: string;
  timezone: string;
  champions: { userId: string; username?: string; badgeId: string; rank: number; durationSeconds: number }[];
  report: { totalDurationSeconds: number; totalUsers: number; topChannels?: { channelName: string; durationSeconds: number }[] } | null;
}): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(0xf1c40f) // Trophy Gold
    .setTitle(`🏆 Monthly Hall of Fame & Champion Coronation • ${params.monthLabel}`)
    .setDescription(
      `A round of applause for our top voice participants in **${params.guildName}** during **${params.monthLabel}**! The official championship podium has been decided:\n`
    )
    .setTimestamp();

  if (params.champions.length === 0) {
    embed.addFields({
      name: '👑 Championship Podium',
      value: '*No recorded voice activity for this month.*',
    });
  } else {
    const medals = ['🥇', '🥈', '🥉'];
    const titles = ['Monthly Champion', 'Monthly Runner-Up', 'Monthly Podium'];

    for (let i = 0; i < params.champions.length; i++) {
      const c = params.champions[i];
      const medal = medals[i] || '🎖️';
      const title = titles[i] || `Rank #${c.rank}`;
      const badgePill = renderBadgePill(c.badgeId);

      embed.addFields({
        name: `${medal} ${title}`,
        value: `**<@${c.userId}>** • **${formatDuration(c.durationSeconds)}**\nEarned exclusive badge: ${badgePill}`,
        inline: false,
      });
    }
  }

  if (params.report && params.report.totalDurationSeconds > 0) {
    const topChannel =
      params.report.topChannels && params.report.topChannels.length > 0
        ? params.report.topChannels[0].channelName
        : null;

    let summaryText = `• Total Server Voice Time: **${formatDuration(params.report.totalDurationSeconds)}**\n• Active Members: **${params.report.totalUsers}**`;
    if (topChannel) {
      summaryText += `\n• Most Active Channel: **#${topChannel}**`;
    }

    embed.addFields({
      name: '📊 Server Monthly Highlights',
      value: summaryText,
      inline: false,
    });
  }

  embed.setFooter({
    text: `PurrTrack • Monthly Championship • Timezone: ${params.timezone}`,
  });

  return embed;
}

export class MonthlyCoronationScheduler {
  private guildTimers = new Map<string, NodeJS.Timeout>();
  private isRunning = false;

  constructor(
    private readonly client: Client,
    private readonly settingsRepo: GuildSettingsRepository,
    private readonly sessionRepo: VoiceSessionRepository,
    private readonly badgesRepo: UserBadgesRepository,
    private readonly badgeManager: BadgeManager
  ) {}

  /**
   * Start the precision midnight scheduler.
   */
  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    logger.info('🏆 [scheduler] Precision Midnight (00:00) Coronation Watchdog started.');

    // Initial check and alignment on boot (catch-up if bot was offline during midnight)
    setTimeout(() => {
      this.initAllGuilds().catch((err) =>
        logger.error(`[scheduler] Boot initialization error: ${String(err)}`)
      );
    }, 5_000);
  }

  /**
   * Graceful stop: cancels all pending timers.
   */
  stop(): void {
    this.isRunning = false;
    for (const [, timer] of this.guildTimers.entries()) {
      clearTimeout(timer);
    }
    this.guildTimers.clear();
    logger.info('⏹️ [scheduler] Precision Midnight Watchdog stopped.');
  }

  /**
   * Initializes all cached guilds and schedules their exact midnight (00:00) triggers.
   */
  async initAllGuilds(): Promise<void> {
    const guilds = Array.from(this.client.guilds.cache.values());
    for (const guild of guilds) {
      await this.initGuild(guild);
    }
  }

  /**
   * Initializes a single guild: runs catch-up if needed, and schedules exact midnight timer.
   */
  async initGuild(guild: Guild): Promise<void> {
    try {
      const settings = await this.settingsRepo.getSettings(guild.id);
      if (!settings || !settings.trackingEnabled) return;

      const tz = settings.timezone || 'UTC';
      const now = new Date();

      // Catch-up check on boot (in case bot was offline when midnight arrived)
      const monthInfo = getConcludedMonthInfo(now, tz);
      if (settings.lastAnnouncedMonth !== monthInfo.prevMonthKey) {
        await this.runCoronation(guild, settings, tz, monthInfo.prevMonthKey, monthInfo.monthLabel);
      }
      if (
        settings.autoReportConfig?.enabled &&
        settings.lastReportedMonth !== monthInfo.prevMonthKey
      ) {
        await this.runAutoReportDelivery(guild, settings, tz, monthInfo.prevMonthKey, monthInfo.monthLabel);
      }

      // Schedule exact midnight timer
      this.scheduleNextMidnight(guild, tz);
    } catch (err) {
      logger.error(`[scheduler] Error initializing guild ${guild.name} (${guild.id}): ${String(err)}`);
    }
  }

  /**
   * Schedules a timer to fire at EXACTLY midnight (00:00:00) in the guild's timezone.
   */
  scheduleNextMidnight(guild: Guild, timeZone: string): void {
    const existing = this.guildTimers.get(guild.id);
    if (existing) {
      clearTimeout(existing);
      this.guildTimers.delete(guild.id);
    }

    if (!this.isRunning) return;

    const { delayMs, nextMidnightUtc } = getMsUntilNextMidnight(new Date(), timeZone);

    logger.info(
      `⏳ [scheduler] Scheduled midnight (00:00) trigger for ${guild.name} in ${(delayMs / 3600000).toFixed(2)}h (${nextMidnightUtc.toISOString()} UTC / 00:00 ${timeZone}).`
    );

    const timer = setTimeout(async () => {
      this.guildTimers.delete(guild.id);
      try {
        await this.onMidnight(guild, timeZone);
      } catch (err) {
        logger.error(`[scheduler] Error during midnight execution for ${guild.name}: ${String(err)}`);
      } finally {
        // Reschedule for subsequent midnight
        this.scheduleNextMidnight(guild, timeZone);
      }
    }, delayMs);

    this.guildTimers.set(guild.id, timer);
  }

  /**
   * Fires at EXACTLY midnight (00:00:00) in the guild's timezone.
   */
  async onMidnight(guild: Guild, timeZone: string): Promise<void> {
    const settings = await this.settingsRepo.getSettings(guild.id);
    if (!settings || !settings.trackingEnabled) return;

    const tz = settings.timezone || timeZone;
    const now = new Date();
    const monthInfo = getConcludedMonthInfo(now, tz);
    const { prevMonthKey, monthLabel } = monthInfo;

    logger.info(`🕛 [scheduler] EXACT MIDNIGHT (00:00) reached for ${guild.name} (${tz}). Processing monthly rollover...`);

    // 1. Monthly Champions Coronation
    if (settings.lastAnnouncedMonth !== prevMonthKey) {
      await this.runCoronation(guild, settings, tz, prevMonthKey, monthLabel);
    }

    // 2. Optional Automated Monthly Report
    if (
      settings.autoReportConfig?.enabled &&
      settings.lastReportedMonth !== prevMonthKey
    ) {
      await this.runAutoReportDelivery(guild, settings, tz, prevMonthKey, monthLabel);
    }
  }

  /**
   * Executes the monthly coronation ceremony for a concluded month.
   */
  async runCoronation(
    guild: Guild,
    settings: any,
    timezone: string,
    prevMonthKey: string,
    monthLabel: string
  ): Promise<void> {
    const { startDate, endDate } = resolveTimeRange(
      TimeRangePreset.LAST_MONTH,
      undefined,
      undefined,
      'monday',
      timezone
    );

    const { awarded, report } = await this.badgeManager.evaluateMonthlyChampions(
      guild.id,
      guild.name,
      timezone,
      { startDate, endDate }
    );

    // If server had active sessions, broadcast to announcement channel
    if (settings.announceChannelId && (awarded.length > 0 || (report && report.totalDurationSeconds > 0))) {
      const channel =
        guild.channels.cache.get(settings.announceChannelId) ||
        (await guild.channels.fetch(settings.announceChannelId).catch(() => null));

      if (channel && channel.isTextBased()) {
        const embed = buildMonthlyCoronationEmbed({
          guildName: guild.name,
          monthLabel,
          timezone,
          champions: awarded,
          report,
        });

        await channel.send({ embeds: [embed] }).catch((err) => {
          logger.error(
            `[scheduler] Failed to send coronation embed to channel #${settings.announceChannelId} in ${guild.name}: ${String(err)}`
          );
        });

        logger.info(
          `🏆 [scheduler] Broadcasted ${monthLabel} coronation to #${settings.announceChannelId} in ${guild.name} at 00:00.`
        );
      }
    }

    // Mark as announced to prevent duplicate broadcasts
    await this.settingsRepo.setLastAnnouncedMonth(guild.id, prevMonthKey);
  }

  /**
   * Delivers the automated monthly report if enabled.
   */
  async runAutoReportDelivery(
    guild: Guild,
    settings: any,
    timezone: string,
    prevMonthKey: string,
    monthLabel: string
  ): Promise<void> {
    const channelId = settings.autoReportConfig.channelId || settings.announceChannelId;
    if (!channelId) {
      await this.settingsRepo.setLastReportedMonth(guild.id, prevMonthKey);
      return;
    }

    const channel =
      guild.channels.cache.get(channelId) ||
      (await guild.channels.fetch(channelId).catch(() => null));

    if (!channel || !channel.isTextBased()) {
      await this.settingsRepo.setLastReportedMonth(guild.id, prevMonthKey);
      return;
    }

    const { startDate, endDate } = resolveTimeRange(
      TimeRangePreset.LAST_MONTH,
      undefined,
      undefined,
      'monday',
      timezone
    );

    const reportData = await this.sessionRepo.getAggregatedReport({
      guildId: guild.id,
      guildName: guild.name,
      startDate,
      endDate,
      preset: TimeRangePreset.LAST_MONTH,
    });

    if (reportData.totalDurationSeconds > 0) {
      reportData.timezone = timezone;
      if (!reportData.period) {
        reportData.period = { startDate, endDate, preset: TimeRangePreset.LAST_MONTH };
      }
      if (!reportData.sessions) {
        reportData.sessions = [];
      }
      const formatStr = (settings.autoReportConfig.format || 'excel').toLowerCase();
      const exportFormat =
        formatStr === 'pdf'
          ? ExportFormat.PDF
          : formatStr === 'csv'
          ? ExportFormat.CSV
          : formatStr === 'embed'
          ? ExportFormat.EMBED
          : ExportFormat.EXCEL;

      const exportRes = await exportReport(reportData, exportFormat);
      const files = exportRes.attachment ? [exportRes.attachment] : [];
      const embeds = exportRes.embed ? [exportRes.embed] : [];

      await channel.send({
        content: `📬 **Automated Monthly Voice Report • ${monthLabel}**\nHere is the server activity timesheet for the concluded month:`,
        embeds,
        files,
      }).catch((err) => {
        logger.error(`[scheduler] Failed to deliver monthly report to #${channelId}: ${String(err)}`);
      });

      logger.info(
        `📬 [scheduler] Delivered automated monthly report (${exportFormat}) to #${channelId} in ${guild.name} at 00:00.`
      );
    }

    await this.settingsRepo.setLastReportedMonth(guild.id, prevMonthKey);
  }
}
