import { pgTable, varchar, boolean, timestamp } from 'drizzle-orm/pg-core';

export const voiceChannels = pgTable('voice_channels', {
  id: varchar('id', { length: 32 }).primaryKey(), // Discord Channel Snowflake
  guildId: varchar('guild_id', { length: 32 }).notNull(),
  name: varchar('name', { length: 100 }).notNull(),
  isAfk: boolean('is_afk').notNull().default(false),
  lastActivityAt: timestamp('last_activity_at', { withTimezone: true }).notNull().defaultNow(),
});

export type VoiceChannel = typeof voiceChannels.$inferSelect;
export type NewVoiceChannel = typeof voiceChannels.$inferInsert;
