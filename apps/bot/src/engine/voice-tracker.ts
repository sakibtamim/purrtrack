import { VoiceState } from 'discord.js';
import { VoiceSessionRepository, GuildSettingsRepository, UserGoalsRepository } from '@purrtrack/db';
import { logger } from '../core/logger.js';

interface PendingLeave {
  timeoutId: NodeJS.Timeout;
  sessionId: string;
  leaveTime: Date;
  guildId: string;
  userId: string;
  username: string;
}

export class VoiceTracker {
  // In-memory grace window (5s) for anti-flap protection: key is "guildId:userId"
  private pendingLeaves: Map<string, PendingLeave> = new Map();
  // In-memory activity timestamp for inactivity sleep guard
  private lastActiveMap: Map<string, number> = new Map();
  private watchdogTimer?: NodeJS.Timeout;

  constructor(
    private readonly sessionRepo: VoiceSessionRepository,
    private readonly settingsRepo: GuildSettingsRepository,
    private readonly flapGraceSeconds: number = 5,
    private readonly userGoalsRepo?: UserGoalsRepository,
    private readonly badgeManager?: any
  ) {}

  private getKey(guildId: string, userId: string): string {
    return `${guildId}:${userId}`;
  }

  /**
   * Main entry point for voiceStateUpdate events
   */
  async handleVoiceStateUpdate(oldState: VoiceState, newState: VoiceState): Promise<void> {
    const guild = newState.guild || oldState.guild;
    const guildId = guild?.id;
    if (!guildId) return;

    // Resolve member & user ID (supports both discord.js VoiceState and unit-test mocks)
    let member = newState.member || oldState.member;
    const userId = newState.id || oldState.id || member?.user?.id;
    if (!userId) return;

    // Fetch member from API if un-cached
    if (!member && guild.members?.fetch) {
      member = await guild.members.fetch(userId).catch(() => null);
    }

    // Ignore bot accounts
    if (member?.user?.bot) {
      return;
    }

    if (!member) {
      const client = newState.client || oldState.client;
      if (client?.users?.fetch) {
        const user = await client.users.fetch(userId).catch(() => null);
        if (!user || user.bot) return;
      }
    }

    const username = member?.user?.username ?? `user_${userId}`;
    const globalName = member?.user?.globalName ?? member?.displayName ?? username;
    const avatarUrl = member?.user?.displayAvatarURL ? member.user.displayAvatarURL() : undefined;
    const key = this.getKey(guildId, userId);

    // Update user record in directory
    await this.sessionRepo.upsertUser(userId, username, globalName, avatarUrl);

    // Fetch guild tracking configuration
    const settings = await this.settingsRepo.getSettings(guildId);
    if (!settings.trackingEnabled) {
      return;
    }

    const oldChannelId = oldState.channelId;
    const newChannelId = newState.channelId;

    // Helper to test if a channel is ignored (e.g., AFK or explicit blacklist)
    const isChannelIgnored = (channelId: string | null): boolean => {
      if (!channelId) return true;
      if (settings.excludeAfk && guild.afkChannelId && channelId === guild.afkChannelId) {
        return true;
      }
      if (settings.ignoredChannelIds && settings.ignoredChannelIds.includes(channelId)) {
        return true;
      }
      return false;
    };

    const isOldIgnored = isChannelIgnored(oldChannelId);
    const isNewIgnored = isChannelIgnored(newChannelId);

    // Event 1: User joined voice from disconnected (or joined from ignored channel)
    if ((!oldChannelId || isOldIgnored) && newChannelId && !isNewIgnored) {
      await this.handleJoin(guild, guildId, userId, username, newState, key);
      return;
    }

    // Event 2: User disconnected from voice (or moved to ignored/AFK channel)
    if (oldChannelId && !isOldIgnored && (!newChannelId || isNewIgnored)) {
      await this.handleLeave(guildId, userId, username, key, guild, member);
      return;
    }

    // Event 3: User switched between two valid tracked channels
    if (oldChannelId && newChannelId && oldChannelId !== newChannelId && !isOldIgnored && !isNewIgnored) {
      await this.handleSwitch(guild, guildId, userId, username, newState, key);
      return;
    }

    // Event 4: In-channel state change (mute, deafen, stream, camera/video)
    if (oldChannelId && newChannelId && oldChannelId === newChannelId && !isNewIgnored) {
      await this.handleStateChange(guildId, userId, username, oldState, newState);
      return;
    }
  }

