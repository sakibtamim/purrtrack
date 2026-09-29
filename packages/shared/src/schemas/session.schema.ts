import { z } from 'zod';
import { SessionStatus } from '../enums/index';
import { snowflakeSchema, uuidSchema } from './common.schema';

export const sessionMetadataSchema = z.object({
  mutedSeconds: z.number().int().nonnegative().default(0),
  deafenedSeconds: z.number().int().nonnegative().default(0),
  streamingSeconds: z.number().int().nonnegative().default(0),
  channelSwitches: z.number().int().nonnegative().default(0),
});

export type SessionMetadata = z.infer<typeof sessionMetadataSchema>;

export const voiceSessionSchema = z.object({
  id: uuidSchema,
  guildId: snowflakeSchema,
  userId: snowflakeSchema,
  initialChannelId: snowflakeSchema,
  startedAt: z.coerce.date(),
  endedAt: z.coerce.date().nullable(),
  durationSeconds: z.number().int().nonnegative().nullable(),
  status: z.nativeEnum(SessionStatus),
  metadata: sessionMetadataSchema,
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type VoiceSession = z.infer<typeof voiceSessionSchema>;

export const sessionSegmentSchema = z.object({
  id: uuidSchema,
  sessionId: uuidSchema,
  channelId: snowflakeSchema,
  channelName: z.string().nullable(),
  startedAt: z.coerce.date(),
  endedAt: z.coerce.date().nullable(),
  durationSeconds: z.number().int().nonnegative().nullable(),
  wasMuted: z.boolean().default(false),
  wasDeafened: z.boolean().default(false),
  wasStreaming: z.boolean().default(false),
});

export type SessionSegment = z.infer<typeof sessionSegmentSchema>;
