import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { APP_VERSION, formatDuration } from '@purrtrack/shared';

export const healthCommand = new SlashCommandBuilder()
  .setName('health')
  .setDescription('🩺 Check PurrTrack bot health, version, uptime, and system diagnostics');

export async function handleHealthCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const wsPing = Math.round(interaction.client.ws.ping);
  const uptime = Math.floor(process.uptime());
  const mem = process.memoryUsage();
  const rssMb = (mem.rss / (1024 * 1024)).toFixed(1);
  const heapMb = (mem.heapUsed / (1024 * 1024)).toFixed(1);
  const guildCount = interaction.client.guilds.cache.size;

  const embed = new EmbedBuilder()
    .setColor(0x57f287) // Discord Green
    .setTitle('🩺 PurrTrack System Health & Diagnostics')
    .setDescription('All tracking engines, voice reconcilers, and gateway listeners are operational.')
    .addFields(
      {
        name: '📦 Application Version',
        value: `\`v${APP_VERSION}\` *(Production)*`,
        inline: true,
      },
      {
        name: '⏱️ Bot Uptime',
        value: `\`${formatDuration(uptime)}\``,
        inline: true,
      },
      {
        name: '🌐 Gateway Ping',
        value: `\`${wsPing}ms\` *(WebSocket)*`,
        inline: true,
      },
      {
        name: '💾 Memory Usage',
        value: `\`${heapMb} MB heap\` / \`${rssMb} MB RSS\``,
        inline: true,
      },
      {
        name: '🏰 Connected Servers',
        value: `\`${guildCount}\` server${guildCount === 1 ? '' : 's'}`,
        inline: true,
      },
      {
        name: '⚙️ Runtime Engine',
        value: `\`Node ${process.version}\``,
        inline: true,
      }
    )
    .setFooter({ text: `PurrTrack v${APP_VERSION} • Enterprise Diagnostics` })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}
