import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ButtonInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} from 'discord.js';
import {
  VoiceSessionRepository,
  UserGoalsRepository,
  GuildSettingsRepository,
} from '@purrtrack/db';
import {
  TimeRangePreset,
  resolveTimeRange,
  getZonedDateParts,
  zonedDateToUtc,
  formatDuration,
  renderBadgePill,
} from '@purrtrack/shared';

const currentMonthName = new Date().toLocaleString('en-US', { month: 'long', timeZone: 'UTC' });

export const leaderboardCommand = new SlashCommandBuilder()
  .setName('leaderboard')
  .setDescription('🏆 Server voice leaderboards with podium highlights & streak rankings')
  .addStringOption((opt) =>
    opt
      .setName('period')
      .setDescription('Timeframe for the leaderboard (default: This Month)')
      .setRequired(false)
      .addChoices(
        { name: '🗓️ This Month (Championship)', value: 'this_month' },
        { name: '📅 This Week', value: 'this_week' },
        { name: '👑 All Time', value: 'all_time' }
      )
  )
  .addStringOption((opt) =>
    opt
      .setName('metric')
      .setDescription('Leaderboard metric (Voice Hours or Daily Streaks)')
      .setRequired(false)
      .addChoices(
        { name: '🎙️ Voice Hours', value: 'voice' },
        { name: '🔥 Daily Streaks', value: 'streak' }
      )
  )
  .addIntegerOption((opt) =>
    opt
      .setName('page')
      .setDescription('Page number (default: 1)')
      .setMinValue(1)
      .setRequired(false)
  );

