import { and, eq } from 'drizzle-orm';
import { db, AppDatabase } from '../client.js';
import { userBadges, UserBadgeRow } from '../schema/user-badges.js';

export class UserBadgesRepository {
  constructor(private readonly database: AppDatabase = db) {}

  /**
   * Fetch all unlocked badges for a user in a guild
   */
  async getUserBadges(guildId: string, userId: string): Promise<UserBadgeRow[]> {
    return this.database
      .select()
      .from(userBadges)
      .where(and(eq(userBadges.guildId, guildId), eq(userBadges.userId, userId)))
      .orderBy(userBadges.unlockedAt);
  }

  /**
   * Check if user has unlocked a specific badge
   */
  async hasBadge(guildId: string, userId: string, badgeId: string): Promise<boolean> {
    const [found] = await this.database
      .select({ id: userBadges.id })
      .from(userBadges)
      .where(
        and(
          eq(userBadges.guildId, guildId),
          eq(userBadges.userId, userId),
          eq(userBadges.badgeId, badgeId)
        )
      )
      .limit(1);

    return Boolean(found);
  }

  /**
   * Unlock a badge for a user idempotently. Returns the created row if newly unlocked, null if already had it.
   */
  async unlockBadge(guildId: string, userId: string, badgeId: string): Promise<UserBadgeRow | null> {
    const [inserted] = await this.database
      .insert(userBadges)
      .values({
        guildId,
        userId,
        badgeId,
      })
      .onConflictDoNothing()
      .returning();

    return inserted || null;
  }

  /**
   * Unlock multiple badges, returning only the IDs that were newly unlocked
   */
  async unlockBadges(guildId: string, userId: string, badgeIds: string[]): Promise<string[]> {
    const newlyUnlocked: string[] = [];
    for (const badgeId of badgeIds) {
      const unlocked = await this.unlockBadge(guildId, userId, badgeId);
      if (unlocked) {
        newlyUnlocked.push(badgeId);
      }
    }
    return newlyUnlocked;
  }
}
