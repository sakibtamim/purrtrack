import { pgTable, uuid, varchar, timestamp, integer, uniqueIndex } from 'drizzle-orm/pg-core';

export const userGoals = pgTable(
  'user_goals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    guildId: varchar('guild_id', { length: 32 }).notNull(),
    userId: varchar('user_id', { length: 32 }).notNull(),
    weeklyTargetSeconds: integer('weekly_target_seconds').notNull().default(72000), // Default 20 hours
    weekStartDay: varchar('week_start_day', { length: 16 }).notNull().default('monday'),
    currentStreakDays: integer('current_streak_days').notNull().default(0),
    lastActiveDate: varchar('last_active_date', { length: 10 }), // 'YYYY-MM-DD'
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('unique_user_guild_goal').on(table.guildId, table.userId),
  ]
);

export type UserGoalRow = typeof userGoals.$inferSelect;
export type NewUserGoalRow = typeof userGoals.$inferInsert;
