import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  MessageFlags,
  AttachmentBuilder,
  EmbedBuilder,
} from 'discord.js';
import { VoiceSessionRepository, GuildSettingsRepository, ContractorRatesRepository, TimeAdjustmentsRepository } from '@purrtrack/db';
import { ExportFormat, TimeRangePreset, resolveTimeRange, formatDuration, zonedDateToUtc, getZonedDateParts, formatDateIsoInTz } from '@purrtrack/shared';
import {
  exportReport,
  generatePayrollExcelReport,
  ConsolidatedPayrollReportData,
  ContractorPayrollItem,
} from '../exporters/index.js';
import { hasManagementPermission, getManagementDenialMessage } from '../utils/permissions.js';



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
          .setDescription('Date range preset (ignored if start_date is set)')
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
      .addStringOption((opt) =>
        opt
          .setName('start_date')
          .setDescription('Custom start date (YYYY-MM-DD, or YYYY-MM for whole month, e.g. 2026-09)')
          .setRequired(false)
      )
      .addStringOption((opt) =>
        opt
          .setName('end_date')
          .setDescription('Custom end date (YYYY-MM-DD, optional if start_date is a month)')
          .setRequired(false)
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
          .setDescription('Date range preset (ignored if start_date is set)')
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
      .addStringOption((opt) =>
        opt
          .setName('start_date')
          .setDescription('Custom start date (YYYY-MM-DD, or YYYY-MM for whole month, e.g. 2026-09)')
          .setRequired(false)
      )
      .addStringOption((opt) =>
        opt
          .setName('end_date')
          .setDescription('Custom end date (YYYY-MM-DD, optional if start_date is a month)')
          .setRequired(false)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('payroll')
      .setDescription('💼 Generate consolidated contractor payroll report across all billed members')
      .addStringOption((opt) =>
        opt
          .setName('format')
          .setDescription('Export format')
          .setRequired(false)
          .addChoices(
            { name: '📊 Excel Spreadsheet (.xlsx Master Payroll Ledger)', value: ExportFormat.EXCEL },
            { name: '📄 Discord Embed (Preview in Chat)', value: ExportFormat.EMBED },
            { name: '📝 CSV File (Raw spreadsheet data)', value: ExportFormat.CSV }
          )
      )
      .addStringOption((opt) =>
        opt
          .setName('range')
          .setDescription('Date range preset (ignored if start_date is set)')
          .setRequired(false)
          .addChoices(
            { name: 'This Month', value: TimeRangePreset.THIS_MONTH },
            { name: 'Last Month', value: TimeRangePreset.LAST_MONTH },
            { name: 'This Week', value: TimeRangePreset.THIS_WEEK },
            { name: 'Last Week', value: TimeRangePreset.LAST_WEEK },
            { name: 'Today', value: TimeRangePreset.TODAY },
            { name: 'Yesterday', value: TimeRangePreset.YESTERDAY },
            { name: 'All Time', value: TimeRangePreset.ALL_TIME }
          )
      )
      .addStringOption((opt) =>
        opt
          .setName('start_date')
          .setDescription('Custom start date (YYYY-MM-DD, or YYYY-MM for whole month, e.g. 2026-09)')
          .setRequired(false)
      )
      .addStringOption((opt) =>
        opt
          .setName('end_date')
          .setDescription('Custom end date (YYYY-MM-DD, optional if start_date is a month)')
          .setRequired(false)
      )
  );

/**
 * Parses user-provided start/end dates into absolute UTC Date bounds.
 * Supports:
 * - YYYY-MM (e.g. "2026-09" -> entire month)
 * - YYYY-MM-DD (e.g. "2026-09-15")
 * - "yesterday", "today"
 */
export function parseCustomDateRange(
  startStr?: string | null,
  endStr?: string | null,
  timezone: string = 'UTC'
): { startDate: Date; endDate: Date; label: string } | null | 'INVALID' {
  if (!startStr || !startStr.trim()) {
    if (endStr && endStr.trim()) return 'INVALID';
    return null;
  }

  const tz = timezone || 'UTC';
  const cleanedStart = startStr.trim().toLowerCase();
  const cleanedEnd = endStr ? endStr.trim().toLowerCase() : null;

  if (cleanedStart === 'today') {
    const resolved = resolveTimeRange(TimeRangePreset.TODAY, undefined, undefined, 'monday', tz);
    return { startDate: resolved.startDate, endDate: new Date(), label: 'Today (Custom)' };
  }

  if (cleanedStart === 'yesterday') {
    const resolved = resolveTimeRange(TimeRangePreset.YESTERDAY, undefined, undefined, 'monday', tz);
    return { startDate: resolved.startDate, endDate: resolved.endDate, label: 'Yesterday (Custom)' };
  }

  // Month format: YYYY-MM
  const monthMatch = cleanedStart.match(/^(\d{4})-(\d{2})$/);
  if (monthMatch && !cleanedEnd) {
    const year = parseInt(monthMatch[1], 10);
    const month = parseInt(monthMatch[2], 10) - 1;
    if (month < 0 || month > 11) return 'INVALID';

    const startDate = zonedDateToUtc(year, month, 1, 0, 0, 0, 0, tz);
    const endDate = zonedDateToUtc(year, month + 1, 0, 23, 59, 59, 999, tz);
    const monthName = startDate.toLocaleString('en-US', { month: 'long', timeZone: tz });
    return { startDate, endDate, label: `${monthName} ${year}` };
  }

  // Date format: YYYY-MM-DD
  const dateMatch = cleanedStart.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!dateMatch) return 'INVALID';

  const sYear = parseInt(dateMatch[1], 10);
  const sMonth = parseInt(dateMatch[2], 10) - 1;
  const sDay = parseInt(dateMatch[3], 10);
  const startDate = zonedDateToUtc(sYear, sMonth, sDay, 0, 0, 0, 0, tz);

  const startParts = getZonedDateParts(startDate, tz);
  if (startParts.year !== sYear || startParts.month !== sMonth || startParts.day !== sDay) {
    return 'INVALID';
  }

  let endDate: Date;
  let label: string;

  if (cleanedEnd) {
    const endMonthMatch = cleanedEnd.match(/^(\d{4})-(\d{2})$/);
    const endDateMatch = cleanedEnd.match(/^(\d{4})-(\d{2})-(\d{2})$/);

    if (endMonthMatch) {
      const eYear = parseInt(endMonthMatch[1], 10);
      const eMonth = parseInt(endMonthMatch[2], 10) - 1;
      if (eMonth < 0 || eMonth > 11) return 'INVALID';
      endDate = zonedDateToUtc(eYear, eMonth + 1, 0, 23, 59, 59, 999, tz);
    } else if (endDateMatch) {
      const eYear = parseInt(endDateMatch[1], 10);
      const eMonth = parseInt(endDateMatch[2], 10) - 1;
      const eDay = parseInt(endDateMatch[3], 10);
      endDate = zonedDateToUtc(eYear, eMonth, eDay, 23, 59, 59, 999, tz);
      const endParts = getZonedDateParts(endDate, tz);
      if (endParts.year !== eYear || endParts.month !== eMonth || endParts.day !== eDay) {
        return 'INVALID';
      }
    } else {
      return 'INVALID';
    }

    label = `${cleanedStart} to ${cleanedEnd}`;
  } else {
    // Single day
    endDate = zonedDateToUtc(sYear, sMonth, sDay, 23, 59, 59, 999, tz);
    label = cleanedStart;
  }

  if (startDate.getTime() > endDate.getTime()) {
    return 'INVALID';
  }

  return { startDate, endDate, label };
}