  private async handleJoin(
    guild: any,
    guildId: string,
    userId: string,
    username: string,
    state: VoiceState,
    key: string
  ): Promise<void> {
    const channelId = state.channelId!;
    let channel = state.channel;
    if (!channel && guild.channels?.fetch) {
      channel = (await guild.channels.fetch(channelId).catch(() => null)) as any;
    }
    const channelName = channel?.name ?? `voice-${channelId}`;

    // Flap Protection: check if user had a pending leave in grace window
    const pending = this.pendingLeaves.get(key);
    if (pending) {
      clearTimeout(pending.timeoutId);
      this.pendingLeaves.delete(key);
      logger.info(`⚡ [tracker] Anti-Flap Triggered: Cancelled pending disconnect for ${username} (${userId}) (reconnected in < ${this.flapGraceSeconds}s)`);
      return;
    }

    // Upsert channel details
    await this.sessionRepo.upsertChannel(channelId, guildId, channelName, false);

    logger.info(`🎙️ [tracker] User ${username} (${userId}) JOINED #${channelName} in ${guild.name || guildId}. Starting session.`);
    await this.sessionRepo.startSession({
      guildId,
      userId,
      channelId,
      channelName,
      wasMuted: Boolean(state.selfMute || state.serverMute || state.mute),
      wasDeafened: Boolean(state.selfDeaf || state.serverDeaf || state.deaf),
      wasStreaming: Boolean(state.streaming),
      wasVideo: Boolean(state.selfVideo),
    });
  }

  private async handleLeave(
    guildId: string,
    userId: string,
    username: string,
    key: string,
    guild?: any,
    member?: any
  ): Promise<void> {
    const active = await this.sessionRepo.getActiveSession(guildId, userId);
    if (!active) return;

    logger.info(`⏳ [tracker] User ${username} (${userId}) DISCONNECTED. Staging leave with ${this.flapGraceSeconds}s grace window...`);

    // If already pending, clear old timer
    const existing = this.pendingLeaves.get(key);
    if (existing) {
      clearTimeout(existing.timeoutId);
    }

    const leaveTime = new Date();

    const timeoutId = setTimeout(async () => {
      this.pendingLeaves.delete(key);
      try {
        const finalized = await this.sessionRepo.endSession({
          sessionId: active.id,
          endedAt: leaveTime,
        });

        if (finalized) {
          logger.info(`✅ [tracker] Session finalized for user ${username} (${userId}). Total Duration: ${finalized.durationSeconds}s`);
          if (this.userGoalsRepo && (finalized.durationSeconds ?? 0) >= 30) {
            await this.userGoalsRepo.recordActivityAndStreak(guildId, userId, leaveTime).catch((e) => {
              logger.warn(`[tracker] Failed to record streak for user ${userId}:`, e);
            });
          }

          if (this.badgeManager && (finalized.durationSeconds ?? 0) >= 30) {
            await this.badgeManager.evaluateAndUnlock({ guildId, userId }).catch(() => {});
          }
        }
      } catch (err) {
        logger.error(`❌ [tracker] Error ending session for user ${username} (${userId}):`, err);
      }
    }, this.flapGraceSeconds * 1000);

    this.pendingLeaves.set(key, {
      timeoutId,
      sessionId: active.id,
      leaveTime,
      guildId,
      userId,
      username,
    });
  }

