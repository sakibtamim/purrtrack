import { pgTable, uuid, varchar, timestamp, integer, boolean, index } from 'drizzle-orm/pg-core';
import { voiceSessions } from './voice-sessions';

export const sessionSegments = pgTable(
  'session_segments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => voiceSessions.id, { onDelete: 'cascade' }),
    channelId: varchar('channel_id', { length: 32 }).notNull(),
    channelName: varchar('channel_name', { length: 100 }),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    durationSeconds: integer('duration_seconds'),
    wasMuted: boolean('was_muted').notNull().default(false),
    wasDeafened: boolean('was_deafened').notNull().default(false),
    wasStreaming: boolean('was_streaming').notNull().default(false),
    wasVideo: boolean('was_video').notNull().default(false),
    isFocus: boolean('is_focus').notNull().default(false),
    focusTask: varchar('focus_task', { length: 255 }),
  },
  (table) => [
    index('session_segments_session_id_idx').on(table.sessionId),
    index('session_segments_channel_id_idx').on(table.channelId),
  ]
);

export type SessionSegmentRow = typeof sessionSegments.$inferSelect;
export type NewSessionSegmentRow = typeof sessionSegments.$inferInsert;
