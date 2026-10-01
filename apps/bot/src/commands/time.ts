import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
} from 'discord.js';
import { GuildSettingsRepository, TimeAdjustmentsRepository } from '@purrtrack/db';
import { formatDuration } from '@purrtrack/shared';

export const timeCommand = new SlashCommandBuilder()
  .setName('time')
  .setDescription('⏱️ Manual voice time adjustments with audit trail (Admin/Manager only)')
  .addSubcommand((sub) =>
    sub
      .setName('add')
      .setDescription('Credit voice time to a member (Admin/Manager only)')
      .addUserOption((opt) => opt.setName('target').setDescription('Member to credit time to').setRequired(true))
      .addStringOption((opt) =>
        opt
          .setName('duration')
          .setDescription('Duration to add (e.g. 1h 30m, 45m, 2h)')
          .setRequired(true)
      )
      .addStringOption((opt) =>
        opt
          .setName('reason')
          .setDescription('Mandatory business reason for adjustment')
          .setMinLength(3)
          .setMaxLength(255)
          .setRequired(true)
      )
      .addStringOption((opt) =>
        opt
          .setName('date')
          .setDescription('Adjustment date (YYYY-MM-DD, "yesterday", or "today", defaults to today)')
          .setRequired(false)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('subtract')
      .setDescription('Deduct voice time from a member (Admin/Manager only)')
      .addUserOption((opt) => opt.setName('target').setDescription('Member to deduct time from').setRequired(true))
      .addStringOption((opt) =>
        opt
          .setName('duration')
          .setDescription('Duration to deduct (e.g. 1h 30m, 45m, 2h)')
          .setRequired(true)
      )
      .addStringOption((opt) =>
        opt
          .setName('reason')
          .setDescription('Mandatory reason for adjustment')
          .setMinLength(3)
          .setMaxLength(255)
          .setRequired(true)
      )
      .addStringOption((opt) =>
        opt
          .setName('date')
          .setDescription('Adjustment date (YYYY-MM-DD, "yesterday", or "today", defaults to today)')
          .setRequired(false)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('history')
      .setDescription('View audit trail of manual adjustments made to a member (Admin/Manager only)')
      .addUserOption((opt) => opt.setName('target').setDescription('Member to inspect audit trail for').setRequired(true))
      .addIntegerOption((opt) =>
        opt
          .setName('limit')
          .setDescription('Number of records to show (default: 10, max: 25)')
          .setMinValue(1)
          .setMaxValue(25)
          .setRequired(false)
      )
  );

/**
 * Parses user input strings into total seconds.
 * Supports combinations like "1h 30m", "45m", "2h", "90m", "3600s", "1.5h".
 */
export function parseDurationToSeconds(input: string): number | null {
  const cleaned = input.toLowerCase().trim();
  if (!cleaned) return null;

  // Single numeric fallback treated as minutes if no units
  if (/^\d+$/.test(cleaned)) {
    return parseInt(cleaned, 10) * 60;
  }

  let totalSeconds = 0;
  let matched = false;

  const hoursMatch = cleaned.match(/(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hours?)/);
  if (hoursMatch) {
    totalSeconds += Math.round(parseFloat(hoursMatch[1]) * 3600);
    matched = true;
  }

  const minsMatch = cleaned.match(/(\d+(?:\.\d+)?)\s*(?:m|min|mins|minutes?)/);
  if (minsMatch) {
    totalSeconds += Math.round(parseFloat(minsMatch[1]) * 60);
    matched = true;
  }

  const secsMatch = cleaned.match(/(\d+)\s*(?:s|sec|secs|seconds?)/);
  if (secsMatch) {
    totalSeconds += parseInt(secsMatch[1], 10);
    matched = true;
  }

  return matched && totalSeconds > 0 ? totalSeconds : null;
}

/**
 * Parses optional date string into a Date object.
 * Supports "today", "yesterday", or "YYYY-MM-DD".
 */
export function parseAdjustmentDate(input?: string | null): Date | null | 'INVALID' {
  if (!input || !input.trim()) return null;
  const cleaned = input.trim().toLowerCase();

  if (cleaned === 'today') {
    return new Date();
  }

  if (cleaned === 'yesterday') {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 1);
    d.setUTCHours(12, 0, 0, 0); // Midday UTC
    return d;
  }

  const isoMatch = cleaned.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10);
    const month = parseInt(isoMatch[2], 10) - 1;
    const day = parseInt(isoMatch[3], 10);
    const d = new Date(Date.UTC(year, month, day, 12, 0, 0));
    if (!isNaN(d.getTime()) && d.getUTCFullYear() === year && d.getUTCMonth() === month && d.getUTCDate() === day) {
      return d;
    }
  }

  return 'INVALID';
}

