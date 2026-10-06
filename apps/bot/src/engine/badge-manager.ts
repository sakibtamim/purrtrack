import { Client } from 'discord.js';
import {
  VoiceSessionRepository,
  UserGoalsRepository,
  UserBadgesRepository,
} from '@purrtrack/db';
import { getBadge, renderBadgePill, resolveTimeRange, TimeRangePreset } from '@purrtrack/shared';
import { logger } from '../core/logger.js';

export interface EvaluateBadgeOptions {
  guildId: string;
  userId: string;
  channelId?: string;
  client?: Client;
  overtimeSeconds?: number;
  longestSprintSeconds?: number;
}

export class BadgeManager {
  constructor(
    private readonly sessionRepo: VoiceSessionRepository,
    private readonly goalsRepo: UserGoalsRepository,
    private readonly badgesRepo: UserBadgesRepository
  ) {}

  /**
   * Evaluate all locked badges against user activity metrics and unlock newly earned ones
   */
  async evaluateAndUnlock(options: EvaluateBadgeOptions): Promise<string[]> {
    const { guildId, userId, channelId, client } = options;

    try {
      const goal = await this.goalsRepo.getOrCreateGoal(guildId, userId);
      const lifetime = await this.sessionRepo.getUserLifetimeStats(guildId, userId);
      const existingBadges = await this.badgesRepo.getUserBadges(guildId, userId);
      const unlockedSet = new Set(existingBadges.map((b) => b.badgeId));

      const totalHours = lifetime.totalDurationSeconds / 3600;
      const streamHours = lifetime.totalStreamingSeconds / 3600;
      const cameraHours = lifetime.totalVideoSeconds / 3600;

      const candidates: string[] = [];

      // 1. Goals
      if (goal.hasActiveGoal) candidates.push('goal_starter');
      if (goal.completedGoalsCount >= 1) candidates.push('goal_crusher_1');
      if (goal.completedGoalsCount >= 5) candidates.push('goal_crusher_5');
      if ((options.overtimeSeconds ?? 0) >= 5 * 3600) candidates.push('goal_overtime');

      // 2. Streaks
      if (goal.currentStreakDays >= 3) candidates.push('streak_3');
      if (goal.currentStreakDays >= 7) candidates.push('streak_7');
      if (goal.currentStreakDays >= 14) candidates.push('streak_14');
      if (goal.currentStreakDays >= 30) candidates.push('streak_30');

      // 3. Lifetime Cumulative Voice Time
      if (totalHours >= 10) candidates.push('voice_10h');
      if (totalHours >= 50) candidates.push('voice_50h');
      if (totalHours >= 100) candidates.push('voice_100h');
      if (totalHours >= 250) candidates.push('voice_250h');
      if (totalHours >= 500) candidates.push('voice_500h');

      // 4. Focus Sprints
      if (goal.completedFocusSprints >= 1) candidates.push('focus_1');
      if (goal.completedFocusSprints >= 10) candidates.push('focus_10');
      if (goal.completedFocusSprints >= 50) candidates.push('focus_50');
      if ((options.longestSprintSeconds ?? 0) >= 7200 || lifetime.totalFocusSeconds >= 7200) {
        candidates.push('focus_marathon');
      }

      // 5. Collaboration & Media
      if (streamHours >= 1) candidates.push('stream_1h');
      if (streamHours >= 10) candidates.push('stream_10h');
      if (cameraHours >= 10) candidates.push('camera_10h');

      // 6. Special & Fun
      if (lifetime.nightHoursSeconds >= 5 * 3600) candidates.push('night_owl');
      if (lifetime.morningHoursSeconds >= 5 * 3600) candidates.push('early_bird');
      if (lifetime.weekendHoursSeconds >= 10 * 3600) candidates.push('weekend_warrior');

      // Filter only badges not yet unlocked
      const newlyEligible = candidates.filter((badgeId) => !unlockedSet.has(badgeId));
      if (newlyEligible.length === 0) {
        return [];
      }

      const newlyUnlocked = await this.badgesRepo.unlockBadges(guildId, userId, newlyEligible);

      if (newlyUnlocked.length > 0) {
        logger.info(
          `🏅 [badges] User ${userId} unlocked ${newlyUnlocked.length} badge(s): ${newlyUnlocked.join(', ')}`
        );

        // Optional celebration message in channel
        if (channelId && client) {
          try {
            const channel =
              client.channels.cache.get(channelId) ||
              (await client.channels.fetch(channelId).catch(() => null));
            if (channel?.isTextBased() && 'send' in channel) {
              const pills = newlyUnlocked
                .map((id) => renderBadgePill(id))
                .filter(Boolean)
                .join(' ');

              await channel.send({
                content: `🎉 **Achievement Unlocked!** <@${userId}> earned ${pills}! Equip it as your title with \`/profile equip\`!`,
              });
            }
          } catch (err) {
            logger.warn(`Failed to post badge unlock announcement: ${String(err)}`);
          }
        }
      }

      return newlyUnlocked;
    } catch (error) {
      logger.error(`Error evaluating badges for user ${userId}: ${String(error)}`);
      return [];
    }
  }

  /**
   * Evaluate and award monthly champion badges for the concluded month (LAST_MONTH).
   * Top 3 in voice duration receive:
   * Rank 1 -> monthly_champion_1st (🥇 Monthly Champion)
   * Rank 2 -> monthly_champion_2nd (🥈 Monthly Runner-Up)
   * Rank 3 -> monthly_champion_3rd (🥉 Monthly Podium)
   */
  async evaluateMonthlyChampions(
    guildId: string,
    guildName: string = 'Server',
    timezone: string = 'UTC',
    customRange?: { startDate: Date; endDate: Date }
  ): Promise<{
    awarded: { userId: string; username: string; badgeId: string; rank: number; durationSeconds: number }[];
    report: any;
  }> {
    try {
      const { startDate, endDate } = customRange || resolveTimeRange(
        TimeRangePreset.LAST_MONTH,
        undefined,
        undefined,
        'monday',
        timezone
      );
      const report = await this.sessionRepo.getAggregatedReport({
        guildId,
        guildName,
        startDate,
        endDate,
        preset: TimeRangePreset.LAST_MONTH,
      });

      const topUsers = report.topUsers || [];
      const championBadges = [
        'monthly_champion_1st',
        'monthly_champion_2nd',
        'monthly_champion_3rd',
      ];

      const awarded: { userId: string; username: string; badgeId: string; rank: number; durationSeconds: number }[] = [];

      for (let i = 0; i < Math.min(3, topUsers.length); i++) {
        const u = topUsers[i];
        if (u.durationSeconds <= 0) continue;
        const badgeId = championBadges[i];
        const unlocked = await this.badgesRepo.unlockBadge(guildId, u.userId, badgeId);
        if (unlocked) {
          logger.info(
            `🏆 [badges] Awarded ${badgeId} to Monthly Champion (Rank #${i + 1}) @${u.username} (${u.userId}) in guild ${guildId}`
          );
        }
        awarded.push({
          userId: u.userId,
          username: u.username,
          badgeId,
          rank: i + 1,
          durationSeconds: u.durationSeconds,
        });
      }

      return { awarded, report };
    } catch (error) {
      logger.error(`Error evaluating monthly champions for guild ${guildId}: ${String(error)}`);
      return { awarded: [], report: null };
    }
  }
}
