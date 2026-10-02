import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { VoiceSessionRepository, GuildSettingsRepository } from '@purrtrack/db';
import { TimeRangePreset, APP_VERSION } from '@purrtrack/shared';

export interface ServerOptions {
  sessionRepo?: VoiceSessionRepository;
  settingsRepo?: GuildSettingsRepository;
}

export function buildServer(options: ServerOptions = {}): FastifyInstance {
  const server = Fastify({
    logger: {
      level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    },
  });

  server.register(cors, {
    origin: '*',
  });

  const sessionRepo = options.sessionRepo || new VoiceSessionRepository();
  const settingsRepo = options.settingsRepo || new GuildSettingsRepository();

  // 1. Health check endpoint (matches sunshine-physio and purrmission)
  server.get('/health', async () => {
    return {
      status: 'healthy',
      version: APP_VERSION,
      timestamp: new Date().toISOString(),
      service: 'purrtrack-api',
      uptime: process.uptime(),
    };
  });

  // 2. Guild settings endpoint
  server.get('/guilds/:guildId/settings', async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const settings = await settingsRepo.getSettings(guildId);
    return { success: true, data: settings };
  });

  // 3. User report summary query
  server.get('/guilds/:guildId/reports/user/:userId', async (request, reply) => {
    const { guildId, userId } = request.params as { guildId: string; userId: string };
    const { preset = TimeRangePreset.THIS_WEEK } = request.query as { preset?: TimeRangePreset };

    const now = new Date();
    const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // default last 7 days

    const report = await sessionRepo.getAggregatedReport({
      guildId,
      guildName: 'Discord Server',
      userId,
      startDate,
      endDate: now,
      preset: preset as TimeRangePreset,
    });

    return { success: true, data: report };
  });

  return server;
}
