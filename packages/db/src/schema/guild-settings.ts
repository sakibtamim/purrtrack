import { pgTable, varchar, boolean, integer, jsonb, timestamp } from 'drizzle-orm/pg-core';

export const guildSettings = pgTable('guild_settings', {
  guildId: varchar('guild_id', { length: 32 }).primaryKey(),
  trackingEnabled: boolean('tracking_enabled').notNull().default(true),
  trackMuted: boolean('track_muted').notNull().default(true),
  trackDeafened: boolean('track_deafened').notNull().default(false),
  trackStreaming: boolean('track_streaming').notNull().default(true),
  trackCamera: boolean('track_camera').notNull().default(true),
  excludeAfk: boolean('exclude_afk').notNull().default(true),
  minDurationSeconds: integer('min_duration_seconds').notNull().default(10),
  timezone: varchar('timezone', { length: 50 }).notNull().default('UTC'),
  maxInactiveMinutes: integer('max_inactive_minutes').notNull().default(0),
  ignoredChannelIds: jsonb('ignored_channel_ids').$type<string[]>().default([]),
  adminRoleIds: jsonb('admin_role_ids').$type<string[]>().default([]),
  announceChannelId: varchar('announce_channel_id', { length: 32 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type GuildSetting = typeof guildSettings.$inferSelect;
export type NewGuildSetting = typeof guildSettings.$inferInsert;