  private async handleSwitch(
    guild: any,
    guildId: string,
    userId: string,
    username: string,
    state: VoiceState,
    key: string
  ): Promise<void> {
    // If pending leave was staged, cancel it
    const pending = this.pendingLeaves.get(key);
    if (pending) {
      clearTimeout(pending.timeoutId);
      this.pendingLeaves.delete(key);
    }

    const channelId = state.channelId!;
    let channel = state.channel;
    if (!channel && guild.channels?.fetch) {
      channel = (await guild.channels.fetch(channelId).catch(() => null)) as any;
    }
    const channelName = channel?.name ?? `voice-${channelId}`;

    const active = await this.sessionRepo.getActiveSession(guildId, userId);

    await this.sessionRepo.upsertChannel(channelId, guildId, channelName, false);

    if (active) {
      logger.info(`🔄 [tracker] User ${username} (${userId}) SWITCHED to #${channelName}. Splitting segment.`);
      await this.sessionRepo.switchChannel({
        sessionId: active.id,
        newChannelId: channelId,
        newChannelName: channelName,
        wasMuted: Boolean(state.selfMute || state.serverMute || state.mute),
        wasDeafened: Boolean(state.selfDeaf || state.serverDeaf || state.deaf),
        wasStreaming: Boolean(state.streaming),
        wasVideo: Boolean(state.selfVideo),
      });
    } else {
      // Re-initiate if session was missing
      logger.info(`🎙️ [tracker] User ${username} (${userId}) switched to #${channelName} with no prior session. Starting session.`);
      await this.sessionRepo.startSession({
        guildId,
        userId,
        channelId,
        channelName,
        wasMuted: Boolean(state.selfMute || state.serverMute || state.mute),
        wasDeafened: Boolean(state.selfDeaf || state.serverDeaf || state.deaf),
        wasStreaming: Boolean(state.streaming),
        wasVideo: Boolean(state.selfVideo),
      });
    }
  }

  private async handleStateChange(
    guildId: string,
    userId: string,
    username: string,
    oldState: VoiceState,
    newState: VoiceState
  ): Promise<void> {
    const oldMuted = Boolean(oldState.selfMute || oldState.serverMute || oldState.mute);
    const newMuted = Boolean(newState.selfMute || newState.serverMute || newState.mute);
    const oldDeafened = Boolean(oldState.selfDeaf || oldState.serverDeaf || oldState.deaf);
    const newDeafened = Boolean(newState.selfDeaf || newState.serverDeaf || newState.deaf);
    const oldStreaming = Boolean(oldState.streaming);
    const newStreaming = Boolean(newState.streaming);
    const oldVideo = Boolean(oldState.selfVideo);
    const newVideo = Boolean(newState.selfVideo);

    const hasChanged =
      oldMuted !== newMuted ||
      oldDeafened !== newDeafened ||
      oldStreaming !== newStreaming ||
      oldVideo !== newVideo;

    if (!hasChanged) return;

    const active = await this.sessionRepo.getActiveSession(guildId, userId);
    if (!active) return;

    logger.info(
      `📹 [tracker] Media/state toggle for @${username} (${userId}): stream:${oldStreaming}➔${newStreaming}, video:${oldVideo}➔${newVideo}, mute:${oldMuted}➔${newMuted}, deaf:${oldDeafened}➔${newDeafened}`
    );

    await this.sessionRepo.transitionState({
      sessionId: active.id,
      wasMuted: newMuted,
      wasDeafened: newDeafened,
      wasStreaming: newStreaming,
      wasVideo: newVideo,
    });
  }

  /**
   * Flush all pending leaves immediately (used on bot shutdown)
   */
  async flushAllPending(): Promise<void> {
    for (const [key, pending] of this.pendingLeaves.entries()) {
      clearTimeout(pending.timeoutId);
      try {
        const finalized = await this.sessionRepo.endSession({
          sessionId: pending.sessionId,
          endedAt: pending.leaveTime,
        });
        if (finalized && this.userGoalsRepo && (finalized.durationSeconds ?? 0) >= 30) {
          await this.userGoalsRepo.recordActivityAndStreak(pending.guildId, pending.userId, pending.leaveTime).catch(() => {});
        }
        logger.info(`[tracker] Flushed pending leave for ${pending.username || pending.userId}`);
      } catch (err) {
        logger.error(`[tracker] Failed to flush pending leave:`, err);
      }
    }
    this.pendingLeaves.clear();
  }

