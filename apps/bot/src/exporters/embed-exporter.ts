import { EmbedBuilder } from 'discord.js';
import { AggregatedReportData, getTimezoneLabel, formatDateInTz } from '@purrtrack/shared';

/**
 * Builds a Discord Embed visualizing the aggregated time report.
 */
export function generateDiscordEmbed(data: AggregatedReportData): EmbedBuilder {
  const tz = data.timezone || 'UTC';
  const tzLabel = getTimezoneLabel(tz);
  const embed = new EmbedBuilder()
    .setColor(0x5865f2) // Discord Blurple
    .setTitle(`📊 Voice Time Report: ${data.guildName}`)
    .setDescription(
      `**Period:** ${formatDateInTz(data.period.startDate, tz)} to ${formatDateInTz(data.period.endDate, tz)} (${tzLabel})\n` +
      (data.targetUser ? `**Filtered Member:** ${data.targetUser.displayName ? `${data.targetUser.displayName} (@${data.targetUser.username})` : `@${data.targetUser.username}`}\n` : '') +
      `**Total Tracked Time:** \`${data.totalDurationFormatted}\`\n` +
      `**Total Sessions:** \`${data.totalSessions}\`\n` +
      `**Active Users:** \`${data.uniqueActiveUsers}\``
    );

    // Top Channels breakdown
  if (data.topChannels.length > 0) {
    const channelList = data.topChannels
      .slice(0, 5)
      .map((ch, idx) => `${idx + 1}. **#${ch.channelName}** — \`${ch.durationFormatted}\` (${ch.sessionCount} sessions)`)
      .join('\n');
    embed.addFields({ name: '🔊 Top Voice Channels', value: channelList, inline: false });
  }

  // Contractor Compensation (if rate configured)
  if (data.contractorRate) {
    embed.addFields({
      name: '💼 Contractor Compensation',
      value:
        `• **Hourly Rate**: \`${data.contractorRate.hourlyRateFormatted}\`\n` +
        `• **Total Billable Amount**: **${data.contractorRate.totalPayableFormatted}** (${(data.totalDurationSeconds / 3600).toFixed(2)} hrs)`,
      inline: false,
    });
  }

  // Manual Adjustments (if any)
  if (data.manualAdjustments && data.manualAdjustments.count > 0) {
    embed.addFields({
      name: '⏱️ Manual Adjustments',
      value: `• **Net Adjustment**: \`${data.manualAdjustments.netFormatted}\` across **${data.manualAdjustments.count}** entry/entries`,
      inline: false,
    });
  }

  // Top Contributors breakdown (if guild-wide)
  if (data.topUsers && data.topUsers.length > 0 && !data.targetUser) {
    const userList = data.topUsers
      .slice(0, 5)
      .map((u, idx) => `${idx + 1}. **${u.displayName || u.username}** — \`${u.durationFormatted}\` (${u.sessionCount} sessions)`)
      .join('\n');
    embed.addFields({ name: '🏆 Top Contributors', value: userList, inline: false });
  }

  // Recent Sessions list
  if (data.sessions.length > 0) {
    const recentList = data.sessions
      .slice(0, 5)
      .map((s) => {
        const liveIndicator = s.status === 'ACTIVE' ? ' 🟢 *(Live)*' : '';
        return `• **${s.displayName || s.username}** in **#${s.channelName}**: \`${s.durationFormatted}\`${liveIndicator}`;
      })
      .join('\n');
    embed.addFields({
      name: `⏱️ Recent Sessions (${Math.min(5, data.sessions.length)} of ${data.sessions.length})`,
      value: recentList,
      inline: false,
    });
  }

  embed.setFooter({ text: 'PurrTrack • TimeTrack for Discord' }).setTimestamp();
  return embed;
}
