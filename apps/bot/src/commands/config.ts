import {
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ChannelType,
  MessageFlags,
} from 'discord.js';
import { normalizeTimezone, getTimezoneLabel, searchTimezones } from "@purrtrack/shared";
import { GuildSettingsRepository, ContractorRatesRepository } from '@purrtrack/db';
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
      .addIntegerOption((opt) =>
        opt
          .setName('max_inactive_minutes')
          .setDescription('Inactivity limit (mins) before moving to AFK / disconnecting (0 to disable)')
          .setMinValue(0)
      )
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
  )
  .addSubcommand((sub) =>
    sub
      .setName('rate_set')
      .setDescription('Set or update a contractor hourly billing rate (Admin/Manager only)')
      .addUserOption((opt) => opt.setName('target').setDescription('Target member/contractor').setRequired(true))
      .addNumberOption((opt) =>
        opt
          .setName('rate')
          .setDescription('Hourly billing rate amount (e.g. 500 or 35.50)')
          .setMinValue(0)
          .setRequired(true)
      )
      .addStringOption((opt) =>
        opt
          .setName('currency')
          .setDescription('Currency code (default: BDT)')
          .setRequired(false)
          .addChoices(
            { name: '🇧🇩 BDT (৳ Bangladeshi Taka)', value: 'BDT' },
            { name: '🇺🇸 USD ($ US Dollar)', value: 'USD' },
            { name: '🇪🇺 EUR (€ Euro)', value: 'EUR' },
            { name: '🇬🇧 GBP (£ British Pound)', value: 'GBP' },
            { name: '🇨🇦 CAD (CA$ Canadian Dollar)', value: 'CAD' },
            { name: '🇦🇺 AUD (A$ Australian Dollar)', value: 'AUD' },
            { name: '🇮🇳 INR (₹ Indian Rupee)', value: 'INR' },
            { name: '🇸🇬 SGD (S$ Singapore Dollar)', value: 'SGD' }
          )
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('rate_remove')
      .setDescription('Remove a contractor hourly billing rate (Admin/Manager only)')
      .addUserOption((opt) => opt.setName('target').setDescription('Target member/contractor').setRequired(true))
  )
  .addSubcommand((sub) =>
    sub
      .setName('rate_view')
      .setDescription('View configured contractor billing rates (Read-only for self)')
      .addUserOption((opt) => opt.setName('target').setDescription('Target member to inspect (Admin only)').setRequired(false))
  )
  .addSubcommand((sub) =>
    sub
      .setName("timezone")
      .setDescription("Set or update the server reporting timezone (Admin/Manager only)")
      .addStringOption((opt) =>
        opt
          .setName("zone")
          .setDescription("Type city, country, offset or IANA zone (e.g. Dhaka, London, UTC+6, New York)")
          .setRequired(true)
          .setAutocomplete(true)
      )
  );

export async function handleConfigCommand(
  interaction: ChatInputCommandInteraction,
  settingsRepo: GuildSettingsRepository,
  ratesRepo?: ContractorRatesRepository
): Promise<void> {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ content: '❌ This command can only be used in a server.', flags: MessageFlags.Ephemeral });
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

  if (subcommand === "timezone") {
    if (!isAdmin && !isManager) {
      await interaction.reply({
        content: "⛔ Only Server Administrators and Management role members can update the server timezone.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const rawZone = interaction.options.getString("zone", true).trim();
    const validatedZone = normalizeTimezone(rawZone);
    if (!validatedZone) {
      await interaction.reply({
        content: `❌ Invalid timezone: \`${rawZone}\`.\nPlease provide a valid IANA timezone (e.g. \`Asia/Dhaka\`, \`America/New_York\`, \`Europe/London\`) or offset (e.g. \`UTC+6\`, \`UTC-5\`, \`+6\`).`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const tzLabel = getTimezoneLabel(validatedZone);
    await settingsRepo.updateSettings(guild.id, { timezone: validatedZone });
    await interaction.reply({
      content: `✅ Server reporting timezone updated to **\`${validatedZone}\`** (\`${tzLabel}\`)!\nAll PDF, Excel, CSV, and embed reports will now display timestamps dynamically in this timezone.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (subcommand === 'view') {
    if (!isAdmin && !isManager) {
      await interaction.reply({
        content: '⛔ Only Server Administrators and Management role members can view PurrTrack configuration.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const rolesList = settings.adminRoleIds && settings.adminRoleIds.length > 0
      ? settings.adminRoleIds.map((rId) => `<@&${rId}>`).join(', ')
      : '*None configured (Server Owner & Discord Administrators only)*';

    const ignoredList = settings.ignoredChannelIds && settings.ignoredChannelIds.length > 0
      ? settings.ignoredChannelIds.map((cId) => `<#${cId}>`).join(', ')
      : '*None (All voice channels tracked)*';

    let ratesField = '*Available*';
    if (ratesRepo) {
      const allRates = await ratesRepo.listGuildRates(guild.id).catch(() => []);
      ratesField = allRates.length > 0 ? `✅ ${allRates.length} member(s) configured` : '*None configured*';
    }

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
        {
          name: 'Inactivity Sleep Guard',
          value: settings.maxInactiveMinutes > 0 ? `✅ ${settings.maxInactiveMinutes}m (Auto-AFK/Disconnect)` : '❌ Disabled',
          inline: true,
        },
        { name: 'Server Timezone', value: `\`${settings.timezone}\``, inline: true },
        {
          name: 'Announcement Channel',
          value: settings.announceChannelId ? `<#${settings.announceChannelId}>` : 'None',
          inline: true,
        },
        {
          name: '💼 Contractor Rates',
          value: ratesField,
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

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    return;
  }

  // Rate View: Member can view their own rate; Admins/Managers can view anyone's
  if (subcommand === 'rate_view') {
    if (!ratesRepo) {
      await interaction.reply({ content: '❌ Contractor rates service is currently unavailable.', flags: MessageFlags.Ephemeral });
      return;
    }

    const targetUser = interaction.options.getUser('target') || interaction.user;

    if (targetUser.id !== interaction.user.id && !isAdmin && !isManager) {
      await interaction.reply({
        content: "⛔ You can only view your own configured billing rate. Inspecting other members' rates requires Admin permissions.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const rate = await ratesRepo.getRate(guild.id, targetUser.id);
    if (!rate) {
      const msg = targetUser.id === interaction.user.id
        ? 'ℹ️ You do not have a configured contractor billing rate.'
        : `ℹ️ <@${targetUser.id}> does not have a configured contractor billing rate.`;
      await interaction.reply({ content: msg, flags: MessageFlags.Ephemeral });
      return;
    }

    const rateAmount = (rate.hourlyRateCents / 100).toFixed(2);
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(`💼 Contractor Billing Rate: ${targetUser.username}`)
      .setDescription(
        `• **Member**: <@${targetUser.id}>\n` +
        `• **Hourly Rate**: **${rateAmount} ${rate.currency} / hr**\n` +
        `• **Last Updated**: <t:${Math.floor(new Date(rate.updatedAt).getTime() / 1000)}:R>\n` +
        `• **Set By**: <@${rate.setByUserId}>`
      )
      .setFooter({ text: 'PurrTrack • Enterprise Payroll' })
      .setTimestamp();

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    return;
  }

  // Rate Set: Admin / Manager only
  if (subcommand === 'rate_set') {
    if (!isAdmin && !isManager) {
      await interaction.reply({
        content: '⛔ Only Server Administrators and Management role members can set contractor rates.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (!ratesRepo) {
      await interaction.reply({ content: '❌ Contractor rates service is currently unavailable.', flags: MessageFlags.Ephemeral });
      return;
    }

    const targetUser = interaction.options.getUser('target', true);
    const rate = interaction.options.getNumber('rate', true);
    const currency = (interaction.options.getString('currency') || 'BDT').toUpperCase().trim();

    const hourlyRateCents = Math.round(rate * 100);
    await ratesRepo.setRate(guild.id, targetUser.id, hourlyRateCents, currency, interaction.user.id);

    await interaction.reply({
      content: `✅ Successfully configured billing rate for <@${targetUser.id}>: **${rate.toFixed(2)} ${currency} / hr**.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Rate Remove: Admin / Manager only
  if (subcommand === 'rate_remove') {
    if (!isAdmin && !isManager) {
      await interaction.reply({
        content: '⛔ Only Server Administrators and Management role members can remove contractor rates.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (!ratesRepo) {
      await interaction.reply({ content: '❌ Contractor rates service is currently unavailable.', flags: MessageFlags.Ephemeral });
      return;
    }

    const targetUser = interaction.options.getUser('target', true);
    const removed = await ratesRepo.removeRate(guild.id, targetUser.id);

    if (removed) {
      await interaction.reply({
        content: `✅ Removed contractor billing rate for <@${targetUser.id}>.`,
        flags: MessageFlags.Ephemeral,
      });
    } else {
      await interaction.reply({
        content: `ℹ️ <@${targetUser.id}> does not have a configured billing rate.`,
        flags: MessageFlags.Ephemeral,
      });
    }
    return;
  }

  // Modifying settings requires Server Owner or Discord Administrator / Manage Server
  if (!isAdmin) {
    await interaction.reply({
      content: '⛔ Only Server Administrators and the Server Owner can modify PurrTrack settings or assign management roles.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (subcommand === 'channel_ignore') {
    const channel = interaction.options.getChannel('channel', true);
    await settingsRepo.addIgnoredChannel(guild.id, channel.id);

    await interaction.reply({
      content: `✅ Voice channel <#${channel.id}> is now **ignored**. Voice time spent in this channel will not be tracked.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (subcommand === 'channel_unignore') {
    const rawChannel = interaction.options.getString('channel', true).trim();
    const channelId = rawChannel.replace(/[<#>]/g, '');

    if (channelId === 'none') {
      await interaction.reply({
        content: '⚠️ There are no voice channels currently ignored in this server.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const currentSettings = await settingsRepo.getSettings(guild.id);
    const existingChannels = currentSettings.ignoredChannelIds || [];

    if (!existingChannels.includes(channelId)) {
      await interaction.reply({
        content: '⚠️ That channel is not currently on the ignored list.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await settingsRepo.removeIgnoredChannel(guild.id, channelId);

    await interaction.reply({
      content: `✅ Voice channel <#${channelId}> is no longer ignored. Voice time will now be tracked.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (subcommand === 'role_add') {
    const role = interaction.options.getRole('role', true);
    await settingsRepo.addAdminRole(guild.id, role.id);

    await interaction.reply({
      content: `✅ Successfully added <@&${role.id}> as a **Management Role**!\nMembers with this role can now:\n• View live tracking for any team member (\`/status target:@user\`)\n• Export individual timesheets (\`/report user target:@user\`)\n• Export server-wide reports (\`/report guild\`)`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (subcommand === 'role_remove') {
    const rawRole = interaction.options.getString('role', true).trim();
    const roleId = rawRole.replace(/[<@&>]/g, '');

    if (roleId === 'none') {
      await interaction.reply({
        content: '⚠️ There are no Management roles currently configured in this server.',
        flags: MessageFlags.Ephemeral,
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
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await settingsRepo.removeAdminRole(guild.id, targetRoleId);

    await interaction.reply({
      content: `✅ Successfully removed Management permissions from <@&${targetRoleId}>.`,
      flags: MessageFlags.Ephemeral,
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
    const maxInactive = interaction.options.getInteger('max_inactive_minutes');
    const announceChannel = interaction.options.getChannel('announce_channel');

    const updates: Record<string, any> = {};
    if (enabled !== null) updates.trackingEnabled = enabled;
    if (excludeAfk !== null) updates.excludeAfk = excludeAfk;
    if (trackMuted !== null) updates.trackMuted = trackMuted;
    if (trackDeafened !== null) updates.trackDeafened = trackDeafened;
    if (trackStreaming !== null) updates.trackStreaming = trackStreaming;
    if (trackCamera !== null) updates.trackCamera = trackCamera;
    if (maxInactive !== null) updates.maxInactiveMinutes = maxInactive;
    if (announceChannel !== null) updates.announceChannelId = announceChannel.id;

    if (Object.keys(updates).length === 0) {
      await interaction.reply({ content: '⚠️ No settings were provided to update.', flags: MessageFlags.Ephemeral });
      return;
    }

    await settingsRepo.updateSettings(guild.id, updates);

    await interaction.reply({
      content: `✅ Successfully updated PurrTrack settings for **${guild.name}**!`,
      flags: MessageFlags.Ephemeral,
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

  if (subcommand === "timezone") {
    const focused = interaction.options.getFocused(true);
    if (focused.name !== "zone") {
      await interaction.respond([]);
      return;
    }

    try {
      const currentSettings = await settingsRepo.getSettings(guild.id);
      const choices = searchTimezones(focused.value, 25, currentSettings?.timezone);
      await interaction.respond(choices);
      return;
    } catch (error) {
      logger.error("[config:autocomplete] Error generating timezone choices:", error);
      await interaction.respond([]).catch(() => {});
      return;
    }
  }

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
