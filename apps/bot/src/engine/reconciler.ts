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
        await guild.channels.fetch().catch(() => null);

        // Iterate through all cached voice states in the guild
        for (const voiceState of guild.voiceStates.cache.values()) {
          const channelId = voiceState.channelId;
          if (!channelId) continue;

          const userId = voiceState.id;
          let member = voiceState.member;
          if (!member && guild.members?.fetch) {
            member = await guild.members.fetch(userId).catch(() => null);
          }
          if (member?.user?.bot) continue;

          activeUsersInGuild.add(userId);

          const username = member?.user?.username ?? `user_${userId}`;
          const globalName = member?.user?.globalName ?? member?.displayName ?? username;
          const avatarUrl = member?.user?.displayAvatarURL ? member.user.displayAvatarURL() : null;

          await this.sessionRepo.upsertUser(userId, username, globalName, avatarUrl ?? undefined);

          let channel = voiceState.channel;
          if (!channel && guild.channels?.fetch) {
            channel = (await guild.channels.fetch(channelId).catch(() => null)) as any;
          }
          const channelName = channel?.name ?? `voice-${channelId}`;
          const isAfk = guild.afkChannelId ? channelId === guild.afkChannelId : false;

          await this.sessionRepo.upsertChannel(channelId, guild.id, channelName, isAfk);

          // Check if member already has an active session in DB
          const activeSession = await this.sessionRepo.getActiveSession(guild.id, userId);
          if (!activeSession) {
            logger.info(`✨ [reconciler] Discovered untracked member @${username} in #${channelName}. Starting session.`);
            await this.sessionRepo.startSession({
              guildId: guild.id,
              userId,
              channelId,
              channelName,
              startedAt: restartTimestamp,
              wasMuted: voiceState.selfMute || voiceState.serverMute || false,
              wasDeafened: voiceState.selfDeaf || voiceState.serverDeaf || false,
              wasStreaming: voiceState.streaming || false,
            });
            resumedCount++;
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