  /**
   * Start periodic inactivity watchdog (runs every 60s)
   */
  startInactivityWatchdog(client: any, intervalMs: number = 60000): void {
    if (this.watchdogTimer) {
      clearInterval(this.watchdogTimer);
    }
    this.watchdogTimer = setInterval(() => {
      this.checkInactivity(client).catch((err) => {
        logger.error('[tracker] Inactivity watchdog error:', err);
      });
    }, intervalMs);
    logger.info('🛡️ [tracker] Inactivity sleep guard watchdog started.');
  }

  /**
   * Stop inactivity watchdog (on graceful exit)
   */
  stopInactivityWatchdog(): void {
    if (this.watchdogTimer) {
      clearInterval(this.watchdogTimer);
      this.watchdogTimer = undefined;
    }
  }

  /**
   * Evaluate all active connected voice members against the guild maxInactiveMinutes policy
   */
  async checkInactivity(client: any): Promise<void> {
    if (!client?.guilds?.cache) return;

    for (const guild of client.guilds.cache.values()) {
      try {
        const settings = await this.settingsRepo.getSettings(guild.id);
        if (!settings.trackingEnabled || !settings.maxInactiveMinutes || settings.maxInactiveMinutes <= 0) {
          continue;
        }

        const thresholdMs = settings.maxInactiveMinutes * 60 * 1000;
        const now = Date.now();

        for (const voiceState of guild.voiceStates.cache.values()) {
          if (!voiceState.channelId) continue;
          if (voiceState.member?.user?.bot) continue;

          // Skip if already in AFK channel or ignored
          if (settings.excludeAfk && guild.afkChannelId && voiceState.channelId === guild.afkChannelId) continue;
          if (settings.ignoredChannelIds && settings.ignoredChannelIds.includes(voiceState.channelId)) continue;

          const isMuted = Boolean(voiceState.selfMute || voiceState.serverMute || voiceState.mute);
          const isDeaf = Boolean(voiceState.selfDeaf || voiceState.serverDeaf || voiceState.deaf);
          const isStreaming = Boolean(voiceState.streaming);
          const isVideo = Boolean(voiceState.selfVideo);

          const key = this.getKey(guild.id, voiceState.id);

          if (isMuted && isDeaf && !isStreaming && !isVideo) {
            const lastActive = this.lastActiveMap.get(key) || now;
            if (!this.lastActiveMap.has(key)) {
              this.lastActiveMap.set(key, lastActive);
            }

            if (now - lastActive >= thresholdMs) {
              const active = await this.sessionRepo.getActiveSession(guild.id, voiceState.id);
              if (!active) continue;

              const member = voiceState.member;
              const displayName = member?.displayName || voiceState.id;
              logger.info(`😴 [tracker] Member ${displayName} reached inactivity limit (${settings.maxInactiveMinutes}m) in ${guild.name}.`);

              // Case A: AFK channel exists
              if (guild.afkChannelId && voiceState.channelId !== guild.afkChannelId) {
                await member?.voice?.setChannel(guild.afkChannelId).catch(() => null);
              } else {
                // Case B: No AFK channel -> attempt voice disconnect
                await member?.voice?.disconnect('PurrTrack: Inactivity sleep guard').catch(() => null);
              }

              // Finalize session in DB to stop ticking
              await this.sessionRepo.endSession({
                sessionId: active.id,
                endedAt: new Date(),
              });
              this.lastActiveMap.delete(key);
            }
          } else {
            this.lastActiveMap.set(key, now);
          }
        }
      } catch (err) {
        logger.error(`[tracker] Error checking inactivity for guild ${guild.id}:`, err);
      }
    }
  }
}
