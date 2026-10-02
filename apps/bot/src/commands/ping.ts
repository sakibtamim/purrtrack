import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { APP_VERSION } from '@purrtrack/shared';

export const pingCommand = new SlashCommandBuilder()
  .setName('ping')
  .setDescription('🏓 Check bot latency and responsiveness');

export async function handlePingCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.reply({ content: '🏓 Pinging...' });
  const sent = await interaction.fetchReply();
  const latency = sent.createdTimestamp - interaction.createdTimestamp;
  const apiPing = Math.round(interaction.client.ws.ping);

  await interaction.editReply(
    `🏓 **Pong!**\n• **Version:** \`v${APP_VERSION}\`\n• **Bot Latency:** \`${latency}ms\`\n• **Discord API WebSocket Ping:** \`${apiPing}ms\``
  );
}
