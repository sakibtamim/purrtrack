import { pgTable, uuid, varchar, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

export const userBadges = pgTable(
  'user_badges',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    guildId: varchar('guild_id', { length: 32 }).notNull(),
    userId: varchar('user_id', { length: 32 }).notNull(),
    badgeId: varchar('badge_id', { length: 64 }).notNull(),
    unlockedAt: timestamp('unlocked_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('unique_user_guild_badge').on(table.guildId, table.userId, table.badgeId),
  ]
);

export type UserBadgeRow = typeof userBadges.$inferSelect;
export type NewUserBadgeRow = typeof userBadges.$inferInsert;
