import { and, eq, sql } from 'drizzle-orm';
import { db, AppDatabase } from '../client.js';
import { userGoals, UserGoalRow } from '../schema/user-goals.js';
import { voiceSessions } from '../schema/voice-sessions.js';

export interface SetGoalParams {
  guildId: string;
  userId: string;
  targetHours?: number;
  weekStartDay?: string;
  cycleStartDate?: Date;
}

export class UserGoalsRepository {
  constructor(private readonly database: AppDatabase = db) {}

  /**
   * Fetch user goal for a guild
   */
  async getGoal(guildId: string, userId: string): Promise<UserGoalRow | null> {
    const [goal] = await this.database
      .select()
      .from(userGoals)
      .where(and(eq(userGoals.guildId, guildId), eq(userGoals.userId, userId)))
      .limit(1);

    return goal || null;
  }

  /**
   * Fetch user goal or initialize default (20h weekly target, monday start)
   */
  async getOrCreateGoal(
    guildId: string,
    userId: string,
    defaultWeeklyHours: number = 20,
    defaultWeekStart: string = 'monday'
  ): Promise<UserGoalRow> {
    const existing = await this.getGoal(guildId, userId);
    if (existing) {
      return existing;
    }

    const defaultSeconds = Math.max(1, defaultWeeklyHours) * 3600;
    const [created] = await this.database
      .insert(userGoals)
      .values({
        guildId,
        userId,
        weeklyTargetSeconds: defaultSeconds,
        weekStartDay: defaultWeekStart.toLowerCase(),
        currentStreakDays: 0,
        hasActiveGoal: false,
      })
      .onConflictDoUpdate({
        target: [userGoals.guildId, userGoals.userId],
        set: {
          updatedAt: new Date(),
        },
      })
      .returning();

    return created;
  }

  /**
   * Set or update weekly goal target hours and/or week start day
   */
  async setGoal(params: SetGoalParams): Promise<UserGoalRow> {
    const { guildId, userId, targetHours, weekStartDay, cycleStartDate } = params;
    await this.getOrCreateGoal(guildId, userId);

    const updateSet: Record<string, any> = {
      hasActiveGoal: true,
      updatedAt: new Date(),
    };

    if (targetHours !== undefined) {
      const clampedHours = Math.max(1, Math.min(168, Math.round(targetHours)));
      updateSet.weeklyTargetSeconds = clampedHours * 3600;
    }

    if (weekStartDay !== undefined) {
      updateSet.weekStartDay = weekStartDay.toLowerCase();
    }

    if (cycleStartDate !== undefined) {
      updateSet.cycleStartDate = cycleStartDate;
    }

    const [updated] = await this.database
      .update(userGoals)
      .set(updateSet)
      .where(and(eq(userGoals.guildId, guildId), eq(userGoals.userId, userId)))
      .returning();

    return updated;
  }

  /**
   * Reset or cancel active weekly goal
   */
  async resetGoal(guildId: string, userId: string): Promise<UserGoalRow | null> {
    const [updated] = await this.database
      .update(userGoals)
      .set({
        hasActiveGoal: false,
        updatedAt: new Date(),
      })
      .where(and(eq(userGoals.guildId, guildId), eq(userGoals.userId, userId)))
      .returning();

    return updated || null;
  }

  /**
   * Set or update weekly goal target in hours (1h - 168h) with optional week start day
   */
  async setWeeklyTarget(
    guildId: string,
    userId: string,
    targetHours: number,
    weekStartDay?: string,
    cycleStartDate?: Date
  ): Promise<UserGoalRow> {
    return this.setGoal({ guildId, userId, targetHours, weekStartDay, cycleStartDate });
  }

  /**
   * Record activity and update daily streak
   */
  async recordActivityAndStreak(
    guildId: string,
    userId: string,
    referenceDate: Date = new Date()
  ): Promise<UserGoalRow> {
    const goal = await this.getOrCreateGoal(guildId, userId);

    const todayStr = referenceDate.toISOString().slice(0, 10);
    const yesterday = new Date(referenceDate.getTime() - 24 * 60 * 60 * 1000);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);

    let streak = goal.currentStreakDays || 0;

    if (goal.lastActiveDate === todayStr) {
      // Already active today; streak remains unchanged
      return goal;
    } else if (goal.lastActiveDate === yesterdayStr) {
      // Active yesterday; streak increments
      streak += 1;
    } else {
      // Streak broken or starting fresh; check historical sessions if streak was 0
      const historicalStreak = await this.calculateHistoricalStreak(guildId, userId, referenceDate);
      streak = historicalStreak > 0 ? historicalStreak : 1;
    }

    const [updated] = await this.database
      .update(userGoals)
      .set({
        currentStreakDays: streak,
        lastActiveDate: todayStr,
        updatedAt: new Date(),
      })
      .where(and(eq(userGoals.guildId, guildId), eq(userGoals.userId, userId)))
      .returning();

    return updated;
  }

  /**
   * Calculate consecutive active days from historical voice sessions
   */
  async calculateHistoricalStreak(
    guildId: string,
    userId: string,
    referenceDate: Date = new Date()
  ): Promise<number> {
    const sessions = await this.database
      .select({
        startedAt: voiceSessions.startedAt,
      })
      .from(voiceSessions)
      .where(and(eq(voiceSessions.guildId, guildId), eq(voiceSessions.userId, userId)))
      .orderBy(sql`${voiceSessions.startedAt} DESC`)
      .limit(100);

    if (sessions.length === 0) return 0;

    const uniqueDays = new Set<string>();
    for (const s of sessions) {
      uniqueDays.add(new Date(s.startedAt).toISOString().slice(0, 10));
    }

    const todayStr = referenceDate.toISOString().slice(0, 10);
    const yesterdayStr = new Date(referenceDate.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    let checkDate: Date;
    if (uniqueDays.has(todayStr)) {
      checkDate = new Date(referenceDate);
    } else if (uniqueDays.has(yesterdayStr)) {
      checkDate = new Date(referenceDate.getTime() - 24 * 60 * 60 * 1000);
    } else {
      return 0;
    }

    let streak = 0;
    while (true) {
      const dayStr = checkDate.toISOString().slice(0, 10);
      if (uniqueDays.has(dayStr)) {
        streak++;
        checkDate = new Date(checkDate.getTime() - 24 * 60 * 60 * 1000);
      } else {
        break;
      }
    }

    return streak;
  }
}
