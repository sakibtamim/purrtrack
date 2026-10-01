import { Client, TextChannel, User } from 'discord.js';
import { VoiceSessionRepository } from '@purrtrack/db';
import { formatDuration } from '@purrtrack/shared';
import { logger } from '../core/logger.js';

export interface StartFocusOptions {
  guildId: string;
  userId: string;
  textChannelId: string;
  workMinutes?: number;
  breakMinutes?: number;
  task?: string;
  client: Client;
}

export interface ActiveFocusSession {
  guildId: string;
  userId: string;
  textChannelId: string;
  workMinutes: number;
  breakMinutes: number;
  task: string;
  phase: 'work' | 'break';
  startedAt: Date;
  phaseEndsAt: Date;
  timer?: NodeJS.Timeout;
}

export class FocusManager {
  private activeFocus = new Map<string, ActiveFocusSession>();

  constructor(private readonly sessionRepo: VoiceSessionRepository) {}

  private getKey(guildId: string, userId: string): string {
    return `${guildId}:${userId}`;
  }

  /**
   * Get active focus session if running
   */
  getFocus(guildId: string, userId: string): ActiveFocusSession | null {
    return this.activeFocus.get(this.getKey(guildId, userId)) || null;
  }

  /**
   * Start a new Pomodoro focus session
   */
  async startFocus(options: StartFocusOptions): Promise<ActiveFocusSession> {
    const { guildId, userId, textChannelId, client } = options;
    const workMinutes = Math.max(1, Math.min(180, options.workMinutes ?? 25));
    const breakMinutes = Math.max(0, Math.min(60, options.breakMinutes ?? 5));
    const task = options.task?.trim() || 'Deep Work';

    // Clear any existing focus
    this.stopFocus(guildId, userId, false);

    // Update active DB segment
    const activeSession = await this.sessionRepo.getActiveSession(guildId, userId);
    if (activeSession) {
      await this.sessionRepo.setSegmentFocus(activeSession.id, true, task);
    }

    const startedAt = new Date();
    const phaseEndsAt = new Date(startedAt.getTime() + workMinutes * 60 * 1000);

    const session: ActiveFocusSession = {
      guildId,
      userId,
      textChannelId,
      workMinutes,
      breakMinutes,
      task,
      phase: 'work',
      startedAt,
      phaseEndsAt,
    };

    const timer = setTimeout(async () => {
      await this.handleWorkCompleted(session, client);
    }, workMinutes * 60 * 1000);

    session.timer = timer;
    this.activeFocus.set(this.getKey(guildId, userId), session);

    logger.info(`🎯 [focus] Started ${workMinutes}m focus sprint on "${task}" for user ${userId} in ${guildId}`);
    return session;
  }

  /**
   * Handle work sprint completion and transition to break
   */
  private async handleWorkCompleted(session: ActiveFocusSession, client: Client): Promise<void> {
    const { guildId, userId, textChannelId, workMinutes, breakMinutes, task } = session;

    // Notify user in text channel or via DM
    await this.sendNotification(
      client,
      textChannelId,
      userId,
      `⏰ **Focus Sprint Complete!** Great work, <@${userId}>! You crushed a **${workMinutes}m** sprint on *"${task}"*.` +
        (breakMinutes > 0
          ? ` Take a **${breakMinutes}m** break! ☕`
          : ` Ready for your next session?`)
    );

    if (breakMinutes <= 0) {
      this.stopFocus(guildId, userId, true);
      return;
    }

    // Switch to break phase
    session.phase = 'break';
    const breakStartedAt = new Date();
    session.phaseEndsAt = new Date(breakStartedAt.getTime() + breakMinutes * 60 * 1000);

    // Unset focus flag during break
    const activeSession = await this.sessionRepo.getActiveSession(guildId, userId);
    if (activeSession) {
      await this.sessionRepo.setSegmentFocus(activeSession.id, false);
    }

    session.timer = setTimeout(async () => {
      await this.handleBreakCompleted(session, client);
    }, breakMinutes * 60 * 1000);
  }

  /**
   * Handle break completion
   */
  private async handleBreakCompleted(session: ActiveFocusSession, client: Client): Promise<void> {
    const { guildId, userId, textChannelId, breakMinutes } = session;

    await this.sendNotification(
      client,
      textChannelId,
      userId,
      `⚡ **Break Over!** Your **${breakMinutes}m** break is complete, <@${userId}>. Use \`/focus start\` whenever you're ready for your next sprint! 🚀`
    );

    this.stopFocus(guildId, userId, true);
  }

  /**
   * Stop active focus session
   */
  async stopFocus(guildId: string, userId: string, updateDb: boolean = true): Promise<ActiveFocusSession | null> {
    const key = this.getKey(guildId, userId);
    const existing = this.activeFocus.get(key);

    if (!existing) return null;

    if (existing.timer) {
      clearTimeout(existing.timer);
    }

    this.activeFocus.delete(key);

    if (updateDb) {
      try {
        const activeSession = await this.sessionRepo.getActiveSession(guildId, userId);
        if (activeSession) {
          await this.sessionRepo.setSegmentFocus(activeSession.id, false);
        }
      } catch (err) {
        logger.error(`[focus] Error updating segment focus status on stop:`, err);
      }
    }

    logger.info(`⏹️ [focus] Stopped focus session for user ${userId} in ${guildId}`);
    return existing;
  }

  /**
   * Helper to send notification to text channel or fallback to DM
   */
  private async sendNotification(client: Client, channelId: string, userId: string, content: string): Promise<void> {
    try {
      const channel = await client.channels.fetch(channelId).catch(() => null);
      if (channel && channel.isSendable()) {
        await channel.send({ content });
        return;
      }

      // Fallback: send DM to user
      const user = await client.users.fetch(userId).catch(() => null);
      if (user) {
        await user.send({ content }).catch(() => {});
      }
    } catch (err) {
      logger.warn(`[focus] Could not deliver notification to channel ${channelId} or user ${userId}:`, err);
    }
  }
}
