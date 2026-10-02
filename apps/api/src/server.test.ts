import { describe, it, expect, afterAll } from 'vitest';
import { buildServer } from './server.js';
import { APP_VERSION } from '@purrtrack/shared';

describe('Fastify REST API Server', () => {
  const mockSessionRepo = {} as any;
  const mockSettingsRepo = {} as any;
  const server = buildServer({
    sessionRepo: mockSessionRepo,
    settingsRepo: mockSettingsRepo,
  });

  afterAll(async () => {
    await server.close();
  });

  it('GET /health returns healthy status and current APP_VERSION', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.status).toBe('healthy');
    expect(body.version).toBe(APP_VERSION);
    expect(body.version).toBe('1.0.0');
    expect(body.service).toBe('purrtrack-api');
    expect(typeof body.uptime).toBe('number');
    expect(typeof body.timestamp).toBe('string');
  });
});
