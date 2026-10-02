import { z } from 'zod';
import { ExportFormat, TimeRangePreset } from '../enums/index';
import { snowflakeSchema } from './common.schema';

export const reportQuerySchema = z.object({
  guildId: snowflakeSchema,
  userId: snowflakeSchema.optional(),
  channelId: snowflakeSchema.optional(),
  format: z.nativeEnum(ExportFormat).default(ExportFormat.EMBED),
  preset: z.nativeEnum(TimeRangePreset).default(TimeRangePreset.THIS_WEEK),
  customStartDate: z.string().datetime().optional(),
  customEndDate: z.string().datetime().optional(),
});

export type ReportQuery = z.infer<typeof reportQuerySchema>;

export const reportSessionItemSchema = z.object({
  id: z.string(),
  userId: z.string(),
  username: z.string(),
  displayName: z.string().optional(),
  channelId: z.string(),
  channelName: z.string(),
  startedAt: z.coerce.date(),
  endedAt: z.coerce.date(),
  durationSeconds: z.number().int().nonnegative(),
  durationFormatted: z.string(),
  status: z.string(),
});

export type ReportSessionItem = z.infer<typeof reportSessionItemSchema>;

export const topChannelItemSchema = z.object({
  channelId: z.string(),
  channelName: z.string(),
  durationSeconds: z.number().int().nonnegative(),
  durationFormatted: z.string(),
  sessionCount: z.number().int().nonnegative(),
});

export type TopChannelItem = z.infer<typeof topChannelItemSchema>;

export const topUserItemSchema = z.object({
  userId: z.string(),
  username: z.string(),
  displayName: z.string().optional(),
  durationSeconds: z.number().int().nonnegative(),
  durationFormatted: z.string(),
  sessionCount: z.number().int().nonnegative(),
});

export type TopUserItem = z.infer<typeof topUserItemSchema>;

export const aggregatedReportDataSchema = z.object({
  guildId: z.string(),
  guildName: z.string(),
  timezone: z.string().default("UTC"),
  targetUser: z
    .object({
      id: z.string(),
      username: z.string(),
      displayName: z.string().optional(),
    })
    .optional(),
  period: z.object({
    preset: z.nativeEnum(TimeRangePreset),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
  }),
  totalDurationSeconds: z.number().int().nonnegative(),
  totalDurationFormatted: z.string(),
  totalSessions: z.number().int().nonnegative(),
  uniqueActiveUsers: z.number().int().nonnegative(),
  topChannels: z.array(topChannelItemSchema),
  topUsers: z.array(topUserItemSchema).optional(),
  sessions: z.array(reportSessionItemSchema),
  contractorRate: z
    .object({
      hourlyRateCents: z.number().int().nonnegative(),
      hourlyRateFormatted: z.string(),
      currency: z.string(),
      totalPayableCents: z.number().int().nonnegative(),
      totalPayableFormatted: z.string(),
    })
    .optional(),
  manualAdjustments: z
    .object({
      netSeconds: z.number().int(),
      netFormatted: z.string(),
      count: z.number().int().nonnegative(),
    })
    .optional(),
});

export type AggregatedReportData = z.infer<typeof aggregatedReportDataSchema>;
