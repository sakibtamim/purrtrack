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

  it('VoiceSession: sets focus mode and task on active segment', async () => {
    const userFocusTest = `user_focus_${Date.now()}`;
    const startResult = await sessionRepo.startSession({
      guildId: testGuildId,
      userId: userFocusTest,
      channelId: testChannel1,
      channelName: 'Study Hall',
    });

    const focused = await sessionRepo.setSegmentFocus(startResult.session.id, true, 'Deep Work on API');
    expect(focused).toBeDefined();
    expect(focused!.isFocus).toBe(true);
    expect(focused!.focusTask).toBe('Deep Work on API');

    const unfocused = await sessionRepo.setSegmentFocus(startResult.session.id, false);
    expect(unfocused).toBeDefined();
    expect(unfocused!.isFocus).toBe(false);
    expect(unfocused!.focusTask).toBeNull();

    await sessionRepo.endSession({ sessionId: startResult.session.id });
  });

  it('UserGoals: manages goals, weekly targets, and daily streaks', async () => {
    const { UserGoalsRepository } = await import('./user-goals-repository.js');
    const goalsRepo = new UserGoalsRepository();
    const userGoalTest = `user_goal_${Date.now()}`;

    // Default goal creation
    const defaultGoal = await goalsRepo.getOrCreateGoal(testGuildId, userGoalTest);
    expect(defaultGoal.weeklyTargetSeconds).toBe(72000); // 20 hours
    expect(defaultGoal.weekStartDay).toBe('monday');
    expect(defaultGoal.currentStreakDays).toBe(0);
    expect(defaultGoal.hasActiveGoal).toBe(false);

    // Update target to 30 hours and week start to saturday
    const cycleStart = new Date('2026-10-01T00:00:00Z');
    const updated = await goalsRepo.setGoal({
      guildId: testGuildId,
      userId: userGoalTest,
      targetHours: 30,
      weekStartDay: 'saturday',
      cycleStartDate: cycleStart,
    });
    expect(updated.weeklyTargetSeconds).toBe(30 * 3600);
    expect(updated.weekStartDay).toBe('saturday');
    expect(updated.hasActiveGoal).toBe(true);
    expect(updated.cycleStartDate).toBeDefined();

    // Reset goal
    const reset = await goalsRepo.resetGoal(testGuildId, userGoalTest);
    expect(reset).toBeDefined();
    expect(reset!.hasActiveGoal).toBe(false);

    // Reactivate goal
    await goalsRepo.setGoal({
      guildId: testGuildId,
      userId: userGoalTest,
      targetHours: 25,
    });

    // Record activity today
    const now = new Date();
    const withActivity = await goalsRepo.recordActivityAndStreak(testGuildId, userGoalTest, now);
    expect(withActivity.currentStreakDays).toBeGreaterThanOrEqual(1);
    expect(withActivity.lastActiveDate).toBe(now.toISOString().slice(0, 10));

    // Calling recordActivityAndStreak on same day preserves streak
    const sameDay = await goalsRepo.recordActivityAndStreak(testGuildId, userGoalTest, now);
    expect(sameDay.currentStreakDays).toBe(withActivity.currentStreakDays);

    // Calling on next day increments streak
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const nextDay = await goalsRepo.recordActivityAndStreak(testGuildId, userGoalTest, tomorrow);
    expect(nextDay.currentStreakDays).toBe(withActivity.currentStreakDays + 1);

    // Equip and unequip showcase badges
    const equipped = await goalsRepo.equipBadge(testGuildId, userGoalTest, 'streak_7', 1);
    expect(equipped.equippedBadgeIds[0]).toBe('streak_7');

    const equipped2 = await goalsRepo.equipBadge(testGuildId, userGoalTest, 'goal_crusher_1', 2);
    expect(equipped2.equippedBadgeIds[1]).toBe('goal_crusher_1');

    const unequipped = await goalsRepo.unequipBadge(testGuildId, userGoalTest, 2);
    expect(unequipped.equippedBadgeIds[1]).toBe('');

    // Counter increments
    const withGoalsInc = await goalsRepo.incrementCompletedGoals(testGuildId, userGoalTest);
    expect(withGoalsInc.completedGoalsCount).toBe(1);

    const withFocusInc = await goalsRepo.incrementCompletedFocusSprints(testGuildId, userGoalTest);
    expect(withFocusInc.completedFocusSprints).toBe(1);
  });

  it('UserBadges: unlocks and retrieves user badges idempotently', async () => {
    const { UserBadgesRepository } = await import('./user-badges-repository.js');
    const badgesRepo = new UserBadgesRepository();
    const testUser = `badge_user_${Date.now()}`;

    // Initially has no badges
    const initialBadges = await badgesRepo.getUserBadges(testGuildId, testUser);
    expect(initialBadges.length).toBe(0);
    expect(await badgesRepo.hasBadge(testGuildId, testUser, 'streak_7')).toBe(false);

    // Unlock a badge
    const unlocked = await badgesRepo.unlockBadge(testGuildId, testUser, 'streak_7');
    expect(unlocked).toBeDefined();
    expect(unlocked?.badgeId).toBe('streak_7');
    expect(await badgesRepo.hasBadge(testGuildId, testUser, 'streak_7')).toBe(true);

    // Unlocking same badge again returns null (idempotent)
    const duplicate = await badgesRepo.unlockBadge(testGuildId, testUser, 'streak_7');
    expect(duplicate).toBeNull();

    // Batch unlock
    const batch = await badgesRepo.unlockBadges(testGuildId, testUser, ['streak_7', 'goal_crusher_1', 'voice_100h']);
    expect(batch).toEqual(['goal_crusher_1', 'voice_100h']); // streak_7 was already unlocked

    const allBadges = await badgesRepo.getUserBadges(testGuildId, testUser);
    expect(allBadges.length).toBe(3);
  });


  it('VoiceSessionRepository: getUserLifetimeStats computes live streaming and total media time for active sessions', async () => {
    const liveUser = `live_stream_user_${Date.now()}`;
    await sessionRepo.upsertUser(liveUser, 'live_stream', 'Live Stream');
    await sessionRepo.upsertChannel(testChannel1, testGuildId, 'Live Stream Channel');

    // Start active session 10 seconds ago
    const startedAt = new Date(Date.now() - 10000);
    const { session } = await sessionRepo.startSession({
      guildId: testGuildId,
      userId: liveUser,
      channelId: testChannel1,
      channelName: 'Live Stream Channel',
      startedAt,
      wasStreaming: true,
      wasVideo: false,
    });

    const stats = await sessionRepo.getUserLifetimeStats(testGuildId, liveUser);
    expect(stats.totalDurationSeconds).toBeGreaterThanOrEqual(10);
    expect(stats.totalStreamingSeconds).toBeGreaterThanOrEqual(10);
    expect(stats.totalMediaSeconds).toBeGreaterThanOrEqual(10);
    expect(stats.totalVideoSeconds).toBe(0);

    // End session
    await sessionRepo.endSession({
      sessionId: session.id,
      endedAt: new Date(),
    });
  });
});

