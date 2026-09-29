import { VoiceState } from 'discord.js';
import { VoiceSessionRepository, GuildSettingsRepository } from '@purrtrack/db';
import { logger } from '../core/logger.js';

interface PendingLeave {
  timeoutId: NodeJS.Timeout;
  sessionId: string;
  leaveTime: Date;
  guildId: string;
  userId: string;
}

export class VoiceTracker {
  // In-memory grace window (5s) for anti-flap protection: key is "guildId:userId"
  private pendingLeaves: Map<string, PendingLeave> = new Map();

  constructor(
    private readonly sessionRepo: VoiceSessionRepository,
    private readonly settingsRepo: GuildSettingsRepository,
    private readonly flapGraceSeconds: number = 5
  ) {}

  private getKey(guildId: string, userId: string): string {
    return `${guildId}:${userId}`;
  }

  /**
   * Main entry point for voiceStateUpdate events
   */
  async handleVoiceStateUpdate(oldState: VoiceState, newState: VoiceState): Promise<void> {
    const member = newState.member || oldState.member;
    if (!member || member.user.bot) {
      // Rule: Ignore all bot accounts!
      return;
    }

    const guildId = newState.guild.id || oldState.guild.id;
    const userId = member.user.id;
    const key = this.getKey(guildId, userId);

    // Update user record in directory
    await this.sessionRepo.upsertUser(
      userId,
      member.user.username,
      member.user.globalName || member.displayName,
      member.user.displayAvatarURL()
    );

    // Fetch guild tracking configuration
    const settings = await this.settingsRepo.getSettings(guildId);
    if (!settings.trackingEnabled) {
      return;
    }

    const oldChannelId = oldState.channelId;
    const newChannelId = newState.channelId;

    // Helper to test if a channel is ignored (e.g., AFK or explicit blacklist)
    const isChannelIgnored = (channel: VoiceState['channel']): boolean => {
      if (!channel) return true;
      if (settings.excludeAfk && channel.id === newState.guild.afkChannelId) {
        return true;
      }
      if (settings.ignoredChannelIds && settings.ignoredChannelIds.includes(channel.id)) {
        return true;
      }
      return false;
    };

    const isOldIgnored = isChannelIgnored(oldState.channel);
    const isNewIgnored = isChannelIgnored(newState.channel);

    // Event 1: User joined voice from disconnected (or joined from ignored channel)
    if ((!oldChannelId || isOldIgnored) && newChannelId && !isNewIgnored) {
      await this.handleJoin(guildId, userId, newState, key);
      return;
    }

    // Event 2: User disconnected from voice (or moved to ignored/AFK channel)
    if (oldChannelId && !isOldIgnored && (!newChannelId || isNewIgnored)) {
      await this.handleLeave(guildId, userId, key);
      return;
    }

    // Event 3: User switched between two valid tracked channels
    if (oldChannelId && newChannelId && oldChannelId !== newChannelId && !isOldIgnored && !isNewIgnored) {
      await this.handleSwitch(guildId, userId, newState, key);
      return;
    }

    // Event 4: In-channel state change (mute, deafen, stream)
    if (oldChannelId && newChannelId && oldChannelId === newChannelId && !isNewIgnored) {
      // In-channel status update (e.g., mute / deafen / stream toggle)
      logger.debug(`[tracker] State toggle in channel ${newChannelId} for user ${userId}`);
    }
  }

  private async handleJoin(guildId: string, userId: string, state: VoiceState, key: string): Promise<void> {
    const channel = state.channel!;

    // Flap Protection: check if user had a pending leave in grace window
    const pending = this.pendingLeaves.get(key);
    if (pending) {
      clearTimeout(pending.timeoutId);
      this.pendingLeaves.delete(key);
      logger.info(`⚡ [tracker] Anti-Flap Triggered: Cancelled pending disconnect for ${userId} (reconnected in < ${this.flapGraceSeconds}s)`);
      return;
    }

    // Upsert channel details
    await this.sessionRepo.upsertChannel(channel.id, guildId, channel.name, false);

    logger.info(`🎙️ [tracker] User ${userId} joined ${channel.name} in guild ${guildId}. Starting session.`);
    await this.sessionRepo.startSession({
      guildId,
      userId,
      channelId: channel.id,
      channelName: channel.name,
      wasMuted: state.selfMute || state.serverMute || false,
      wasDeafened: state.selfDeaf || state.serverDeaf || false,
      wasStreaming: state.streaming || false,
    });
  }

  private async handleLeave(guildId: string, userId: string, key: string): Promise<void> {
    const active = await this.sessionRepo.getActiveSession(guildId, userId);
    if (!active) return;

    logger.info(`⏳ [tracker] User ${userId} disconnected. Staging leave with ${this.flapGraceSeconds}s grace window...`);

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
          logger.info(`✅ [tracker] Session finalized for user ${userId}. Total Duration: ${finalized.durationSeconds}s`);
        }
      } catch (err) {
        logger.error(`❌ [tracker] Error ending session for user ${userId}:`, err);
      }
    }, this.flapGraceSeconds * 1000);

    this.pendingLeaves.set(key, {
      timeoutId,
      sessionId: active.id,
      leaveTime,
      guildId,
      userId,
    });
  }

  private async handleSwitch(guildId: string, userId: string, state: VoiceState, key: string): Promise<void> {
    // If pending leave was staged, cancel it
    const pending = this.pendingLeaves.get(key);
    if (pending) {
      clearTimeout(pending.timeoutId);
      this.pendingLeaves.delete(key);
    }

    const active = await this.sessionRepo.getActiveSession(guildId, userId);
    const channel = state.channel!;

    await this.sessionRepo.upsertChannel(channel.id, guildId, channel.name, false);

    if (active) {
      logger.info(`🔄 [tracker] User ${userId} switched to ${channel.name}. Splitting segment.`);
      await this.sessionRepo.switchChannel({
        sessionId: active.id,
        newChannelId: channel.id,
        newChannelName: channel.name,
        wasMuted: state.selfMute || state.serverMute || false,
        wasDeafened: state.selfDeaf || state.serverDeaf || false,
        wasStreaming: state.streaming || false,
      });
    } else {
      // Re-initiate if session was missing
      await this.sessionRepo.startSession({
        guildId,
        userId,
        channelId: channel.id,
        channelName: channel.name,
        wasMuted: state.selfMute || state.serverMute || false,
        wasDeafened: state.selfDeaf || state.serverDeaf || false,
        wasStreaming: state.streaming || false,
      });
    }
  }

  /**
   * Flush all pending leaves immediately (used on bot shutdown)
   */
  async flushAllPending(): Promise<void> {
    for (const [key, pending] of this.pendingLeaves.entries()) {
      clearTimeout(pending.timeoutId);
      try {
        await this.sessionRepo.endSession({
          sessionId: pending.sessionId,
          endedAt: pending.leaveTime,
        });
        logger.info(`[tracker] Flushed pending leave for ${pending.userId}`);
      } catch (err) {
        logger.error(`[tracker] Failed to flush pending leave:`, err);
      }
    }
    this.pendingLeaves.clear();
  }
}
