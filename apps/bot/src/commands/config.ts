import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ChannelType,
} from 'discord.js';
import { GuildSettingsRepository } from '@purrtrack/db';

export const configCommand = new SlashCommandBuilder()
  .setName('config')
  .setDescription('⚙️ Manage PurrTrack server configuration & management roles (Admin only)')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand((sub) => sub.setName('view').setDescription('View current server tracking settings & manager roles'))
  .addSubcommand((sub) =>
    sub
      .setName('set')
      .setDescription('Update server tracking settings')
      .addBooleanOption((opt) => opt.setName('enabled').setDescription('Enable/disable voice tracking'))
      .addBooleanOption((opt) => opt.setName('exclude_afk').setDescription('Ignore time spent in the AFK channel'))
      .addBooleanOption((opt) => opt.setName('track_muted').setDescription('Track time when user is muted'))
      .addBooleanOption((opt) => opt.setName('track_deafened').setDescription('Track time when user is deafened'))
      .addChannelOption((opt) =>
        opt
          .setName('announce_channel')
          .setDescription('Channel for online/offline bot announcements')
          .addChannelTypes(ChannelType.GuildText)
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
      .addRoleOption((opt) => opt.setName('role').setDescription('Role to revoke Management permissions from').setRequired(true))
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

  // Permission verification: Server Owner or Administrator permission required to change bot config
  const member = await guild.members.fetch(interaction.user.id);
  const isOwner = guild.ownerId === interaction.user.id;
  const isAdmin =
    isOwner ||
    member.permissions.has(PermissionFlagsBits.Administrator) ||
    member.permissions.has(PermissionFlagsBits.ManageGuild);

  if (!isAdmin) {
    await interaction.reply({
      content: '⛔ Only Server Administrators and the Server Owner can configure PurrTrack settings.',
      ephemeral: true,
    });
    return;
  }

  const subcommand = interaction.options.getSubcommand();

  if (subcommand === 'view') {
    const settings = await settingsRepo.getSettings(guild.id);
    const rolesList = settings.adminRoleIds && settings.adminRoleIds.length > 0
      ? settings.adminRoleIds.map((rId) => `<@&${rId}>`).join(', ')
      : '*None configured (Server Owner & Discord Administrators only)*';

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(`⚙️ PurrTrack Settings: ${guild.name}`)
      .addFields(
        { name: 'Tracking Enabled', value: settings.trackingEnabled ? '✅ Yes' : '❌ No', inline: true },
        { name: 'Exclude AFK Channel', value: settings.excludeAfk ? '✅ Yes' : '❌ No', inline: true },
        { name: 'Track While Muted', value: settings.trackMuted ? '✅ Yes' : '❌ No', inline: true },
        { name: 'Track While Deafened', value: settings.trackDeafened ? '✅ Yes' : '❌ No', inline: true },
        { name: 'Server Timezone', value: `\`${settings.timezone}\``, inline: true },
        {
          name: 'Announcement Channel',
          value: settings.announceChannelId ? `<#${settings.announceChannelId}>` : 'None',
          inline: true,
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
    const role = interaction.options.getRole('role', true);
    await settingsRepo.removeAdminRole(guild.id, role.id);

    await interaction.reply({
      content: `✅ Successfully removed Management permissions from <@&${role.id}>.`,
      ephemeral: true,
    });
    return;
  }

  if (subcommand === 'set') {
    const enabled = interaction.options.getBoolean('enabled');
    const excludeAfk = interaction.options.getBoolean('exclude_afk');
    const trackMuted = interaction.options.getBoolean('track_muted');
    const trackDeafened = interaction.options.getBoolean('track_deafened');
    const announceChannel = interaction.options.getChannel('announce_channel');

    const updates: Record<string, any> = {};
    if (enabled !== null) updates.trackingEnabled = enabled;
    if (excludeAfk !== null) updates.excludeAfk = excludeAfk;
    if (trackMuted !== null) updates.trackMuted = trackMuted;
    if (trackDeafened !== null) updates.trackDeafened = trackDeafened;
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
  }
}
