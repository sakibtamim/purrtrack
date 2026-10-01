import {
  ChatInputCommandInteraction,
  ButtonInteraction,
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  User,
  Guild,
} from 'discord.js';
import { VoiceSessionRepository, GuildSettingsRepository, UserGoalsRepository } from '@purrtrack/db';
import { formatDuration, renderBadgePill } from '@purrtrack/shared';

export const statusCommand = new SlashCommandBuilder()
  .setName('status')
  .setDescription('⏱️ View current active voice time tracking session')
  .addUserOption((opt) =>
    opt
      .setName('target')
      .setDescription('Target member to inspect (Management / Admin only, defaults to yourself)')
      .setRequired(false)
  );

export async function buildStatusPayload(
  guild: Guild,
  targetUser: User,
  sessionRepo: VoiceSessionRepository,
  goalsRepo?: UserGoalsRepository
): Promise<{ embeds: EmbedBuilder[]; components: ActionRowBuilder<ButtonBuilder>[] }> {
  const targetMember = await guild.members.fetch(targetUser.id).catch(() => null);
  let activeSession = await sessionRepo.getActiveSession(guild.id, targetUser.id);

  // Self-Healing Invariant: if target is physically in voice, ensure tracking is active
  if (!activeSession && targetMember?.voice?.channel) {
    const channel = targetMember.voice.channel;
    const isAfk = guild.afkChannelId ? channel.id === guild.afkChannelId : false;

    if (!isAfk) {
      await sessionRepo.upsertChannel(channel.id, guild.id, channel.name, false);
      const startResult = await sessionRepo.startSession({
        guildId: guild.id,
        userId: targetUser.id,
        channelId: channel.id,
        channelName: channel.name,
        wasMuted: targetMember.voice.selfMute || targetMember.voice.serverMute || false,
        wasDeafened: targetMember.voice.selfDeaf || targetMember.voice.serverDeaf || false,
        wasStreaming: targetMember.voice.streaming || false,
        wasVideo: targetMember.voice.selfVideo || false,
      });
      activeSession = startResult.session;
    }
  }

  if (!activeSession) {
    const embed = new EmbedBuilder()
      .setColor(0x5865f2) // Blurple
      .setTitle('ℹ️ Voice Session Inactive')
      .setDescription(
        `**${targetUser.username}** is not currently in an active tracked voice session.\n\n*Time tracking starts automatically upon joining a voice channel.*`
      )
      .setTimestamp();

    return { embeds: [embed], components: [] };
  }

  const activeSegment = await sessionRepo.getActiveSegment(activeSession.id);
  const now = new Date();
  const sessionElapsedSeconds = Math.max(0, Math.floor((now.getTime() - new Date(activeSession.startedAt).getTime()) / 1000));
  const segmentElapsedSeconds = activeSegment
    ? Math.max(0, Math.floor((now.getTime() - new Date(activeSegment.startedAt).getTime()) / 1000))
    : 0;

  const currentChannel = targetMember?.voice.channel?.name || activeSegment?.channelName || 'Voice Channel';
  const isConnected = Boolean(targetMember?.voice?.channel);

  const isStreaming = isConnected
    ? Boolean(targetMember?.voice?.streaming)
    : Boolean(activeSegment?.wasStreaming);

  const isVideo = isConnected
    ? Boolean(targetMember?.voice?.selfVideo)
    : Boolean(activeSegment?.wasVideo);

  const isMuted = isConnected
    ? Boolean(targetMember?.voice?.selfMute || targetMember?.voice?.serverMute || targetMember?.voice?.mute)
    : Boolean(activeSegment?.wasMuted);

  const isDeafened = isConnected
    ? Boolean(targetMember?.voice?.selfDeaf || targetMember?.voice?.serverDeaf || targetMember?.voice?.deaf)
    : Boolean(activeSegment?.wasDeafened);

  // Self-heal: If the member is currently in voice, keep database segment in sync
  if (
    isConnected &&
    activeSegment &&
    (activeSegment.wasMuted !== isMuted ||
      activeSegment.wasDeafened !== isDeafened ||
      activeSegment.wasStreaming !== isStreaming ||
      activeSegment.wasVideo !== isVideo)
  ) {
    await sessionRepo.transitionState({
      sessionId: activeSession.id,
      wasMuted: isMuted,
      wasDeafened: isDeafened,
      wasStreaming: isStreaming,
      wasVideo: isVideo,
      timestamp: now,
    });
  }

  const startedUnix = Math.floor(new Date(activeSession.startedAt).getTime() / 1000);
  const segmentStartedUnix = activeSegment
    ? Math.floor(new Date(activeSegment.startedAt).getTime() / 1000)
    : startedUnix;

  const userAvatar = targetUser.displayAvatarURL ? targetUser.displayAvatarURL({ size: 128 }) : undefined;
  const userTag = targetUser.displayName ? `${targetUser.displayName} (@${targetUser.username})` : `@${targetUser.username}`;

  const userGoal = goalsRepo ? await goalsRepo.getGoal(guild.id, targetUser.id) : null;
  const primaryBadgeId = userGoal?.equippedBadgeIds?.[0];
  const badgePill = primaryBadgeId ? renderBadgePill(primaryBadgeId) : '';
  const authorName = badgePill ? `${userTag} • ${badgePill}` : userTag;

  const embed = new EmbedBuilder()
    .setColor(0x57f287) // Discord Green
    .setAuthor({
      name: authorName,
      iconURL: userAvatar,
    })
    .setTitle(`🟢 Active Voice Tracking`)
    .setDescription(`Connected to **#${currentChannel}**`)
    .setThumbnail(userAvatar || null)
    .addFields(
      {
        name: '⏱️ Total Session',
        value: `\`${formatDuration(sessionElapsedSeconds)}\`\nActive: <t:${startedUnix}:R>`,
        inline: true,
      },
      {
        name: '🔊 In Channel',
        value: `\`${formatDuration(segmentElapsedSeconds)}\`\nJoined: <t:${segmentStartedUnix}:R>`,
        inline: true,
      },
      {
        name: '\u200b',
        value: '\u200b',
        inline: true,
      },
      {
        name: '🎙️ Voice & Audio',
        value: [
          `Mic: **${isMuted ? '🔇 Muted' : '🟢 Active'}**`,
          `Audio: **${isDeafened ? '🔇 Deafened' : '🟢 Listening'}**`,
        ].join('\n'),
        inline: true,
      },
      {
        name: '📺 Media & Video',
        value: [
          `Screen: **${isStreaming ? '🟢 Sharing' : '⚪ Off'}**`,
          `Camera: **${isVideo ? '🟢 ON' : '⚪ Off'}**`,
        ].join('\n'),
        inline: true,
      },
      {
        name: '\u200b',
        value: '\u200b',
        inline: true,
      },
      {
        name: '🕒 Session Started',
        value: `<t:${startedUnix}:F> (<t:${startedUnix}:R>)`,
        inline: false,
      }
    )
    .setFooter({ text: 'PurrTrack • TimeTrack for Discord' })
    .setTimestamp();

  const refreshButton = new ButtonBuilder()
    .setCustomId(`status_refresh:${targetUser.id}`)
    .setLabel('Refresh Live Status')
    .setEmoji('🔄')
    .setStyle(ButtonStyle.Secondary);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(refreshButton);

  return { embeds: [embed], components: [row] };
}

