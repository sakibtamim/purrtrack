import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from 'discord.js';
import { VoiceSessionRepository, UserGoalsRepository } from '@purrtrack/db';
import { TimeRangePreset, resolveTimeRange, formatDuration, renderProgressBar, getWeekStartDayIndex } from '@purrtrack/shared';
import { logger } from '../core/logger.js';

export const goalCommand = new SlashCommandBuilder()
  .setName('goal')
  .setDescription('🎯 Manage and view weekly voice time goals & streaks')
  .addSubcommand((sub) =>
    sub
      .setName('view')
      .setDescription('View current weekly goal progress and active streak')
      .addUserOption((opt) =>
        opt.setName('target').setDescription('Member to view weekly goal for (defaults to you)').setRequired(false)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('set')
      .setDescription('Configure your weekly voice target and preferred week start day')
      .addIntegerOption((opt) =>
        opt
          .setName('target_hours')
          .setDescription('Target voice hours per week (1 - 168)')
          .setRequired(false)
          .setMinValue(1)
          .setMaxValue(168)
      )
      .addStringOption((opt) =>
        opt
          .setName('week_start')
          .setDescription('Day your weekly cycle begins (default: Monday)')
          .setRequired(false)
          .addChoices(
            { name: 'Monday (ISO standard)', value: 'monday' },
            { name: 'Sunday (US / CA / JP)', value: 'sunday' },
            { name: 'Saturday (Middle East / BD / Islamic)', value: 'saturday' },
            { name: 'Friday', value: 'friday' },
            { name: 'Thursday', value: 'thursday' },
            { name: 'Wednesday', value: 'wednesday' },
            { name: 'Tuesday', value: 'tuesday' }
          )
      )
  );

export async function handleGoalCommand(
  interaction: ChatInputCommandInteraction,
  sessionRepo: VoiceSessionRepository,
  goalsRepo: UserGoalsRepository
): Promise<void> {
  const { guildId } = interaction;
  if (!guildId) {
    await interaction.reply({ content: '❌ This command can only be used within a server.', ephemeral: true });
    return;
  }

  const subcommand = interaction.options.getSubcommand();

  if (subcommand === 'set') {
    const targetHours = interaction.options.getInteger('target_hours');
    const weekStart = interaction.options.getString('week_start');

    if (targetHours === null && weekStart === null) {
      await interaction.reply({
        content: '❌ Please specify at least one option: `target_hours`, `week_start`, or both.',
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    const updated = await goalsRepo.setGoal({
      guildId,
      userId: interaction.user.id,
      targetHours: targetHours ?? undefined,
      weekStartDay: weekStart ?? undefined,
    });

    const capitalDay = updated.weekStartDay.charAt(0).toUpperCase() + updated.weekStartDay.slice(1);
    const targetHoursDisplay = Math.round(updated.weeklyTargetSeconds / 3600);

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('🎯 Weekly Voice Goal Updated')
      .setDescription(
        `Your weekly voice settings have been updated:\n\n` +
          `• **Weekly Target**: \`${formatDuration(updated.weeklyTargetSeconds)}\` (${targetHoursDisplay} hours)\n` +
          `• **Week Starts On**: **${capitalDay}** (Cycle resets every ${capitalDay} 00:00 UTC)\n\n` +
          `Track your progress anytime with \`/goal view\`!`
      )
      .setFooter({ text: 'PurrTrack Productivity' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
    return;
  }

  if (subcommand === 'view') {
    const targetUser = interaction.options.getUser('target') || interaction.user;
    await interaction.deferReply();

    const goal = await goalsRepo.getOrCreateGoal(guildId, targetUser.id);
    let streak = goal.currentStreakDays || 0;

    // Check historical activity if streak record is empty
    if (streak === 0) {
      const historicalStreak = await goalsRepo.calculateHistoricalStreak(guildId, targetUser.id);
      if (historicalStreak > 0) {
        streak = historicalStreak;
      }
    }

    const userWeekStart = goal.weekStartDay || 'monday';
    const capitalStartDay = userWeekStart.charAt(0).toUpperCase() + userWeekStart.slice(1);

    const { startDate, endDate } = resolveTimeRange(TimeRangePreset.THIS_WEEK, undefined, undefined, userWeekStart);
    const report = await sessionRepo.getAggregatedReport({
      guildId,
      guildName: interaction.guild?.name || 'Server',
      userId: targetUser.id,
      startDate,
      endDate,
      preset: TimeRangePreset.THIS_WEEK,
    });

    const trackedSeconds = report.totalDurationSeconds;
    const targetSeconds = goal.weeklyTargetSeconds;
    const percent = targetSeconds > 0 ? (trackedSeconds / targetSeconds) * 100 : 0;
    const progressBar = renderProgressBar(percent, 10);

    const now = new Date();
    const currentDay = now.getUTCDay();
    const startDayIndex = getWeekStartDayIndex(userWeekStart);
    const diff = (currentDay - startDayIndex + 7) % 7;
    const daysRemaining = 6 - diff;
    const daysText =
      daysRemaining === 0 ? '🏁 Final day of your cycle!' : `⏳ ${daysRemaining} day${daysRemaining === 1 ? '' : 's'} remaining`;

    const remainingText =
      trackedSeconds >= targetSeconds
        ? `🎉 **Goal Achieved!** (+${formatDuration(trackedSeconds - targetSeconds)} overtime)`
        : `\`${formatDuration(targetSeconds - trackedSeconds)}\` to go`;

    const isComplete = percent >= 100;
    const embed = new EmbedBuilder()
      .setColor(isComplete ? 0x10B981 : 0x5865F2)
      .setTitle(`🎯 Weekly Voice Goal — ${targetUser.username}`)
      .setThumbnail(targetUser.displayAvatarURL({ size: 128 }))
      .addFields(
        // Row 1: Target vs Completed
        { name: '🎯 Weekly Target', value: `\`${formatDuration(targetSeconds)}\``, inline: true },
        { name: '⏱️ Tracked This Week', value: `\`${formatDuration(trackedSeconds)}\``, inline: true },
        { name: '\u200b', value: '\u200b', inline: true },

        // Row 2: Progress & Remaining
        { name: '📊 Goal Progress', value: `\`${progressBar}\``, inline: true },
        { name: '⏳ Remaining Goal', value: remainingText, inline: true },
        { name: '\u200b', value: '\u200b', inline: true },

        // Row 3: Streak & Week Timeline
        { name: '🔥 Active Streak', value: `**${streak} consecutive day${streak === 1 ? '' : 's'}**`, inline: true },
        { name: '📅 Week Timeline', value: daysText, inline: true },
        { name: '\u200b', value: '\u200b', inline: true }
      )
      .setFooter({ text: `PurrTrack Productivity • Resets ${capitalStartDay}s 00:00 UTC` })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  }
}