export async function buildLeaderboardEmbed(params: {
  guildId: string;
  guildName: string;
  period: 'this_week' | 'this_month' | 'all_time';
  metric: 'voice' | 'streak';
  page: number;
  sessionRepo: VoiceSessionRepository;
  goalsRepo: UserGoalsRepository;
  callerUserId: string;
  timezone?: string;
}): Promise<{ embed: EmbedBuilder; row: ActionRowBuilder<ButtonBuilder>; totalPages: number }> {
  const { guildId, guildName, period, metric, page, sessionRepo, goalsRepo, callerUserId, timezone } = params;
  const tz = timezone || 'UTC';

  const now = new Date();
  const parts = getZonedDateParts(now, tz);
  const currentMonthName = now.toLocaleString('en-US', { month: 'long', timeZone: tz });
  const currentYear = parts.year;

  let rankedItems: { userId: string; username: string; displayName?: string; value: number; valueStr: string }[] = [];
  let periodTitle = 'This Week';

  if (metric === 'streak') {
    periodTitle = 'Active Streaks';
    // Query streak rankings from userGoals
    const goals = await goalsRepo.getOrCreateGoal(guildId, callerUserId);
    // For general streak ranking, query user_goals table
    const topGoals = await goalsRepo.getTopStreaks(guildId, 100);
    rankedItems = topGoals.map((g) => ({
      userId: g.userId,
      username: `User (${g.userId})`,
      value: g.currentStreakDays,
      valueStr: `${g.currentStreakDays} days`,
    }));
  } else {
    // Voice Hours
    let preset = TimeRangePreset.THIS_WEEK;
    if (period === 'this_month') {
      preset = TimeRangePreset.THIS_MONTH;
      periodTitle = `${currentMonthName} ${currentYear}`;
    } else if (period === 'all_time') {
      preset = TimeRangePreset.ALL_TIME;
      periodTitle = 'All Time';
    }

    const { startDate, endDate } = resolveTimeRange(preset, undefined, undefined, 'monday', tz);
    const report = await sessionRepo.getAggregatedReport({
      guildId,
      guildName,
      startDate,
      endDate,
      preset,
      timezone: tz,
    });

    rankedItems = (report.topUsers ?? []).map((u) => ({
      userId: u.userId,
      username: u.username,
      displayName: u.displayName,
      value: u.durationSeconds,
      valueStr: formatDuration(u.durationSeconds),
    }));
  }

  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(rankedItems.length / pageSize));
  const currentPage = Math.max(1, Math.min(totalPages, page));

  const startIndex = (currentPage - 1) * pageSize;
  const pageItems = rankedItems.slice(startIndex, startIndex + pageSize);

  // Find caller's rank
  const callerRankIndex = rankedItems.findIndex((i) => i.userId === callerUserId);
  const callerRankStr =
    callerRankIndex >= 0 ? `#${callerRankIndex + 1} of ${rankedItems.length}` : 'Unranked';

  const endOfMonth = zonedDateToUtc(parts.year, parts.month + 1, 0, 23, 59, 59, 999, tz);
  const daysRemaining = Math.max(1, Math.ceil((endOfMonth.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));

  let raceNotice = '';
  if (period === 'this_month' && metric === 'voice') {
    raceNotice = `👑 **${currentMonthName} Champion Race**: Top 3 at the end of ${currentMonthName} earn exclusive **🥇 Monthly Champion**, **🥈 Runner-Up**, & **🥉 Podium** badges! Leaderboard resets in **${daysRemaining} day(s)**.\n\n`;
  }

  const titlePeriod = period === 'this_month' ? `${currentMonthName} Leaderboard` : 'Voice Leaderboard';
  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle(`🏆 ${guildName} • ${titlePeriod}`)
    .setDescription(
      `${raceNotice}` +
      `**Metric**: ${metric === 'streak' ? '🔥 Daily Streaks' : '🎙️ Voice Hours'} • **Period**: \`${periodTitle}\`\n` +
      `Your Position: **${callerRankStr}**\n\n`
    );

  if (pageItems.length === 0) {
    embed.setDescription(
      `${raceNotice}` +
      `*No recorded activity yet for ${periodTitle}. Join a voice channel to get on the board!*`
    );
  } else {
    // Podiums for Page 1
    if (currentPage === 1 && pageItems.length >= 3) {
      const p1 = pageItems[0];
      const p2 = pageItems[1];
      const p3 = pageItems[2];

      const goal1 = await goalsRepo.getOrCreateGoal(guildId, p1.userId);
      const title1 = goal1.equippedBadgeIds?.[0] ? renderBadgePill(goal1.equippedBadgeIds[0]) : '';

      const goal2 = await goalsRepo.getOrCreateGoal(guildId, p2.userId);
      const title2 = goal2.equippedBadgeIds?.[0] ? renderBadgePill(goal2.equippedBadgeIds[0]) : '';

      const goal3 = await goalsRepo.getOrCreateGoal(guildId, p3.userId);
      const title3 = goal3.equippedBadgeIds?.[0] ? renderBadgePill(goal3.equippedBadgeIds[0]) : '';

      const podiumHeader = period === 'this_month' ? `👑 ${currentMonthName} Podium Champions` : '👑 Podium Champions';
      embed.addFields({
        name: podiumHeader,
        value:
          `🥇 **1st**: <@${p1.userId}> ${title1 ? `\`${title1}\`` : ''} — **${p1.valueStr}**\n` +
          `🥈 **2nd**: <@${p2.userId}> ${title2 ? `\`${title2}\`` : ''} — **${p2.valueStr}**\n` +
          `🥉 **3rd**: <@${p3.userId}> ${title3 ? `\`${title3}\`` : ''} — **${p3.valueStr}**`,
        inline: false,
      });

      // Remaining 4-10
      const remaining = pageItems.slice(3);
      if (remaining.length > 0) {
        const lines: string[] = [];
        for (let i = 0; i < remaining.length; i++) {
          const item = remaining[i];
          const rank = 4 + i;
          const userGoal = await goalsRepo.getOrCreateGoal(guildId, item.userId);
          const badgePill = userGoal.equippedBadgeIds?.[0] ? renderBadgePill(userGoal.equippedBadgeIds[0]) : '';
          lines.push(`\`#${rank}\` <@${item.userId}> ${badgePill ? `\`${badgePill}\`` : ''} — \`${item.valueStr}\``);
        }
        embed.addFields({ name: '📊 Rankings', value: lines.join('\n'), inline: false });
      }
    } else {
      // Standard page listing
      const lines: string[] = [];
      for (let i = 0; i < pageItems.length; i++) {
        const item = pageItems[i];
        const rank = startIndex + i + 1;
        const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `\`#${rank}\``;
        const userGoal = await goalsRepo.getOrCreateGoal(guildId, item.userId);
        const badgePill = userGoal.equippedBadgeIds?.[0] ? renderBadgePill(userGoal.equippedBadgeIds[0]) : '';
        lines.push(`${medal} <@${item.userId}> ${badgePill ? `\`${badgePill}\`` : ''} — \`${item.valueStr}\``);
      }
      embed.addFields({ name: '📊 Rankings', value: lines.join('\n'), inline: false });
    }
  }

  embed.setFooter({ text: `Page ${currentPage} of ${totalPages} • PurrTrack Community` });
  embed.setTimestamp();

  // Navigation Buttons
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`lb_prev:${period}:${metric}:${currentPage}`)
      .setLabel('◀️ Previous')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(currentPage <= 1),
    new ButtonBuilder()
      .setCustomId(`lb_next:${period}:${metric}:${currentPage}`)
      .setLabel('Next ▶️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(currentPage >= totalPages),
    new ButtonBuilder()
      .setCustomId(`lb_myrank:${period}:${metric}:${currentPage}`)
      .setLabel('🎯 My Rank')
      .setStyle(ButtonStyle.Primary)
  );

  return { embed, row, totalPages };
}

