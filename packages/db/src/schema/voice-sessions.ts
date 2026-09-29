import { pgTable, uuid, varchar, timestamp, integer, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { SessionStatus } from '@purrtrack/shared';

export const voiceSessions = pgTable(
  'voice_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    guildId: varchar('guild_id', { length: 32 }).notNull(),
    userId: varchar('user_id', { length: 32 }).notNull(),
    initialChannelId: varchar('initial_channel_id', { length: 32 }).notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    durationSeconds: integer('duration_seconds'),
    status: varchar('status', { length: 32 }).notNull().default(SessionStatus.ACTIVE),
    metadata: jsonb('metadata')
      .$type<{
        mutedSeconds: number;
        deafenedSeconds: number;
        streamingSeconds: number;
        channelSwitches: number;
      }>()
      .default({ mutedSeconds: 0, deafenedSeconds: 0, streamingSeconds: 0, channelSwitches: 0 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('voice_sessions_guild_user_idx').on(table.guildId, table.userId),
    index('voice_sessions_started_at_idx').on(table.startedAt),
    index('voice_sessions_status_idx').on(table.status),
    // 100% Invariant: PostgreSQL Partial Unique Index guaranteeing only ONE active session per user per guild!
    uniqueIndex('unique_active_user_guild_session')
      .on(table.guildId, table.userId)
      .where(sql`status = 'ACTIVE'`),
  ]
);

export type VoiceSessionRow = typeof voiceSessions.$inferSelect;
export type NewVoiceSessionRow = typeof voiceSessions.$inferInsert;
