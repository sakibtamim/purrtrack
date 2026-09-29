import { z } from 'zod';
import { snowflakeSchema } from './common.schema';

export const guildSettingsSchema = z.object({
  guildId: snowflakeSchema,
  trackingEnabled: z.boolean().default(true),
  trackMuted: z.boolean().default(true),
  trackDeafened: z.boolean().default(false),
  excludeAfk: z.boolean().default(true),
  minDurationSeconds: z.number().int().min(0).max(3600).default(10),
  timezone: z.string().default('UTC'),
  ignoredChannelIds: z.array(snowflakeSchema).default([]),
  adminRoleIds: z.array(snowflakeSchema).default([]),
  announceChannelId: snowflakeSchema.nullable().optional(),
  updatedAt: z.coerce.date().optional(),
});

export type GuildSettings = z.infer<typeof guildSettingsSchema>;