export async function handleLeaderboardCommand(
  interaction: ChatInputCommandInteraction,
  sessionRepo: VoiceSessionRepository,
  goalsRepo: UserGoalsRepository,
  badgeManager?: any,
  settingsRepo?: GuildSettingsRepository
): Promise<void> {
  const { guildId, guild, user } = interaction;
  if (!guildId || !guild) {
    await interaction.reply({ content: '❌ This command can only be used within a server.', flags: MessageFlags.Ephemeral });
    return;
  }

  // Check and award Monthly Champions for completed month
  if (badgeManager) {
    await badgeManager.evaluateMonthlyChampions(guildId, guild.name).catch(() => {});
  }

  const period = (interaction.options.getString('period') || 'this_month') as 'this_week' | 'this_month' | 'all_time';
  const metric = (interaction.options.getString('metric') || 'voice') as 'voice' | 'streak';
  const page = interaction.options.getInteger('page') || 1;
  const settings = settingsRepo ? await settingsRepo.getSettings(guildId) : null;
  const timezone = settings?.timezone || 'UTC';

  await interaction.deferReply();

  const { embed, row } = await buildLeaderboardEmbed({
    guildId,
    guildName: guild.name,
    period,
    metric,
    page,
    sessionRepo,
    goalsRepo,
    callerUserId: user.id,
    timezone,
  });

  await interaction.editReply({ embeds: [embed], components: [row] });
}

/**
 * Handle button pagination interactions for leaderboard
 */
export async function handleLeaderboardButton(
  interaction: ButtonInteraction,
  sessionRepo: VoiceSessionRepository,
  goalsRepo: UserGoalsRepository,
  settingsRepo?: GuildSettingsRepository
): Promise<void> {
  const { customId, guildId, guild, user } = interaction;
  if (!guildId || !guild) return;
  const settings = settingsRepo ? await settingsRepo.getSettings(guildId) : null;
  const timezone = settings?.timezone || 'UTC';

  const parts = customId.split(':');
  const action = parts[0];
  const period = parts[1] as 'this_week' | 'this_month' | 'all_time';
  const metric = parts[2] as 'voice' | 'streak';
  const currentPage = parseInt(parts[3], 10) || 1;

  let targetPage = currentPage;

  if (action === 'lb_prev') {
    targetPage = Math.max(1, currentPage - 1);
  } else if (action === 'lb_next') {
    targetPage = currentPage + 1;
  } else if (action === 'lb_myrank') {
    // Jump to caller's page
    let rankedItems: string[] = [];
    if (metric === 'streak') {
      const topGoals = await goalsRepo.getTopStreaks(guildId, 100);
      rankedItems = topGoals.map((g) => g.userId);
    } else {
      let preset = TimeRangePreset.THIS_WEEK;
      if (period === 'this_month') preset = TimeRangePreset.THIS_MONTH;
      if (period === 'all_time') preset = TimeRangePreset.ALL_TIME;

      const { startDate, endDate } = resolveTimeRange(preset, undefined, undefined, 'monday', timezone);
      const report = await sessionRepo.getAggregatedReport({
        guildId,
        guildName: guild.name,
        startDate,
        endDate,
        preset,
        timezone,
      });
      rankedItems = (report.topUsers ?? []).map((u) => u.userId);
    }

    const callerIndex = rankedItems.indexOf(user.id);
    if (callerIndex >= 0) {
      targetPage = Math.floor(callerIndex / 10) + 1;
    } else {
      await interaction.reply({
        content: `ℹ️ You don't have any recorded activity in this leaderboard yet!`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
  }

  await interaction.deferUpdate();

  const { embed, row } = await buildLeaderboardEmbed({
    guildId,
    guildName: guild.name,
    period,
    metric,
    page: targetPage,
    sessionRepo,
    goalsRepo,
    callerUserId: user.id,
    timezone,
  });

  await interaction.editReply({ embeds: [embed], components: [row] });
}
