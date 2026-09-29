import { Client, TextChannel, EmbedBuilder } from 'discord.js';
import { env } from '../config/env.js';
import { logger } from './logger.js';

export async function sendStartupAnnouncement(client: Client): Promise<void> {
  const channelId = env.DISCORD_ANNOUNCE_CHANNEL_ID;
  if (!channelId) return;

  try {
    const channel = await client.channels.fetch(channelId);
    if (channel && channel.isTextBased() && 'send' in channel) {
      const embed = new EmbedBuilder()
        .setColor(0x57f287) // Green
        .setTitle('🐱 PurrTrack Online')
        .setDescription('Automatic Voice Time Tracking Engine is active and monitoring voice channels.')
        .addFields(
          { name: 'Servers Monitored', value: `${client.guilds.cache.size}`, inline: true },
          { name: 'Environment', value: env.NODE_ENV, inline: true }
        )
        .setTimestamp();

      await (channel as TextChannel).send({ embeds: [embed] });
      logger.info(`[announcer] Sent startup announcement to channel ${channelId}`);
    }
  } catch (err) {
    logger.warn('[announcer] Failed to send startup announcement:', err);
  }
}
