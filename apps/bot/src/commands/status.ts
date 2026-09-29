import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  EmbedBuilder,
} from 'discord.js';
import { VoiceSessionRepository } from '@purrtrack/db';
import { formatDuration } from '@purrtrack/shared';

export const statusCommand = new SlashCommandBuilder()
  .setName('status')
  .setDescription('⏱️ View current active voice time tracking session')
  .addUserOption((opt) =>
    opt
      .setName('target')
      .setDescription('Target member to inspect (Admin/Manager only, defaults to yourself)')
      .setRequired(false)
  );

export async function handleStatusCommand(
  interaction: ChatInputCommandInteraction,
  sessionRepo: VoiceSessionRepository
): Promise<void> {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ content: '❌ This command can only be used in a server.', ephemeral: true });
    return;
  }

  const targetUser = interaction.options.getUser('target') || interaction.user;
  const member = await guild.members.fetch(targetUser.id).catch(() => null);

  let activeSession = await sessionRepo.getActiveSession(guild.id, targetUser.id);

  // Self-Healing Invariant: if member is physically in a voice channel, ensure tracking is active
  if (!activeSession && member?.voice?.channel) {
    const channel = member.voice.channel;
    const isAfk = guild.afkChannelId ? channel.id === guild.afkChannelId : false;

    if (!isAfk) {
      await sessionRepo.upsertChannel(channel.id, guild.id, channel.name, false);
      const startResult = await sessionRepo.startSession({
        guildId: guild.id,
        userId: targetUser.id,
        channelId: channel.id,
        channelName: channel.name,
        wasMuted: member.voice.selfMute || member.voice.serverMute || false,
        wasDeafened: member.voice.selfDeaf || member.voice.serverDeaf || false,
        wasStreaming: member.voice.streaming || false,
      });
      activeSession = startResult.session;
    }
  }

  if (!activeSession) {
    await interaction.reply({
      content: `ℹ️ **${targetUser.username}** is not currently in an active tracked voice session. Time tracking starts automatically upon joining a voice channel.`,
      ephemeral: true,
    });
    return;
  }

  const activeSegment = await sessionRepo.getActiveSegment(activeSession.id);
  const now = new Date();
  const sessionElapsedSeconds = Math.max(0, Math.floor((now.getTime() - new Date(activeSession.startedAt).getTime()) / 1000));
  const segmentElapsedSeconds = activeSegment
    ? Math.max(0, Math.floor((now.getTime() - new Date(activeSegment.startedAt).getTime()) / 1000))
    : 0;

  const currentChannel = member?.voice.channel?.name || activeSegment?.channelName || 'Voice Channel';

  const embed = new EmbedBuilder()
    .setColor(0x57f287) // Green
    .setTitle(`🟢 Live Voice Session: ${targetUser.username}`)
    .setDescription(`Tracking is **active** in **#${currentChannel}**.`)
    .addFields(
      { name: 'Total Session Duration', value: `\`${formatDuration(sessionElapsedSeconds)}\``, inline: true },
      { name: 'Current Channel Duration', value: `\`${formatDuration(segmentElapsedSeconds)}\``, inline: true },
      { name: 'Started At (UTC)', value: new Date(activeSession.startedAt).toUTCString(), inline: false }
    )
    .setFooter({ text: 'PurrTrack • TimeTrack for Discord' })
    .setTimestamp();

  await interaction.reply({ embeds: [embed], ephemeral: true });
}
