import { Client } from 'discord.js';
import { VoiceSessionRepository } from '@purrtrack/db';
import { logger } from '../core/logger.js';

export class StartupReconciler {
  constructor(private readonly sessionRepo: VoiceSessionRepository) {}

  /**
   * Scans all guild voice channels on bot startup.
   * 1. Heals ghost/abandoned sessions left open after a crash or restart.
   * 2. Automatically resumes tracking for any member currently in a voice channel.
   */
  async reconcile(client: Client): Promise<{ healed: number; resumed: number }> {
    logger.info('🔍 [reconciler] Running startup voice state reconciliation audit...');

    const restartTimestamp = new Date();
    const activeConnectedUsersByGuild = new Map<string, Set<string>>();
    let resumedCount = 0;

    for (const guild of client.guilds.cache.values()) {
      const activeUsersInGuild = new Set<string>();

      try {
        // Fetch fresh channels
        const channels = await guild.channels.fetch();

        for (const channel of channels.values()) {
          if (channel && channel.isVoiceBased()) {
            // Find all non-bot members currently in voice
            const members = channel.members.filter((m) => !m.user.bot);

            for (const member of members.values()) {
              activeUsersInGuild.add(member.user.id);

              // Update user record
              await this.sessionRepo.upsertUser(
                member.user.id,
                member.user.username,
                member.user.globalName || member.displayName,
                member.user.displayAvatarURL()
              );

              // Ensure channel is registered
              await this.sessionRepo.upsertChannel(channel.id, guild.id, channel.name, channel.id === guild.afkChannelId);

              // Check if member already has an active session in DB
              const activeSession = await this.sessionRepo.getActiveSession(guild.id, member.user.id);
              if (!activeSession) {
                // Resume/initiate session for connected member
                logger.info(`✨ [reconciler] Discovered untracked member ${member.user.username} in ${channel.name}. Starting session.`);
                await this.sessionRepo.startSession({
                  guildId: guild.id,
                  userId: member.user.id,
                  channelId: channel.id,
                  channelName: channel.name,
                  startedAt: restartTimestamp,
                  wasMuted: member.voice.selfMute || member.voice.serverMute || false,
                  wasDeafened: member.voice.selfDeaf || member.voice.serverDeaf || false,
                  wasStreaming: member.voice.streaming || false,
                });
                resumedCount++;
              }
            }
          }
        }
      } catch (err) {
        logger.error(`❌ [reconciler] Error inspecting guild ${guild.id}:`, err);
      }

      activeConnectedUsersByGuild.set(guild.id, activeUsersInGuild);
    }

    // Step 2: Heal all dangling DB sessions whose users are not currently connected
    const healedCount = await this.sessionRepo.healAbandonedSessions(
      activeConnectedUsersByGuild,
      restartTimestamp
    );

    logger.info(`✅ [reconciler] Reconciliation complete! Ghost sessions healed: ${healedCount}, Active members tracked: ${resumedCount}`);
    return { healed: healedCount, resumed: resumedCount };
  }
}
