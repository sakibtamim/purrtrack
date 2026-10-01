import { pgTable, uuid, varchar, integer, timestamp, index } from 'drizzle-orm/pg-core';

export const timeAdjustments = pgTable(
  'time_adjustments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    guildId: varchar('guild_id', { length: 32 }).notNull(),
    userId: varchar('user_id', { length: 32 }).notNull(),
    adjustedByUserId: varchar('adjusted_by_user_id', { length: 32 }).notNull(),
    type: varchar('type', { length: 10 }).notNull(), // 'ADD' | 'SUBTRACT'
    durationSeconds: integer('duration_seconds').notNull(),
    reason: varchar('reason', { length: 255 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_time_adj_guild_user').on(table.guildId, table.userId),
  ]
);

export type TimeAdjustmentRow = typeof timeAdjustments.$inferSelect;
export type InsertTimeAdjustment = typeof timeAdjustments.$inferInsert;
