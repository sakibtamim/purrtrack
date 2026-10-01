import {
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ChannelType,
} from 'discord.js';
import { GuildSettingsRepository } from '@purrtrack/db';
import { logger } from '../core/logger.js';

export const configCommand = new SlashCommandBuilder()
  .setName('config')
  .setDescription('⚙️ Manage PurrTrack server configuration & management roles')
  .addSubcommand((sub) => sub.setName('view').setDescription('View current server tracking settings & manager roles'))
  .addSubcommand((sub) =>
    sub
      .setName('set')
      .setDescription('Update server tracking settings')
      .addBooleanOption((opt) => opt.setName('enabled').setDescription('Enable/disable voice tracking'))
      .addBooleanOption((opt) => opt.setName('exclude_afk').setDescription('Ignore time spent in the AFK channel'))
      .addBooleanOption((opt) => opt.setName('track_muted').setDescription('Track time when user is muted'))
      .addBooleanOption((opt) => opt.setName('track_deafened').setDescription('Track time when user is deafened'))
      .addBooleanOption((opt) => opt.setName('track_streaming').setDescription('Track time when user is screen sharing'))
      .addBooleanOption((opt) => opt.setName('track_camera').setDescription('Track time when user has webcam / video enabled'))
      .addChannelOption((opt) =>
        opt
          .setName('announce_channel')
          .setDescription('Channel for online/offline bot announcements')
          .addChannelTypes(ChannelType.GuildText)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('channel_ignore')
      .setDescription('Exclude a voice channel from time tracking')
      .addChannelOption((opt) =>
        opt
          .setName('channel')
          .setDescription('Voice channel to ignore')
          .addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice)
          .setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('channel_unignore')
      .setDescription('Resume time tracking for a previously ignored voice channel')
      .addStringOption((opt) =>
        opt
          .setName('channel')
          .setDescription('Select ignored voice channel to restore')
          .setRequired(true)
          .setAutocomplete(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('role_add')
      .setDescription('Assign a Management role (allows member inspection & server-wide reporting)')
      .addRoleOption((opt) => opt.setName('role').setDescription('Role to grant Management permissions').setRequired(true))
  )
  .addSubcommand((sub) =>
    sub
      .setName('role_remove')
      .setDescription('Remove Management permissions from a role')
      .addStringOption((opt) =>
        opt
          .setName('role')
          .setDescription('Select the configured Management role to remove')
          .setRequired(true)
          .setAutocomplete(true)
      )
  );

export async function handleConfigCommand(
  interaction: ChatInputCommandInteraction,
  settingsRepo: GuildSettingsRepository
): Promise<void> {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ content: '❌ This command can only be used in a server.', ephemeral: true });
    return;
  }

  // Permission verification: Server Owner or Administrator / ManageGuild permission required
  const member = await guild.members.fetch(interaction.user.id);
  const isOwner = guild.ownerId === interaction.user.id;
  const isAdmin =
    isOwner ||
    member.permissions.has(PermissionFlagsBits.Administrator) ||
    member.permissions.has(PermissionFlagsBits.ManageGuild);

  const settings = await settingsRepo.getSettings(guild.id);
  const isManager = settings.adminRoleIds?.some((rId) => member.roles.cache.has(rId)) ?? false;

  const subcommand = interaction.options.getSubcommand();

  if (subcommand === 'view') {
    if (!isAdmin && !isManager) {
      await interaction.reply({
        content: '⛔ Only Server Administrators and Management role members can view PurrTrack configuration.',
        ephemeral: true,
      });
      return;
    }
    const rolesList = settings.adminRoleIds && settings.adminRoleIds.length > 0
      ? settings.adminRoleIds.map((rId) => `<@&${rId}>`).join(', ')
      : '*None configured (Server Owner & Discord Administrators only)*';

    const ignoredList = settings.ignoredChannelIds && settings.ignoredChannelIds.length > 0
      ? settings.ignoredChannelIds.map((cId) => `<#${cId}>`).join(', ')
      : '*None (All voice channels tracked)*';

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(`⚙️ PurrTrack Settings: ${guild.name}`)
      .addFields(
        { name: 'Tracking Enabled', value: settings.trackingEnabled ? '✅ Yes' : '❌ No', inline: true },
        { name: 'Exclude AFK Channel', value: settings.excludeAfk ? '✅ Yes' : '❌ No', inline: true },
        { name: 'Track While Muted', value: settings.trackMuted ? '✅ Yes' : '❌ No', inline: true },
        { name: 'Track While Deafened', value: settings.trackDeafened ? '✅ Yes' : '❌ No', inline: true },
        { name: 'Track Screen Share', value: settings.trackStreaming ? '✅ Yes' : '❌ No', inline: true },
        { name: 'Track Webcam Video', value: settings.trackCamera ? '✅ Yes' : '❌ No', inline: true },
        { name: 'Server Timezone', value: `\`${settings.timezone}\``, inline: true },
        {
          name: 'Announcement Channel',
          value: settings.announceChannelId ? `<#${settings.announceChannelId}>` : 'None',
          inline: true,
        },
        {
          name: '🔇 Ignored Channels',
          value: ignoredList,
          inline: false,
        },
        {
          name: '🛡️ Management Roles (Can view reports & other users)',
          value: rolesList,
          inline: false,
        }
      )
      .setFooter({ text: 'PurrTrack • TimeTrack for Discord' })
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  // Modifying settings requires Server Owner or Discord Administrator / Manage Server
  if (!isAdmin) {
    await interaction.reply({
      content: '⛔ Only Server Administrators and the Server Owner can modify PurrTrack settings or assign management roles.',
      ephemeral: true,
    });
    return;
  }

  if (subcommand === 'channel_ignore') {
    const channel = interaction.options.getChannel('channel', true);
    await settingsRepo.addIgnoredChannel(guild.id, channel.id);

    await interaction.reply({
      content: `✅ Voice channel <#${channel.id}> is now **ignored**. Voice time spent in this channel will not be tracked.`,
      ephemeral: true,
    });
    return;
  }

  if (subcommand === 'channel_unignore') {
    const rawChannel = interaction.options.getString('channel', true).trim();
    const channelId = rawChannel.replace(/[<#>]/g, '');

    if (channelId === 'none') {
      await interaction.reply({
        content: '⚠️ There are no voice channels currently ignored in this server.',
        ephemeral: true,
      });
      return;
    }

    const currentSettings = await settingsRepo.getSettings(guild.id);
    const existingChannels = currentSettings.ignoredChannelIds || [];

    if (!existingChannels.includes(channelId)) {
      await interaction.reply({
        content: '⚠️ That channel is not currently on the ignored list.',
        ephemeral: true,
      });
      return;
    }

    await settingsRepo.removeIgnoredChannel(guild.id, channelId);

    await interaction.reply({
      content: `✅ Voice channel <#${channelId}> is no longer ignored. Voice time will now be tracked.`,
      ephemeral: true,
    });
    return;
  }

  if (subcommand === 'role_add') {
    const role = interaction.options.getRole('role', true);
    await settingsRepo.addAdminRole(guild.id, role.id);

    await interaction.reply({
      content: `✅ Successfully added <@&${role.id}> as a **Management Role**!\nMembers with this role can now:\n• View live tracking for any team member (\`/status target:@user\`)\n• Export individual timesheets (\`/report user target:@user\`)\n• Export server-wide reports (\`/report guild\`)`,
      ephemeral: true,
    });
    return;
  }

  if (subcommand === 'role_remove') {
    const rawRole = interaction.options.getString('role', true).trim();
    const roleId = rawRole.replace(/[<@&>]/g, '');

    if (roleId === 'none') {
      await interaction.reply({
        content: '⚠️ There are no Management roles currently configured in this server.',
        ephemeral: true,
      });
      return;
    }

    const currentSettings = await settingsRepo.getSettings(guild.id);
    const existingRoles = currentSettings.adminRoleIds || [];

    let targetRoleId = roleId;
    if (!existingRoles.includes(targetRoleId)) {
      const matched = existingRoles.find((rId) => {
        const r = guild.roles.cache.get(rId);
        return r && (r.name.toLowerCase() === rawRole.toLowerCase() || `@${r.name.toLowerCase()}` === rawRole.toLowerCase());
      });
      if (matched) {
        targetRoleId = matched;
      }
    }

    if (!existingRoles.includes(targetRoleId)) {
      await interaction.reply({
        content: `⚠️ That role is not in the configured Management Roles list.`,
        ephemeral: true,
      });
      return;
    }

    await settingsRepo.removeAdminRole(guild.id, targetRoleId);

    await interaction.reply({
      content: `✅ Successfully removed Management permissions from <@&${targetRoleId}>.`,
      ephemeral: true,
    });
    return;
  }

  if (subcommand === 'set') {
    const enabled = interaction.options.getBoolean('enabled');
    const excludeAfk = interaction.options.getBoolean('exclude_afk');
    const trackMuted = interaction.options.getBoolean('track_muted');
    const trackDeafened = interaction.options.getBoolean('track_deafened');
    const trackStreaming = interaction.options.getBoolean('track_streaming');
    const trackCamera = interaction.options.getBoolean('track_camera');
    const announceChannel = interaction.options.getChannel('announce_channel');

    const updates: Record<string, any> = {};
    if (enabled !== null) updates.trackingEnabled = enabled;
    if (excludeAfk !== null) updates.excludeAfk = excludeAfk;
    if (trackMuted !== null) updates.trackMuted = trackMuted;
    if (trackDeafened !== null) updates.trackDeafened = trackDeafened;
    if (trackStreaming !== null) updates.trackStreaming = trackStreaming;
    if (trackCamera !== null) updates.trackCamera = trackCamera;
    if (announceChannel !== null) updates.announceChannelId = announceChannel.id;

    if (Object.keys(updates).length === 0) {
      await interaction.reply({ content: '⚠️ No settings were provided to update.', ephemeral: true });
      return;
    }

    await settingsRepo.updateSettings(guild.id, updates);

    await interaction.reply({
      content: `✅ Successfully updated PurrTrack settings for **${guild.name}**!`,
      ephemeral: true,
    });
    return;
  }
}

export async function handleConfigAutocomplete(
  interaction: AutocompleteInteraction,
  settingsRepo: GuildSettingsRepository
): Promise<void> {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.respond([]);
    return;
  }

  const subcommand = interaction.options.getSubcommand(false);

  if (subcommand === 'role_remove') {
    const focused = interaction.options.getFocused(true);
    if (focused.name !== 'role') {
      await interaction.respond([]);
      return;
    }

    try {
      const settings = await settingsRepo.getSettings(guild.id);
      const roleIds = settings.adminRoleIds || [];

      if (roleIds.length === 0) {
        await interaction.respond([
          { name: '⚠️ No management roles currently configured', value: 'none' },
        ]);
        return;
      }

      const query = focused.value.toLowerCase().trim();
      const choices: { name: string; value: string }[] = [];

      if (guild.roles.cache.size <= 1) {
        await guild.roles.fetch().catch(() => {});
      }

      for (const roleId of roleIds) {
        const role = guild.roles.cache.get(roleId);
        const roleName = role ? `@${role.name}` : `Role ID: ${roleId}`;
        if (!query || roleName.toLowerCase().includes(query)) {
          choices.push({
            name: roleName.slice(0, 100),
            value: roleId,
          });
        }
      }

      if (choices.length === 0) {
        await interaction.respond([
          { name: '⚠️ No matching configured management roles', value: 'none' },
        ]);
        return;
      }

      await interaction.respond(choices.slice(0, 25));
      return;
    } catch (error) {
      logger.error('[config:autocomplete] Error generating role choices:', error);
      await interaction.respond([]).catch(() => {});
      return;
    }
  }

  if (subcommand === 'channel_unignore') {
    const focused = interaction.options.getFocused(true);
    if (focused.name !== 'channel') {
      await interaction.respond([]);
      return;
    }

    try {
      const settings = await settingsRepo.getSettings(guild.id);
      const channelIds = settings.ignoredChannelIds || [];

      if (channelIds.length === 0) {
        await interaction.respond([
          { name: '⚠️ No voice channels currently ignored', value: 'none' },
        ]);
        return;
      }

      const query = focused.value.toLowerCase().trim();
      const choices: { name: string; value: string }[] = [];

      if (guild.channels.cache.size <= 1) {
        await guild.channels.fetch().catch(() => {});
      }

      for (const channelId of channelIds) {
        const ch = guild.channels.cache.get(channelId);
        const channelName = ch ? `#${ch.name}` : `Channel ID: ${channelId}`;
        if (!query || channelName.toLowerCase().includes(query)) {
          choices.push({
            name: channelName.slice(0, 100),
            value: channelId,
          });
        }
      }

      if (choices.length === 0) {
        await interaction.respond([
          { name: '⚠️ No matching ignored voice channels', value: 'none' },
        ]);
        return;
      }

      await interaction.respond(choices.slice(0, 25));
      return;
    } catch (error) {
      logger.error('[config:autocomplete] Error generating channel choices:', error);
      await interaction.respond([]).catch(() => {});
      return;
    }
  }

  await interaction.respond([]);
}
