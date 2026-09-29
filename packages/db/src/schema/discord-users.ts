import { pgTable, varchar, timestamp } from 'drizzle-orm/pg-core';

export const discordUsers = pgTable('discord_users', {
  id: varchar('id', { length: 32 }).primaryKey(), // Discord Snowflake
  username: varchar('username', { length: 100 }).notNull(),
  globalName: varchar('global_name', { length: 100 }),
  avatarUrl: varchar('avatar_url', { length: 500 }),
  firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
});

export type DiscordUser = typeof discordUsers.$inferSelect;
export type NewDiscordUser = typeof discordUsers.$inferInsert;
