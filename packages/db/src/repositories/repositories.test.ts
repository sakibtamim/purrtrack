import { describe, it, expect, beforeAll } from 'vitest';
import { VoiceSessionRepository } from './voice-session-repository';
import { GuildSettingsRepository } from './guild-settings-repository';
import { SessionStatus, TimeRangePreset } from '@purrtrack/shared';

describe('PostgreSQL Repositories Integration Suite', () => {
  const sessionRepo = new VoiceSessionRepository();
  const settingsRepo = new GuildSettingsRepository();

  const testGuildId = `guild_${Date.now()}`;
  const testUserId = `user_${Date.now()}`;
  const testChannel1 = '555666777888999000';
  const testChannel2 = '444555666777888999';

  it('GuildSettings: returns default settings and persists updates', async () => {
    const settings = await settingsRepo.getSettings(testGuildId);
    expect(settings).toBeDefined();
    expect(settings.guildId).toBe(testGuildId);
    expect(settings.trackingEnabled).toBe(true);
    expect(settings.excludeAfk).toBe(true);

    const updated = await settingsRepo.updateSettings(testGuildId, {
      excludeAfk: false,
      timezone: 'America/New_York',
    });
    expect(updated.excludeAfk).toBe(false);
    expect(updated.timezone).toBe('America/New_York');
  });

  it('VoiceSession: starts session, records user, and enforces partial unique constraint', async () => {
    await sessionRepo.upsertUser(testUserId, 'persian_cat', 'Persian Cat');
    await sessionRepo.upsertChannel(testChannel1, testGuildId, 'Lounge');

    const start1 = await sessionRepo.startSession({
      guildId: testGuildId,
      userId: testUserId,
      channelId: testChannel1,
      channelName: 'Lounge',
    });

    expect(start1.session.id).toBeDefined();
    expect(start1.session.status).toBe(SessionStatus.ACTIVE);
    expect(start1.segment.channelName).toBe('Lounge');

    // Concurrency defense check: calling startSession while active returns the existing session
    const start2 = await sessionRepo.startSession({
      guildId: testGuildId,
      userId: testUserId,
      channelId: testChannel1,
      channelName: 'Lounge',
    });
    expect(start2.session.id).toBe(start1.session.id);
  });

  it('VoiceSession: switches channel and creates a new segment', async () => {
    const active = await sessionRepo.getActiveSession(testGuildId, testUserId);
    expect(active).toBeDefined();

    const newSeg = await sessionRepo.switchChannel({
      sessionId: active!.id,
      newChannelId: testChannel2,
      newChannelName: 'Gaming',
    });

    expect(newSeg.channelId).toBe(testChannel2);
    expect(newSeg.channelName).toBe('Gaming');
  });

  it('VoiceSession: ends session and calculates duration', async () => {
    const active = await sessionRepo.getActiveSession(testGuildId, testUserId);
    expect(active).toBeDefined();

    const endedAt = new Date(Date.now() + 60000); // 60s later
    const finalized = await sessionRepo.endSession({
      sessionId: active!.id,
      endedAt,
    });

    expect(finalized).toBeDefined();
    expect(finalized!.status).toBe(SessionStatus.COMPLETED);
    expect(finalized!.durationSeconds).toBeGreaterThanOrEqual(0);
  });

  it('Startup Reconciler: heals abandoned active sessions', async () => {
    // Start an abandoned session
    const abandoned = await sessionRepo.startSession({
      guildId: testGuildId,
      userId: 'abandoned_user_1',
      channelId: testChannel1,
      channelName: 'Ghost Channel',
    });

    // Active connected users map: empty (meaning abandoned_user_1 is no longer in voice)
    const activeConnectedMap = new Map<string, Set<string>>();
    activeConnectedMap.set(testGuildId, new Set());

    const healedCount = await sessionRepo.healAbandonedSessions(activeConnectedMap);
    expect(healedCount).toBeGreaterThanOrEqual(1);

    const healedSession = await sessionRepo.getActiveSession(testGuildId, 'abandoned_user_1');
    expect(healedSession).toBeNull(); // No longer active!
  });

  it('Aggregated Report: calculates totals across saved sessions', async () => {
    const report = await sessionRepo.getAggregatedReport({
      guildId: testGuildId,
      guildName: 'Test Guild',
      startDate: new Date(Date.now() - 3600000),
      endDate: new Date(Date.now() + 3600000),
      preset: TimeRangePreset.TODAY,
    });

    expect(report.guildId).toBe(testGuildId);
    expect(report.totalSessions).toBeGreaterThanOrEqual(1);
    expect(report.totalDurationFormatted).toBeDefined();
    expect(report.sessions.length).toBeGreaterThanOrEqual(1);
  });

  it('GuildSettings: adds and removes ignored channels', async () => {
    const channelToIgnore = 'test_ignore_voice_123';
    const updated = await settingsRepo.addIgnoredChannel(testGuildId, channelToIgnore);
    expect(updated.ignoredChannelIds).toContain(channelToIgnore);

    const restored = await settingsRepo.removeIgnoredChannel(testGuildId, channelToIgnore);
    expect(restored.ignoredChannelIds).not.toContain(channelToIgnore);
  });

  it('VoiceSession: transitions in-channel media state (screen share & camera)', async () => {
    const userMediaTest = `user_media_${Date.now()}`;
    const startResult = await sessionRepo.startSession({
      guildId: testGuildId,
      userId: userMediaTest,
      channelId: testChannel1,
      channelName: 'Meeting Room',
      wasStreaming: false,
      wasVideo: false,
    });

    expect(startResult.segment.wasStreaming).toBe(false);
    expect(startResult.segment.wasVideo).toBe(false);

    // Toggle camera & screen share ON
    const transitioned = await sessionRepo.transitionState({
      sessionId: startResult.session.id,
      wasStreaming: true,
      wasVideo: true,
      wasMuted: false,
      wasDeafened: false,
    });

    expect(transitioned).toBeDefined();
    expect(transitioned!.wasStreaming).toBe(true);
    expect(transitioned!.wasVideo).toBe(true);
    expect(transitioned!.channelId).toBe(testChannel1);

    // Clean up session
    await sessionRepo.endSession({ sessionId: startResult.session.id });
  });
});
