import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  GuildMember,
  EmbedBuilder,
  MessageFlags,
} from 'discord.js';
import { FocusManager } from '../engine/focus-manager.js';
import {
  formatDuration,
  parseDurationToMinutes,
  parseBreakToMinutes,
  formatFocusDuration,
  formatIntervalLabel,
} from '@purrtrack/shared';

export const focusCommand = new SlashCommandBuilder()
  .setName('focus')
  .setDescription('🍅 Pomodoro focus sprints with voice tracking')
  .addSubcommand((sub) =>
    sub
      .setName('start')
      .setDescription('Start a focus sprint in voice')
      .addStringOption((opt) =>
        opt
          .setName('timer')
          .setDescription('Focus duration (e.g. 25m, 1h, 2h, 90m, or minutes like 25, 120. Default: 25m)')
          .setRequired(false)
      )
      .addStringOption((opt) =>
        opt
          .setName('break')
          .setDescription('Break duration (e.g. 5m, 10m, 15m, 0 to disable. Default: 5m)')
          .setRequired(false)
      )
      .addStringOption((opt) =>
        opt
          .setName('task')
          .setDescription('What are you focusing on? (e.g. "API Refactoring")')
          .setMaxLength(100)
          .setRequired(false)
      )
  )
  .addSubcommand((sub) =>
    sub.setName('stop').setDescription('Stop your active focus session')
  )
  .addSubcommand((sub) =>
    sub.setName('status').setDescription('Check your active focus session timer')
  );

export async function handleFocusCommand(
  interaction: ChatInputCommandInteraction,
  focusManager: FocusManager
): Promise<void> {
  const { guildId, user } = interaction;
  if (!guildId) {
    await interaction.reply({ content: '❌ This command can only be used within a server.', flags: MessageFlags.Ephemeral });
    return;
  }

  const subcommand = interaction.options.getSubcommand();
  const member = interaction.member as GuildMember;

  if (subcommand === 'start') {
    // 1. Verify voice connection
    if (!member?.voice?.channel) {
      await interaction.reply({
        content: '❌ You must be connected to a voice channel to start a focus sprint.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // 2. Guard: Prevent silently overriding an active focus session
    const existingSession = focusManager.getFocus(guildId, user.id);
    if (existingSession) {
      const endsTimestamp = Math.floor(existingSession.phaseEndsAt.getTime() / 1000);
      const isWork = existingSession.phase === 'work';

      await interaction.reply({
        content:
          `⚠️ You already have an active focus ${isWork ? 'sprint' : 'break'} running on *"${existingSession.task}"*!\n` +
          `• Remaining: <t:${endsTimestamp}:R> (<t:${endsTimestamp}:t>)\n` +
          `• Status: \`${isWork ? 'Working Sprint' : 'Break Period'}\`\n\n` +
          `Please wait until it ends or use \`/focus stop\` before starting a new focus sprint.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // 3. Parse durations (supports "25", "25m", "1h", "2h", "120", etc.)
    const rawTimer = interaction.options.getString('timer');
    const rawBreak = interaction.options.getString('break');

    const workMinutes = parseDurationToMinutes(rawTimer, 25);
    if (workMinutes === null) {
      await interaction.reply({
        content: '❌ Invalid timer format. Please specify a duration like `25m`, `1h`, `2h`, `90m`, or `120`.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const breakMinutes = parseBreakToMinutes(rawBreak, 5);
    if (breakMinutes === null) {
      await interaction.reply({
        content: '❌ Invalid break format. Please specify a duration like `5m`, `10m`, or `0` to disable.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const task = interaction.options.getString('task')?.trim() || 'Deep Work';

    const session = await focusManager.startFocus({
      guildId,
      userId: user.id,
      textChannelId: interaction.channelId,
      workMinutes,
      breakMinutes,
      task,
      client: interaction.client,
    });

    const endsTimestamp = Math.floor(session.phaseEndsAt.getTime() / 1000);

    const embed = new EmbedBuilder()
      .setColor(0xEF4444)
      .setTitle('🍅 Focus Sprint Started!')
      .setDescription(
        `Focus mode engaged for **${formatFocusDuration(workMinutes)}** in **#${member.voice.channel.name}**.\n` +
          `Stay focused, avoid distractions, and let\'s get things done!`
      )
      .addFields(
        // Row 1: Task & Timer Settings
        { name: '🎯 Focus Objective', value: `*${task}*`, inline: true },
        { name: '⏱️ Timer Settings', value: `\`${formatIntervalLabel(workMinutes, 'work')}\` • \`${formatIntervalLabel(breakMinutes, 'break')}\``, inline: true },
        { name: '\u200b', value: '\u200b', inline: true },

        // Row 2: Timer
        { name: '⏳ Sprint Ends', value: `<t:${endsTimestamp}:R> (<t:${endsTimestamp}:t>)`, inline: true },
        { name: '💡 Controls', value: 'Use `/focus status` to inspect or `/focus stop` to finish early.', inline: true },
        { name: '\u200b', value: '\u200b', inline: true }
      )
      .setFooter({ text: 'PurrTrack Pomodoro • Distraction-free voice tracking' })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
    return;
  }

  if (subcommand === 'stop') {
    const stopped = await focusManager.stopFocus(guildId, user.id);
    if (!stopped) {
      await interaction.reply({
        content: 'ℹ️ You do not currently have an active focus session running.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const elapsedSeconds = Math.max(0, Math.floor((Date.now() - stopped.startedAt.getTime()) / 1000));

    const embed = new EmbedBuilder()
      .setColor(0x6B7280)
      .setTitle('⏹️ Focus Session Stopped')
      .setDescription(
        `Your focus session on *"${stopped.task}"* has ended.\n` +
          `Tracked focus time: **${formatDuration(elapsedSeconds)}**.`
      )
      .setFooter({ text: 'PurrTrack Pomodoro' })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
    return;
  }

  if (subcommand === 'status') {
    const session = focusManager.getFocus(guildId, user.id);
    if (!session) {
      await interaction.reply({
        content: 'ℹ️ You have no active focus sprint. Use `/focus start` to begin!',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const endsTimestamp = Math.floor(session.phaseEndsAt.getTime() / 1000);
    const elapsedSeconds = Math.max(0, Math.floor((Date.now() - session.startedAt.getTime()) / 1000));
    const isWork = session.phase === 'work';

    const embed = new EmbedBuilder()
      .setColor(isWork ? 0xEF4444 : 0x10B981)
      .setTitle(isWork ? '🍅 Active Focus Sprint' : '☕ Active Break Phase')
      .addFields(
        { name: '🎯 Objective', value: `*${session.task}*`, inline: true },
        { name: '⏱️ Elapsed', value: `\`${formatDuration(elapsedSeconds)}\``, inline: true },
        { name: '\u200b', value: '\u200b', inline: true },

        { name: '⏳ Remaining in Phase', value: `<t:${endsTimestamp}:R>`, inline: true },
        { name: '🔄 Phase', value: isWork ? '`Working Sprint`' : '`Break Period`', inline: true },
        { name: '\u200b', value: '\u200b', inline: true }
      )
      .setFooter({ text: 'PurrTrack Pomodoro' })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }
}