export async function handleTimeCommand(
  interaction: ChatInputCommandInteraction,
  timeRepo: TimeAdjustmentsRepository,
  settingsRepo: GuildSettingsRepository
): Promise<void> {
  const { guild, user } = interaction;
  if (!guild) {
    await interaction.reply({ content: '❌ This command can only be used in a server.', ephemeral: true });
    return;
  }

  // Permission check: STRICTLY Admin or Management role only
  const member = await guild.members.fetch(user.id);
  const settings = await settingsRepo.getSettings(guild.id);
  const isAdmin =
    guild.ownerId === user.id ||
    member.permissions.has(PermissionFlagsBits.Administrator) ||
    member.permissions.has(PermissionFlagsBits.ManageGuild) ||
    (settings.adminRoleIds && settings.adminRoleIds.some((rId) => member.roles.cache.has(rId)));

  if (!isAdmin) {
    await interaction.reply({
      content: '⛔ Only Server Administrators and Management role members can execute manual time adjustments or view audit trails.',
      ephemeral: true,
    });
    return;
  }

  const subcommand = interaction.options.getSubcommand();
  const targetUser = interaction.options.getUser('target', true);

  if (subcommand === 'add' || subcommand === 'subtract') {
    const rawDuration = interaction.options.getString('duration', true);
    const reason = interaction.options.getString('reason', true).trim();
    const rawDate = interaction.options.getString('date');

    const durationSeconds = parseDurationToSeconds(rawDuration);
    if (!durationSeconds) {
      await interaction.reply({
        content: `❌ Invalid duration format: \`${rawDuration}\`. Please use formats like \`1h 30m\`, \`45m\`, or \`2h\`.`,
        ephemeral: true,
      });
      return;
    }

    const parsedDate = parseAdjustmentDate(rawDate);
    if (parsedDate === 'INVALID') {
      await interaction.reply({
        content: `❌ Invalid date format: \`${rawDate}\`. Please use \`YYYY-MM-DD\` (e.g. \`2026-10-01\`), \`yesterday\`, or \`today\`.`,
        ephemeral: true,
      });
      return;
    }

    const type = subcommand === 'add' ? 'ADD' : 'SUBTRACT';
    const adjustment = await timeRepo.createAdjustment({
      guildId: guild.id,
      userId: targetUser.id,
      adjustedByUserId: user.id,
      type,
      durationSeconds,
      reason,
      createdAt: parsedDate || undefined,
    });

    const actionText = type === 'ADD' ? 'Credited' : 'Deducted';
    const signText = type === 'ADD' ? '➕' : '➖';
    const durationFormatted = formatDuration(durationSeconds);
    const targetDateUnix = Math.floor(new Date(adjustment.createdAt).getTime() / 1000);

    const embed = new EmbedBuilder()
      .setColor(type === 'ADD' ? 0x57F287 : 0xED4245)
      .setTitle(`⏱️ Manual Time Adjustment: ${actionText}`)
      .setDescription(
        `Successfully recorded manual adjustment for <@${targetUser.id}>.\n\n` +
        `• **Adjustment**: **${signText} ${durationFormatted}** (\`${durationSeconds}s\`)\n` +
        `• **Effective Date**: <t:${targetDateUnix}:D> (<t:${targetDateUnix}:R>)\n` +
        `• **Reason**: "${reason}"\n` +
        `• **Approved By**: <@${user.id}>\n` +
        `• **Audit ID**: \`${adjustment.id}\``
      )
      .setFooter({ text: 'PurrTrack • Enterprise Audit Trail' })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
    return;
  }

  if (subcommand === 'history') {
    const limit = interaction.options.getInteger('limit') || 10;
    const adjustments = await timeRepo.getUserAdjustments(guild.id, targetUser.id);
    const netSeconds = await timeRepo.getNetAdjustmentSeconds(guild.id, targetUser.id);

    if (adjustments.length === 0) {
      await interaction.reply({
        content: `ℹ️ No manual adjustments found in audit history for <@${targetUser.id}>.`,
        ephemeral: true,
      });
      return;
    }

    const netSign = netSeconds >= 0 ? '+' : '-';
    const netFormatted = `${netSign}${formatDuration(Math.abs(netSeconds))}`;

    const slice = adjustments.slice(0, limit);
    const lines = slice.map((adj) => {
      const sign = adj.type === 'ADD' ? '➕' : '➖';
      const dur = formatDuration(adj.durationSeconds);
      const time = `<t:${Math.floor(new Date(adj.createdAt).getTime() / 1000)}:R>`;
      return `${sign} **${dur}** • ${time} by <@${adj.adjustedByUserId}>\n↳ *"${adj.reason}"*`;
    });

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle(`📋 Manual Time Adjustments: ${targetUser.username}`)
      .setDescription(
        `Showing **${slice.length}** of **${adjustments.length}** total record(s) for <@${targetUser.id}>.\n` +
        `• **Net Cumulative Adjustment**: **\`${netFormatted}\`**\n\n` +
        lines.join('\n\n')
      )
      .setFooter({ text: 'PurrTrack • Enterprise Audit Trail' })
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }
}
