import { EmbedBuilder } from 'discord.js';
import { AggregatedReportData } from '@purrtrack/shared';

/**
 * Builds a Discord Embed visualizing the aggregated time report.
 */
export function generateDiscordEmbed(data: AggregatedReportData): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(0x5865f2) // Discord Blurple
    .setTitle(`📊 Voice Time Report: ${data.guildName}`)
    .setDescription(
      `**Period:** ${data.period.startDate.toLocaleDateString()} to ${data.period.endDate.toLocaleDateString()} (UTC)\n` +
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
      .map((s) => `• **${s.displayName || s.username}** in **#${s.channelName}**: \`${s.durationFormatted}\``)
      .join('\n');
    embed.addFields({
      name: `⏱️ Recent Sessions (${Math.min(5, data.sessions.length)} of ${data.sessions.length})`,
      value: recentList,
      inline: false,
    });
  }

  embed.setFooter({ text: 'PurrTrack • Clockify for Discord' }).setTimestamp();
  return embed;
}
