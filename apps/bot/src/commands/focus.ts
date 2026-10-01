import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  GuildMember,
  EmbedBuilder,
} from 'discord.js';
import { FocusManager } from '../engine/focus-manager.js';
import { formatDuration } from '@purrtrack/shared';

export const focusCommand = new SlashCommandBuilder()
  .setName('focus')
  .setDescription('🍅 Pomodoro focus sprints with voice tracking')
  .addSubcommand((sub) =>
    sub
      .setName('start')
      .setDescription('Start a focus sprint in voice')
      .addIntegerOption((opt) =>
        opt
          .setName('work')
          .setDescription('Focus duration in minutes (default: 25)')
          .setMinValue(1)
          .setMaxValue(180)
          .setRequired(false)
      )
      .addIntegerOption((opt) =>
        opt
          .setName('break')
          .setDescription('Break duration in minutes (default: 5, 0 to disable)')
          .setMinValue(0)
          .setMaxValue(60)
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
    await interaction.reply({ content: '❌ This command can only be used within a server.', ephemeral: true });
    return;
  }

  const subcommand = interaction.options.getSubcommand();
  const member = interaction.member as GuildMember;

  if (subcommand === 'start') {
    // Verify voice connection
    if (!member?.voice?.channel) {
      await interaction.reply({
        content: '❌ You must be connected to a voice channel to start a focus sprint.',
        ephemeral: true,
      });
      return;
    }

    const workMinutes = interaction.options.getInteger('work') ?? 25;
    const breakMinutes = interaction.options.getInteger('break') ?? 5;
    const task = interaction.options.getString('task') || 'Deep Work';

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
        `Focus mode engaged for **${workMinutes} minutes** in **#${member.voice.channel.name}**.\n` +
          `Stay focused, avoid distractions, and let\'s get things done!`
      )
      .addFields(
        // Row 1: Task & Sprint Duration
        { name: '🎯 Focus Objective', value: `*${task}*`, inline: true },
        { name: '⏱️ Sprint Interval', value: `\`${workMinutes}m work\` • \`${breakMinutes}m break\``, inline: true },
        { name: '\u200b', value: '\u200b', inline: true },

        // Row 2: Timer
        { name: '⏳ Sprint Ends', value: `<t:${endsTimestamp}:R> (<t:${endsTimestamp}:t>)`, inline: true },
        { name: '💡 Tip', value: 'Use `/focus stop` anytime to finish early.', inline: true },
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
        ephemeral: true,
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
        ephemeral: true,
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
