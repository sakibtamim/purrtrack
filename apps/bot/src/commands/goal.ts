import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
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
  )
  .addSubcommand((sub) =>
    sub
      .setName('reset')
      .setDescription('Reset or cancel your current active weekly goal')
  );

export async function handleGoalCommand(
  interaction: ChatInputCommandInteraction,
  sessionRepo: VoiceSessionRepository,
  goalsRepo: UserGoalsRepository
): Promise<void> {
  const { guildId } = interaction;
  if (!guildId) {
    await interaction.reply({ content: '❌ This command can only be used within a server.', flags: MessageFlags.Ephemeral });
    return;
  }

  const subcommand = interaction.options.getSubcommand();

  if (subcommand === 'reset') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const existingGoal = await goalsRepo.getGoal(guildId, interaction.user.id);
    if (!existingGoal || !existingGoal.hasActiveGoal) {
      await interaction.editReply({
        content: 'ℹ️ You do not have an active weekly goal to reset. You can set one anytime with `/goal set`!',
      });
      return;
    }

    await goalsRepo.resetGoal(guildId, interaction.user.id);

    const embed = new EmbedBuilder()
      .setColor(0x3B82F6)
      .setTitle('🔄 Weekly Goal Reset')
      .setDescription(
        `Your active weekly goal has been cancelled.\n\n` +
          `• **Tracked Hours**: All your recorded voice time remains safely stored in the database.\n` +
          `• **Streaks**: Your daily activity streaks are completely unaffected.\n\n` +
          `You are free to set a new goal anytime using \`/goal set\`!`
      )
      .setFooter({ text: 'PurrTrack Productivity' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
    return;
  }

  if (subcommand === 'set') {
    const targetHours = interaction.options.getInteger('target_hours');
    const weekStart = interaction.options.getString('week_start');

    if (targetHours === null && weekStart === null) {
      await interaction.reply({
        content: '❌ Please specify at least one option: `target_hours`, `week_start`, or both.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    // 1. Guard Rail: Check if user already has an active, unfinished goal for the current cycle
    const existingGoal = await goalsRepo.getGoal(guildId, interaction.user.id);
    let previousGoalFinished = false;

    if (existingGoal && existingGoal.hasActiveGoal) {
      const activeWeekStart = existingGoal.weekStartDay || 'monday';
      const { startDate, endDate } = resolveTimeRange(TimeRangePreset.THIS_WEEK, undefined, undefined, activeWeekStart);

      // Check if the active goal was set for the current week cycle
      const isCurrentCycle =
        !existingGoal.cycleStartDate || existingGoal.cycleStartDate.getTime() >= startDate.getTime();

      if (isCurrentCycle) {
        // Query progress for the current week
        const report = await sessionRepo.getAggregatedReport({
          guildId,
          guildName: interaction.guild?.name || 'Server',
          userId: interaction.user.id,
          startDate,
          endDate,
          preset: TimeRangePreset.THIS_WEEK,
        });

        const trackedSeconds = report.totalDurationSeconds;
        const targetSeconds = existingGoal.weeklyTargetSeconds;
        const isFinished = trackedSeconds >= targetSeconds;

        if (!isFinished) {
          // GUARD RAIL TRIGGERED: Goal is in-progress and not finished yet
          const percent = targetSeconds > 0 ? (trackedSeconds / targetSeconds) * 100 : 0;
          const remainingSeconds = Math.max(0, targetSeconds - trackedSeconds);
          const progressBar = renderProgressBar(percent, 10);

          const now = new Date();
          const currentDay = now.getUTCDay();
          const startDayIndex = getWeekStartDayIndex(activeWeekStart);
          const diff = (currentDay - startDayIndex + 7) % 7;
          const daysRemaining = 6 - diff;
          const capitalStartDay = activeWeekStart.charAt(0).toUpperCase() + activeWeekStart.slice(1);

          const embed = new EmbedBuilder()
            .setColor(0xF59E0B) // Warning amber
            .setTitle('⚠️ Active Weekly Goal in Progress')
            .setDescription(
              `You already have an active weekly goal running in this server!\n\n` +
                `• **Current Target**: \`${formatDuration(targetSeconds)}\`\n` +
                `• **Tracked This Week**: \`${formatDuration(trackedSeconds)}\`\n` +
                `• **Remaining**: \`${formatDuration(remainingSeconds)}\` to go\n` +
                `• **Progress**: \`${progressBar}\`\n` +
                `• **Cycle Ends**: ⏳ ${daysRemaining} day${daysRemaining === 1 ? '' : 's'} remaining (Resets every ${capitalStartDay} 00:00 UTC)\n\n` +
                `You cannot add or modify your goal until your active goal is **finished (100%)** or the weekly cycle resets.\n\n` +
                `💡 *If you cannot finish your goal and need to forfeit/cancel it, use \`/goal reset\`.*`
            )
            .setFooter({ text: 'PurrTrack Productivity Guard' });

          await interaction.editReply({ embeds: [embed] });
          return;
        }

        previousGoalFinished = true;
      }
    }

    const effectiveWeekStart = weekStart ?? existingGoal?.weekStartDay ?? 'monday';
    const { startDate } = resolveTimeRange(TimeRangePreset.THIS_WEEK, undefined, undefined, effectiveWeekStart);

    const updated = await goalsRepo.setGoal({
      guildId,
      userId: interaction.user.id,
      targetHours: targetHours ?? undefined,
      weekStartDay: weekStart ?? undefined,
      cycleStartDate: startDate,
    });

    const capitalDay = updated.weekStartDay.charAt(0).toUpperCase() + updated.weekStartDay.slice(1);
    const targetHoursDisplay = Math.round(updated.weeklyTargetSeconds / 3600);

    const titlePrefix = previousGoalFinished ? '🎉 Goal Achieved! New Weekly Goal Set' : '🎯 Weekly Voice Goal Activated';
    const embed = new EmbedBuilder()
      .setColor(0x10B981)
      .setTitle(titlePrefix)
      .setDescription(
        `Your weekly voice goal has been successfully ${previousGoalFinished ? 'updated' : 'activated'}!\n\n` +
          `• **Weekly Target**: \`${formatDuration(updated.weeklyTargetSeconds)}\` (${targetHoursDisplay} hours)\n` +
          `• **Week Starts On**: **${capitalDay}** (Cycle resets every ${capitalDay} 00:00 UTC)\n` +
          `• **Goal Guard**: Active until completed (100%) or cycle ends\n\n` +
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