export async function handleStatusCommand(
  interaction: ChatInputCommandInteraction,
  sessionRepo: VoiceSessionRepository,
  settingsRepo?: GuildSettingsRepository,
  goalsRepo?: UserGoalsRepository
): Promise<void> {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ content: '❌ This command can only be used in a server.', ephemeral: true });
    return;
  }

  const targetUser = interaction.options.getUser('target') || interaction.user;
  const isSelf = targetUser.id === interaction.user.id;

  // RBAC Permission Check: Regular members can only view their own status
  if (!isSelf) {
    const member = await guild.members.fetch(interaction.user.id);
    const settings = settingsRepo ? await settingsRepo.getSettings(guild.id) : null;
    const isOwner = guild.ownerId === interaction.user.id;
    const isManager =
      isOwner ||
      member.permissions.has(PermissionFlagsBits.Administrator) ||
      member.permissions.has(PermissionFlagsBits.ManageGuild) ||
      Boolean(settings?.adminRoleIds && member.roles.cache.some((r) => settings.adminRoleIds?.includes(r.id)));

    if (!isManager) {
      await interaction.reply({
        content: '⛔ You can only view your own status. Inspecting other team members requires a Management or Administrator role.',
        ephemeral: true,
      });
      return;
    }
  }

  const payload = await buildStatusPayload(guild, targetUser, sessionRepo, goalsRepo);
  await interaction.reply({
    embeds: payload.embeds,
    components: payload.components,
    ephemeral: true,
  });
}

export async function handleStatusRefreshButton(
  interaction: ButtonInteraction,
  sessionRepo: VoiceSessionRepository,
  settingsRepo?: GuildSettingsRepository,
  goalsRepo?: UserGoalsRepository
): Promise<void> {
  const guild = interaction.guild;
  if (!guild) return;

  const parts = interaction.customId.split(':');
  const targetUserId = parts[1];
  if (!targetUserId) return;

  const isSelf = targetUserId === interaction.user.id;
  if (!isSelf) {
    const member = await guild.members.fetch(interaction.user.id).catch(() => null);
    const settings = settingsRepo ? await settingsRepo.getSettings(guild.id) : null;
    const isOwner = guild.ownerId === interaction.user.id;
    const isManager =
      isOwner ||
      Boolean(member?.permissions.has(PermissionFlagsBits.Administrator)) ||
      Boolean(member?.permissions.has(PermissionFlagsBits.ManageGuild)) ||
      Boolean(settings?.adminRoleIds && member?.roles.cache.some((r) => settings.adminRoleIds?.includes(r.id)));

    if (!isManager) {
      await interaction.reply({
        content: '⛔ You do not have permission to inspect or refresh another member’s status.',
        ephemeral: true,
      });
      return;
    }
  }

  const targetUser = await interaction.client.users.fetch(targetUserId).catch(() => null);
  if (!targetUser) return;

  const payload = await buildStatusPayload(guild, targetUser, sessionRepo, goalsRepo);

  await interaction.update({
    embeds: payload.embeds,
    components: payload.components,
  });
}