export async function handleReportCommand(
  interaction: ChatInputCommandInteraction,
  sessionRepo: VoiceSessionRepository,
  settingsRepo: GuildSettingsRepository,
  ratesRepo?: ContractorRatesRepository,
  timeRepo?: TimeAdjustmentsRepository
): Promise<void> {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ content: '❌ This command can only be used in a server.', flags: MessageFlags.Ephemeral });
    return;
  }

  // Strict RBAC permission verification
  const member = await guild.members.fetch(interaction.user.id);
  const settings = await settingsRepo.getSettings(guild.id);
  const isManager = hasManagementPermission(member, guild, settings);

  const subcommand = interaction.options.getSubcommand();
  const format = (interaction.options.getString('format') as ExportFormat) || ExportFormat.EMBED;
  const preset = (interaction.options.getString('range') as TimeRangePreset) || TimeRangePreset.THIS_WEEK;
  const customStartStr = interaction.options.getString('start_date');
  const customEndStr = interaction.options.getString('end_date');

  const targetUser = subcommand === 'user' ? interaction.options.getUser('target') : undefined;

  // Regular members can only view their own user report; Guild-wide reports require Management permission
  if (subcommand === 'guild' && !isManager) {
    await interaction.reply({
      content: getManagementDenialMessage(settings),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (subcommand === 'payroll') {
    if (!isManager) {
      await interaction.reply({
        content: getManagementDenialMessage(settings),
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (!ratesRepo) {
      await interaction.reply({
        content: '❌ Contractor billing service is currently unavailable.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const rates = await ratesRepo.listGuildRates(guild.id);
    if (rates.length === 0) {
      await interaction.reply({
        content:
          '⚠️ No contractor billing rates have been configured for this server yet.\nUse `/config set_rate` to set hourly rates for members before generating payroll.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    let pStartDate: Date;
    let pEndDate: Date;
    let pActivePreset = preset;

    if (customStartStr) {
      const parsedRange = parseCustomDateRange(customStartStr, customEndStr, settings.timezone || 'UTC');
      if (!parsedRange || parsedRange === 'INVALID') {
        await interaction.reply({
          content:
            '❌ Invalid date format. Please use `YYYY-MM-DD` (e.g. `2026-09-15`) or `YYYY-MM` (e.g. `2026-09`). Start date must also be before or equal to end date.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      pStartDate = parsedRange.startDate;
      pEndDate = parsedRange.endDate;
      pActivePreset = parsedRange.label as any;
    } else {
      const resolved = resolveTimeRange(preset, undefined, undefined, 'monday', settings.timezone || 'UTC');
      pStartDate = resolved.startDate;
      pEndDate = resolved.endDate;
    }

    if (format === ExportFormat.EMBED) {
      await interaction.deferReply();
    } else {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    }

    try {
      const contractors: ContractorPayrollItem[] = [];

      for (const rate of rates) {
        let contractorMember = guild.members.cache.get(rate.userId);
        if (!contractorMember && guild.members?.fetch) {
          contractorMember = (await guild.members.fetch(rate.userId).catch(() => null)) as any;
        }
        const username = contractorMember?.user?.username ?? `user_${rate.userId.slice(-4)}`;

        const userReport = await sessionRepo.getAggregatedReport({
          guildId: guild.id,
          guildName: guild.name,
          userId: rate.userId,
          startDate: pStartDate,
          endDate: pEndDate,
          preset: pActivePreset,
          timezone: settings.timezone || 'UTC',
        });

        const trackedSeconds = userReport.totalDurationSeconds;
        let netAdjSeconds = 0;
        if (timeRepo) {
          netAdjSeconds = await timeRepo.getNetAdjustmentSeconds(guild.id, rate.userId, pStartDate, pEndDate);
        }

        const billableSeconds = Math.max(0, trackedSeconds + netAdjSeconds);
        const billableHours = billableSeconds / 3600;
        const hourlyRate = rate.hourlyRateCents / 100;
        const payoutAmount = Number((billableHours * hourlyRate).toFixed(2));

        contractors.push({
          userId: rate.userId,
          username,
          hourlyRate,
          currency: rate.currency,
          trackedSeconds,
          trackedFormatted: formatDuration(trackedSeconds),
          adjustmentSeconds: netAdjSeconds,
          adjustmentFormatted: `${netAdjSeconds >= 0 ? '+' : ''}${formatDuration(Math.abs(netAdjSeconds))}`,
          billableHours,
          payoutAmount,
        });
      }

      const payrollData: ConsolidatedPayrollReportData = {
        guildId: guild.id,
        guildName: guild.name,
        periodLabel: pActivePreset,
        timezone: settings.timezone || 'UTC',
        contractors,
        generatedAt: new Date(),
      };

      const totalBillable = contractors.reduce((sum, c) => sum + c.billableHours, 0);
      const totalPayout = contractors.reduce((sum, c) => sum + c.payoutAmount, 0);
      const primaryCurrency = contractors[0]?.currency || 'BDT';
      const timestamp = formatDateIsoInTz(new Date(), settings.timezone || 'UTC');

      if (format === ExportFormat.CSV) {
        const csvHeaders = [
          'Contractor Username',
          'Discord ID',
          'Hourly Rate',
          'Currency',
          'Tracked Time',
          'Manual Adjustments',
          'Billable Hours',
          'Gross Payout',
        ];
        const csvRows = contractors.map((c) => [
          `"${c.username.replace(/"/g, '""')}"`,
          `"${c.userId}"`,
          c.hourlyRate.toFixed(2),
          c.currency,
          `"${c.trackedFormatted}"`,
          `"${c.adjustmentFormatted}"`,
          c.billableHours.toFixed(2),
          c.payoutAmount.toFixed(2),
        ]);
        const csvContent = '\ufeff' + [csvHeaders.join(','), ...csvRows.map((r) => r.join(','))].join('\r\n');
        const buffer = Buffer.from(csvContent, 'utf-8');
        const filename = `purrtrack-payroll-${guild.id}-${timestamp}.csv`;
        const attachment = new AttachmentBuilder(buffer, { name: filename });

        await interaction.editReply({
          content: `✅ Generated consolidated CSV payroll report for **${guild.name}** (${contractors.length} contractors):`,
          files: [attachment],
        });
        return;
      }

      if (format === ExportFormat.EMBED) {
        const embed = new EmbedBuilder()
          .setTitle(`💼 Master Contractor Payroll Ledger • ${guild.name}`)
          .setDescription(
            `Payroll summary for **${pActivePreset}** (${settings.timezone || 'UTC'}).\n` +
            `Total active contractors: **${contractors.length}**`
          )
          .setColor(0x5865f2)
          .setFooter({ text: 'PurrTrack Payroll System' })
          .setTimestamp();

        for (const c of contractors.slice(0, 15)) {
          embed.addFields({
            name: `@${c.username} (${c.hourlyRate.toFixed(2)} ${c.currency}/h)`,
            value: `• Tracked: ${c.trackedFormatted}\n• Adj: ${c.adjustmentFormatted}\n• Billable: **${c.billableHours.toFixed(2)}h** ➔ **${c.payoutAmount.toFixed(2)} ${c.currency}**`,
            inline: true,
          });
        }

        embed.addFields({
          name: '📊 Grand Totals',
          value: `• Total Billable Hours: **${totalBillable.toFixed(2)}h**\n• Total Gross Payout: **${totalPayout.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${primaryCurrency}**`,
          inline: false,
        });

        await interaction.editReply({ embeds: [embed] });
        return;
      }

      // Default: EXCEL
      const excelBuffer = await generatePayrollExcelReport(payrollData);
      const filename = `purrtrack-payroll-${guild.id}-${timestamp}.xlsx`;
      const attachment = new AttachmentBuilder(excelBuffer, { name: filename });

      const embed = new EmbedBuilder()
        .setTitle(`💼 Master Contractor Payroll Ledger • ${guild.name}`)
        .setDescription(
          `Master payroll spreadsheet for period **${pActivePreset}** (${settings.timezone || 'UTC'}).\n` +
          `Includes formula-backed payout calculations (\`=ROUND(C*G, 2)\`) and summary totals (\`=SUM(...)\`).`
        )
        .addFields(
          { name: '👥 Contractors', value: `${contractors.length}`, inline: true },
          { name: '⏱️ Billable Hours', value: `${totalBillable.toFixed(2)}h`, inline: true },
          {
            name: '💰 Total Payout',
            value: `${totalPayout.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${primaryCurrency}`,
            inline: true,
          }
        )
        .setColor(0x5865f2)
        .setFooter({ text: 'PurrTrack Payroll System' })
        .setTimestamp();

      await interaction.editReply({
        embeds: [embed],
        files: [attachment],
      });
      return;
    } catch (err) {
      console.error('Error generating payroll report:', err);
      await interaction.editReply({
        content: `❌ An error occurred while generating payroll: ${err instanceof Error ? err.message : String(err)}`,
      });
      return;
    }
  }

  if (targetUser && targetUser.id !== interaction.user.id && !isManager) {
    await interaction.reply({
      content: getManagementDenialMessage(settings),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  let startDate: Date;
  let endDate: Date;
  let activePreset = preset;

  if (customStartStr) {
    const parsedRange = parseCustomDateRange(customStartStr, customEndStr);
    if (!parsedRange || parsedRange === 'INVALID') {
      await interaction.reply({
        content:
          '❌ Invalid date format. Please use `YYYY-MM-DD` (e.g. `2026-09-15`) or `YYYY-MM` (e.g. `2026-09`). Start date must also be before or equal to end date.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    startDate = parsedRange.startDate;
    endDate = parsedRange.endDate;
    activePreset = parsedRange.label as any;
  } else {
    const resolved = resolveTimeRange(preset);
    startDate = resolved.startDate;
    endDate = resolved.endDate;
  }

  if (format === ExportFormat.EMBED) {
    await interaction.deferReply();
  } else {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  }

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
            wasMuted: Boolean(voiceState.selfMute || voiceState.serverMute || voiceState.mute),
            wasDeafened: Boolean(voiceState.selfDeaf || voiceState.serverDeaf || voiceState.deaf),
            wasStreaming: Boolean(voiceState.streaming),
            wasVideo: Boolean(voiceState.selfVideo),
          });
        }
      }
    }

    const reportData = await sessionRepo.getAggregatedReport({
      guildId: guild.id,
      guildName: guild.name,
      userId: targetUser?.id,
      startDate,
      endDate,
      preset: activePreset,
      timezone: settings.timezone || "UTC",
    });

    // Apply manual adjustments if targeting an individual user
    if (targetUser && timeRepo) {
      const netAdjSeconds = await timeRepo.getNetAdjustmentSeconds(guild.id, targetUser.id, startDate, endDate);
      const userAdjs = await timeRepo.getUserAdjustments(guild.id, targetUser.id, startDate, endDate);
      if (userAdjs.length > 0) {
        reportData.totalDurationSeconds = Math.max(0, reportData.totalDurationSeconds + netAdjSeconds);
        reportData.totalDurationFormatted = formatDuration(reportData.totalDurationSeconds);
        reportData.manualAdjustments = {
          netSeconds: netAdjSeconds,
          netFormatted: `${netAdjSeconds >= 0 ? '+' : ''}${formatDuration(Math.abs(netAdjSeconds))}`,
          count: userAdjs.length,
        };
      }
    }

    // Attach contractor billing rate if authorized (Management permission or inspecting self)
    if (targetUser && ratesRepo && (isManager || targetUser.id === interaction.user.id)) {
      const rate = await ratesRepo.getRate(guild.id, targetUser.id);
      if (rate) {
        const hourlyRateFormatted = `${(rate.hourlyRateCents / 100).toFixed(2)} ${rate.currency} / hr`;
        const totalPayableCents = Math.round((reportData.totalDurationSeconds / 3600) * rate.hourlyRateCents);
        const totalPayableFormatted = `${(totalPayableCents / 100).toFixed(2)} ${rate.currency}`;

        reportData.contractorRate = {
          hourlyRateCents: rate.hourlyRateCents,
          hourlyRateFormatted,
          currency: rate.currency,
          totalPayableCents,
          totalPayableFormatted,
        };
      }
    }

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
