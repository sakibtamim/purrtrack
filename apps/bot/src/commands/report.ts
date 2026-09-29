import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  PermissionFlagsBits,
} from 'discord.js';
import { VoiceSessionRepository, GuildSettingsRepository } from '@purrtrack/db';
import { ExportFormat, TimeRangePreset, resolveTimeRange } from '@purrtrack/shared';
import { exportReport } from '../exporters/index.js';

export const reportCommand = new SlashCommandBuilder()
  .setName('report')
  .setDescription('📊 Pull voice time tracking reports in any format (CSV, Excel, PDF, JSON, Embed)')
  .addSubcommand((sub) =>
    sub
      .setName('user')
      .setDescription('Generate time report for a specific member')
      .addUserOption((opt) => opt.setName('target').setDescription('Target member').setRequired(true))
      .addStringOption((opt) =>
        opt
          .setName('format')
          .setDescription('Export format')
          .setRequired(false)
          .addChoices(
            { name: '📄 Discord Embed (Preview in Chat)', value: ExportFormat.EMBED },
            { name: '📊 Excel Spreadsheet (.xlsx with KPI summary)', value: ExportFormat.EXCEL },
            { name: '📑 PDF Timesheet (Invoice/Report style)', value: ExportFormat.PDF },
            { name: '📝 CSV File (Raw spreadsheet data)', value: ExportFormat.CSV },
            { name: '📦 JSON (Raw structured data)', value: ExportFormat.JSON }
          )
      )
      .addStringOption((opt) =>
        opt
          .setName('range')
          .setDescription('Date range preset')
          .setRequired(false)
          .addChoices(
            { name: 'Today', value: TimeRangePreset.TODAY },
            { name: 'Yesterday', value: TimeRangePreset.YESTERDAY },
            { name: 'This Week (Monday - Now)', value: TimeRangePreset.THIS_WEEK },
            { name: 'Last Week', value: TimeRangePreset.LAST_WEEK },
            { name: 'This Month', value: TimeRangePreset.THIS_MONTH },
            { name: 'Last Month', value: TimeRangePreset.LAST_MONTH },
            { name: 'All Time', value: TimeRangePreset.ALL_TIME }
          )
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('guild')
      .setDescription('Generate time report for the entire server')
      .addStringOption((opt) =>
        opt
          .setName('format')
          .setDescription('Export format')
          .setRequired(false)
          .addChoices(
            { name: '📄 Discord Embed (Preview in Chat)', value: ExportFormat.EMBED },
            { name: '📊 Excel Spreadsheet (.xlsx with KPI summary)', value: ExportFormat.EXCEL },
            { name: '📑 PDF Timesheet (Invoice/Report style)', value: ExportFormat.PDF },
            { name: '📝 CSV File (Raw spreadsheet data)', value: ExportFormat.CSV },
            { name: '📦 JSON (Raw structured data)', value: ExportFormat.JSON }
          )
      )
      .addStringOption((opt) =>
        opt
          .setName('range')
          .setDescription('Date range preset')
          .setRequired(false)
          .addChoices(
            { name: 'Today', value: TimeRangePreset.TODAY },
            { name: 'Yesterday', value: TimeRangePreset.YESTERDAY },
            { name: 'This Week', value: TimeRangePreset.THIS_WEEK },
            { name: 'Last Week', value: TimeRangePreset.LAST_WEEK },
            { name: 'This Month', value: TimeRangePreset.THIS_MONTH },
            { name: 'Last Month', value: TimeRangePreset.LAST_MONTH },
            { name: 'All Time', value: TimeRangePreset.ALL_TIME }
          )
      )
  );

export async function handleReportCommand(
  interaction: ChatInputCommandInteraction,
  sessionRepo: VoiceSessionRepository,
  settingsRepo: GuildSettingsRepository
): Promise<void> {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ content: '❌ This command can only be used in a server.', ephemeral: true });
    return;
  }

  // Check Admin / Manager authorization
  const member = await guild.members.fetch(interaction.user.id);
  const settings = await settingsRepo.getSettings(guild.id);
  const isAdmin =
    member.permissions.has(PermissionFlagsBits.Administrator) ||
    member.permissions.has(PermissionFlagsBits.ManageGuild) ||
    (settings.adminRoleIds && member.roles.cache.some((r) => settings.adminRoleIds?.includes(r.id)));

  const subcommand = interaction.options.getSubcommand();
  const format = (interaction.options.getString('format') as ExportFormat) || ExportFormat.EMBED;
  const preset = (interaction.options.getString('range') as TimeRangePreset) || TimeRangePreset.THIS_WEEK;

  const targetUser = subcommand === 'user' ? interaction.options.getUser('target') : undefined;

  // Regular members can only view their own user report; Guild-wide reports require Admin/Manager
  if (subcommand === 'guild' && !isAdmin) {
    await interaction.reply({
      content: '⛔ Server-wide reports are restricted to administrators and managers.',
      ephemeral: true,
    });
    return;
  }

  if (targetUser && targetUser.id !== interaction.user.id && !isAdmin) {
    await interaction.reply({
      content: "⛔ You cannot view other members' time reports without admin permissions.",
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: format === ExportFormat.EMBED ? false : true });

  try {
    // Self-Healing: Ensure all members currently in voice channels have active sessions
    if (settings.trackingEnabled) {
      for (const voiceState of guild.voiceStates.cache.values()) {
        if (!voiceState.channelId) continue;
        const isAfk = settings.excludeAfk && guild.afkChannelId && voiceState.channelId === guild.afkChannelId;
        const isIgnored = settings.ignoredChannelIds && settings.ignoredChannelIds.includes(voiceState.channelId);
        if (isAfk || isIgnored) continue;

        const userSession = await sessionRepo.getActiveSession(guild.id, voiceState.id);
        if (!userSession) {
          let channel = voiceState.channel;
          if (!channel && guild.channels?.fetch) {
            channel = (await guild.channels.fetch(voiceState.channelId).catch(() => null)) as any;
          }
          const channelName = channel?.name ?? `voice-${voiceState.channelId}`;
          await sessionRepo.upsertChannel(voiceState.channelId, guild.id, channelName, false);
          await sessionRepo.startSession({
            guildId: guild.id,
            userId: voiceState.id,
            channelId: voiceState.channelId,
            channelName,
            wasMuted: voiceState.selfMute || voiceState.serverMute || false,
            wasDeafened: voiceState.selfDeaf || voiceState.serverDeaf || false,
            wasStreaming: voiceState.streaming || false,
          });
        }
      }
    }

    const { startDate, endDate } = resolveTimeRange(preset);

    const reportData = await sessionRepo.getAggregatedReport({
      guildId: guild.id,
      guildName: guild.name,
      userId: targetUser?.id,
      startDate,
      endDate,
      preset,
    });

    const exportResult = await exportReport(reportData, format);

    if (exportResult.embed) {
      await interaction.editReply({ embeds: [exportResult.embed] });
      return;
    }

    if (exportResult.attachment) {
      await interaction.editReply({
        content: `✅ Generated **${format.toUpperCase()}** report for **${reportData.guildName}** (${reportData.totalDurationFormatted} tracked across ${reportData.totalSessions} sessions):`,
        files: [exportResult.attachment],
      });
      return;
    }

    await interaction.editReply({ content: '❌ Failed to generate report in the requested format.' });
  } catch (err) {
    console.error('Error generating report:', err);
    await interaction.editReply({
      content: `❌ An error occurred while generating the report: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}
