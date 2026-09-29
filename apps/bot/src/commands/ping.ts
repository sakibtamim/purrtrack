import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';

export const pingCommand = new SlashCommandBuilder()
  .setName('ping')
  .setDescription('🏓 Check bot latency and responsiveness');

export async function handlePingCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const sent = await interaction.reply({ content: '🏓 Pinging...', fetchReply: true });
  const latency = sent.createdTimestamp - interaction.createdTimestamp;
  const apiPing = Math.round(interaction.client.ws.ping);

  await interaction.editReply(
    `🏓 **Pong!**\n• **Bot Latency:** \`${latency}ms\`\n• **Discord API WebSocket Ping:** \`${apiPing}ms\``
  );
}
