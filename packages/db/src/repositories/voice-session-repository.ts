import { and, eq, gte, lte, sql, inArray } from 'drizzle-orm';
import { db, AppDatabase } from '../client';
import { voiceSessions, VoiceSessionRow, NewVoiceSessionRow } from '../schema/voice-sessions';
import { sessionSegments, SessionSegmentRow, NewSessionSegmentRow } from '../schema/session-segments';
import { discordUsers } from '../schema/discord-users';
import { voiceChannels } from '../schema/voice-channels';
import { SessionStatus, AggregatedReportData, TimeRangePreset, formatDuration } from '@purrtrack/shared';

export interface StartSessionParams {
  guildId: string;
  userId: string;
  channelId: string;
  channelName?: string;
  startedAt?: Date;
  wasMuted?: boolean;
  wasDeafened?: boolean;
  wasStreaming?: boolean;
  wasVideo?: boolean;
}

export interface SwitchChannelParams {
  sessionId: string;
  newChannelId: string;
  newChannelName?: string;
  switchedAt?: Date;
  wasMuted?: boolean;
  wasDeafened?: boolean;
  wasStreaming?: boolean;
  wasVideo?: boolean;
}

export interface TransitionStateParams {
  sessionId: string;
  wasMuted?: boolean;
  wasDeafened?: boolean;
  wasStreaming?: boolean;
  wasVideo?: boolean;
  timestamp?: Date;
}

export interface EndSessionParams {
  sessionId: string;
  endedAt?: Date;
  metadata?: {
    mutedSeconds: number;
    deafenedSeconds: number;
    streamingSeconds: number;
    channelSwitches: number;
  };
}

export interface ReportQueryParams {
  guildId: string;
  guildName: string;
  userId?: string;
  channelId?: string;
  startDate: Date;
  endDate: Date;
  preset: TimeRangePreset;
  timezone?: string;
}

export class VoiceSessionRepository {
  constructor(private readonly database: AppDatabase = db) {}

  /**
   * Upsert Discord user details to keep directory fresh
   */
  async upsertUser(id: string, username: string, globalName?: string, avatarUrl?: string): Promise<void> {
    await this.database
      .insert(discordUsers)
      .values({
        id,
        username,
        globalName,
        avatarUrl,
        lastSeenAt: new Date(),
      })
      .onConflictDoUpdate({
        target: discordUsers.id,
        set: {
          username,
          globalName: globalName ?? undefined,
          avatarUrl: avatarUrl ?? undefined,
          lastSeenAt: new Date(),
        },
      });
  }

  /**
   * Upsert Discord voice channel name
   */
  async upsertChannel(id: string, guildId: string, name: string, isAfk: boolean = false): Promise<void> {
    await this.database
      .insert(voiceChannels)
      .values({ id, guildId, name, isAfk, lastActivityAt: new Date() })
      .onConflictDoUpdate({
        target: voiceChannels.id,
        set: { name, isAfk, lastActivityAt: new Date() },
      });
  }

  /**
   * Start a new voice tracking session and initial segment.
   * Leverages DB partial unique index to avoid duplicates.
   */
  async startSession(params: StartSessionParams): Promise<{ session: VoiceSessionRow; segment: SessionSegmentRow }> {
    const startedAt = params.startedAt || new Date();

    // Check if an active session already exists (defensive check)
    const existing = await this.getActiveSession(params.guildId, params.userId);
    if (existing) {
      // Return existing session with its latest segment
      const activeSegment = await this.getActiveSegment(existing.id);
      if (activeSegment) {
        return { session: existing, segment: activeSegment };
      }
    }

    return await this.database.transaction(async (tx) => {
      const [session] = await tx
        .insert(voiceSessions)
        .values({
          guildId: params.guildId,
          userId: params.userId,
          initialChannelId: params.channelId,
          startedAt,
          status: SessionStatus.ACTIVE,
          metadata: {
            mutedSeconds: 0,
            deafenedSeconds: 0,
            streamingSeconds: 0,
            channelSwitches: 0,
          },
        })
        .returning();

      const [segment] = await tx
        .insert(sessionSegments)
        .values({
          sessionId: session.id,
          channelId: params.channelId,
          channelName: params.channelName || 'Voice Channel',
          startedAt,
          wasMuted: params.wasMuted ?? false,
          wasDeafened: params.wasDeafened ?? false,
          wasStreaming: params.wasStreaming ?? false,
          wasVideo: params.wasVideo ?? false,
        })
        .returning();

      return { session, segment };
    });
  }

  /**
   * Get current active session for a user in a guild
   */
  async getActiveSession(guildId: string, userId: string): Promise<VoiceSessionRow | null> {
    const [session] = await this.database
      .select()
      .from(voiceSessions)
      .where(
        and(
          eq(voiceSessions.guildId, guildId),
          eq(voiceSessions.userId, userId),
          eq(voiceSessions.status, SessionStatus.ACTIVE)
        )
      )
      .limit(1);

    return session || null;
  }

  /**
   * Get active segment for a session
   */
  async getActiveSegment(sessionId: string): Promise<SessionSegmentRow | null> {
    const [segment] = await this.database
      .select()
      .from(sessionSegments)
      .where(and(eq(sessionSegments.sessionId, sessionId), sql`${sessionSegments.endedAt} IS NULL`))
      .orderBy(sql`${sessionSegments.startedAt} DESC`)
      .limit(1);

    return segment || null;
  }

  /**
   * Set focus mode state on the active segment of a session
   */
  async setSegmentFocus(sessionId: string, isFocus: boolean, focusTask?: string): Promise<SessionSegmentRow | null> {
    const activeSegment = await this.getActiveSegment(sessionId);
    if (!activeSegment) return null;

    const [updated] = await this.database
      .update(sessionSegments)
      .set({
        isFocus,
        focusTask: isFocus ? (focusTask ?? activeSegment.focusTask) : null,
      })
      .where(eq(sessionSegments.id, activeSegment.id))
      .returning();

    return updated || null;
  }

  /**
   * Handle channel switch: closes current segment and creates new segment
   */
  async switchChannel(params: SwitchChannelParams): Promise<SessionSegmentRow> {
    const switchedAt = params.switchedAt || new Date();

    return await this.database.transaction(async (tx) => {
      // Find active segment to close
      const [activeSegment] = await tx
        .select()
        .from(sessionSegments)
        .where(and(eq(sessionSegments.sessionId, params.sessionId), sql`${sessionSegments.endedAt} IS NULL`))
        .limit(1);

      if (activeSegment) {
        const segDuration = Math.max(
          0,
          Math.floor((switchedAt.getTime() - new Date(activeSegment.startedAt).getTime()) / 1000)
        );
        await tx
          .update(sessionSegments)
          .set({ endedAt: switchedAt, durationSeconds: segDuration })
          .where(eq(sessionSegments.id, activeSegment.id));
      }

      // Create new segment
      const [newSegment] = await tx
        .insert(sessionSegments)
        .values({
          sessionId: params.sessionId,
          channelId: params.newChannelId,
          channelName: params.newChannelName || 'Voice Channel',
          startedAt: switchedAt,
          wasMuted: params.wasMuted ?? false,
          wasDeafened: params.wasDeafened ?? false,
          wasStreaming: params.wasStreaming ?? false,
          wasVideo: params.wasVideo ?? false,
        })
        .returning();

      // Increment channelSwitches in session metadata
      await tx
        .update(voiceSessions)
        .set({
          metadata: sql`jsonb_set(
            coalesce(${voiceSessions.metadata}, '{}'::jsonb),
            '{channelSwitches}',
            to_jsonb(coalesce((${voiceSessions.metadata}->>'channelSwitches')::int, 0) + 1)
          )`,
          updatedAt: new Date(),
        })
        .where(eq(voiceSessions.id, params.sessionId));

      return newSegment;
    });
  }

  /**
   * Handle in-channel state transition (e.g. webcam, screenshare, or mute toggle).
   * Closes active segment and opens new segment with updated state flags.
   */
  async transitionState(params: TransitionStateParams): Promise<SessionSegmentRow | null> {
    const timestamp = params.timestamp || new Date();

    return await this.database.transaction(async (tx) => {
      const [activeSegment] = await tx
        .select()
        .from(sessionSegments)
        .where(and(eq(sessionSegments.sessionId, params.sessionId), sql`${sessionSegments.endedAt} IS NULL`))
        .limit(1);

      if (!activeSegment) {
        const [session] = await tx
          .select()
          .from(voiceSessions)
          .where(eq(voiceSessions.id, params.sessionId))
          .limit(1);

        if (!session) return null;

        const [createdSegment] = await tx
          .insert(sessionSegments)
          .values({
            sessionId: params.sessionId,
            channelId: session.initialChannelId,
            channelName: 'Voice Channel',
            startedAt: timestamp,
            wasMuted: params.wasMuted ?? false,
            wasDeafened: params.wasDeafened ?? false,
            wasStreaming: params.wasStreaming ?? false,
            wasVideo: params.wasVideo ?? false,
          })
          .returning();
        return createdSegment;
      }

      const segDuration = Math.max(
        0,
        Math.floor((timestamp.getTime() - new Date(activeSegment.startedAt).getTime()) / 1000)
      );

      await tx
        .update(sessionSegments)
        .set({ endedAt: timestamp, durationSeconds: segDuration })
        .where(eq(sessionSegments.id, activeSegment.id));

      const [newSegment] = await tx
        .insert(sessionSegments)
        .values({
          sessionId: params.sessionId,
          channelId: activeSegment.channelId,
          channelName: activeSegment.channelName,
          startedAt: timestamp,
          wasMuted: params.wasMuted ?? false,
          wasDeafened: params.wasDeafened ?? false,
          wasStreaming: params.wasStreaming ?? false,
          wasVideo: params.wasVideo ?? false,
        })
        .returning();

      return newSegment;
    });
  }

  /**
   * Finalize session and any open segment
   */
  async endSession(params: EndSessionParams): Promise<VoiceSessionRow | null> {
    const endedAt = params.endedAt || new Date();

    return await this.database.transaction(async (tx) => {
      // Fetch session
      const [session] = await tx
        .select()
        .from(voiceSessions)
        .where(eq(voiceSessions.id, params.sessionId))
        .limit(1);

      if (!session || session.status !== SessionStatus.ACTIVE) {
        return null;
      }

      // Close open segment
      const [openSegment] = await tx
        .select()
        .from(sessionSegments)
        .where(and(eq(sessionSegments.sessionId, params.sessionId), sql`${sessionSegments.endedAt} IS NULL`))
        .limit(1);

      if (openSegment) {
        const segDuration = Math.max(
          0,
          Math.floor((endedAt.getTime() - new Date(openSegment.startedAt).getTime()) / 1000)
        );
        await tx
          .update(sessionSegments)
          .set({ endedAt, durationSeconds: segDuration })
          .where(eq(sessionSegments.id, openSegment.id));
      }

      const totalDuration = Math.max(
        0,
        Math.floor((endedAt.getTime() - new Date(session.startedAt).getTime()) / 1000)
      );

      const [updatedSession] = await tx
        .update(voiceSessions)
        .set({
          endedAt,
          durationSeconds: totalDuration,
          status: SessionStatus.COMPLETED,
          metadata: params.metadata || session.metadata,
          updatedAt: new Date(),
        })
        .where(eq(voiceSessions.id, params.sessionId))
        .returning();

      return updatedSession;
    });
  }

  /**
   * 100% Invariant Reconciler:
   * Finds all sessions marked ACTIVE whose user is NOT in the active connected voice users map,
   * and cleanly finalizes them as COMPLETED_RECOVERED with restartTimestamp.
   */
  async healAbandonedSessions(
    activeConnectedUsersByGuild: Map<string, Set<string>>,
    restartTimestamp: Date = new Date()
  ): Promise<number> {
    const allActive = await this.database
      .select()
      .from(voiceSessions)
      .where(eq(voiceSessions.status, SessionStatus.ACTIVE));

    let healedCount = 0;

    for (const session of allActive) {
      // Guard: Only heal sessions for guilds explicitly audited in the active map!
      if (!activeConnectedUsersByGuild.has(session.guildId)) {
        continue;
      }

      const guildVoiceUsers = activeConnectedUsersByGuild.get(session.guildId);
      const isStillConnected = guildVoiceUsers && guildVoiceUsers.has(session.userId);

      if (!isStillConnected) {
        // Heal abandoned session
        const duration = Math.max(
          0,
          Math.floor((restartTimestamp.getTime() - new Date(session.startedAt).getTime()) / 1000)
        );

        await this.database.transaction(async (tx) => {
          await tx
            .update(sessionSegments)
            .set({ endedAt: restartTimestamp, durationSeconds: duration })
            .where(and(eq(sessionSegments.sessionId, session.id), sql`${sessionSegments.endedAt} IS NULL`));

          await tx
            .update(voiceSessions)
            .set({
              endedAt: restartTimestamp,
              durationSeconds: duration,
              status: SessionStatus.COMPLETED_RECOVERED,
              updatedAt: new Date(),
            })
            .where(eq(voiceSessions.id, session.id));
        });

        healedCount++;
      }
    }

    return healedCount;
  }

  /**
   * Aggregates reporting data across date ranges, channels, or specific users
   */
  async getAggregatedReport(params: ReportQueryParams): Promise<AggregatedReportData> {
    const conditions = [
      eq(voiceSessions.guildId, params.guildId),
      gte(voiceSessions.startedAt, params.startDate),
      lte(voiceSessions.startedAt, params.endDate),
    ];

    if (params.userId) {
      conditions.push(eq(voiceSessions.userId, params.userId));
    }

    // Query sessions joined with users and initial channels
    const rows = await this.database
      .select({
        id: voiceSessions.id,
        userId: voiceSessions.userId,
        username: discordUsers.username,
        displayName: discordUsers.globalName,
        channelId: voiceSessions.initialChannelId,
        channelName: voiceChannels.name,
        startedAt: voiceSessions.startedAt,
        endedAt: voiceSessions.endedAt,
        durationSeconds: voiceSessions.durationSeconds,
        status: voiceSessions.status,
      })
      .from(voiceSessions)
      .leftJoin(discordUsers, eq(voiceSessions.userId, discordUsers.id))
      .leftJoin(voiceChannels, eq(voiceSessions.initialChannelId, voiceChannels.id))
      .where(and(...conditions))
      .orderBy(sql`${voiceSessions.startedAt} DESC`);

    let totalDurationSeconds = 0;
    const channelMap = new Map<string, { name: string; duration: number; count: number }>();
    const userMap = new Map<string, { username: string; displayName?: string; duration: number; count: number }>();
    const sessionItems = [];

    const now = new Date();

    for (const row of rows) {
      const isLive = row.status === "ACTIVE" || row.durationSeconds === null;
      const duration = isLive
        ? Math.max(0, Math.floor((now.getTime() - new Date(row.startedAt).getTime()) / 1000))
        : (row.durationSeconds || 0);
      totalDurationSeconds += duration;

      const chId = row.channelId || 'unknown';
      const chName = row.channelName || 'Voice Channel';
      const chEntry = channelMap.get(chId) || { name: chName, duration: 0, count: 0 };
      chEntry.duration += duration;
      chEntry.count += 1;
      channelMap.set(chId, chEntry);

      const uId = row.userId;
      const uName = row.username || `User (${uId})`;
      const uEntry = userMap.get(uId) || { username: uName, displayName: row.displayName || undefined, duration: 0, count: 0 };
      uEntry.duration += duration;
      uEntry.count += 1;
      userMap.set(uId, uEntry);

      sessionItems.push({
        id: row.id,
        userId: row.userId,
        username: uName,
        displayName: row.displayName || undefined,
        channelId: chId,
        channelName: chName,
        startedAt: new Date(row.startedAt),
        endedAt: isLive ? now : (row.endedAt ? new Date(row.endedAt) : now),
        durationSeconds: duration,
        durationFormatted: formatDuration(duration),
        status: row.status,
      });
    }

    const topChannels = Array.from(channelMap.entries())
      .map(([channelId, data]) => ({
        channelId,
        channelName: data.name,
        durationSeconds: data.duration,
        durationFormatted: formatDuration(data.duration),
        sessionCount: data.count,
      }))
      .sort((a, b) => b.durationSeconds - a.durationSeconds);

    const topUsers = Array.from(userMap.entries())
      .map(([userId, data]) => ({
        userId,
        username: data.username,
        displayName: data.displayName,
        durationSeconds: data.duration,
        durationFormatted: formatDuration(data.duration),
        sessionCount: data.count,
      }))
      .sort((a, b) => b.durationSeconds - a.durationSeconds);

    let targetUserObj = undefined;
    if (params.userId && userMap.has(params.userId)) {
      const u = userMap.get(params.userId)!;
      targetUserObj = { id: params.userId, username: u.username, displayName: u.displayName };
    }

    return {
      guildId: params.guildId,
      guildName: params.guildName,
      timezone: params.timezone || "UTC",
      targetUser: targetUserObj,
      period: {
        preset: params.preset,
        startDate: params.startDate,
        endDate: params.endDate,
      },
      totalDurationSeconds,
      totalDurationFormatted: formatDuration(totalDurationSeconds),
      totalSessions: rows.length,
      uniqueActiveUsers: userMap.size,
      topChannels,
      topUsers,
      sessions: sessionItems,
    };
  }

  /**
   * Calculate lifetime voice metrics and special hours for gamification
   */
  async getUserLifetimeStats(guildId: string, userId: string): Promise<UserLifetimeStats> {
    const sessions = await this.database
      .select({
        id: voiceSessions.id,
        durationSeconds: voiceSessions.durationSeconds,
        startedAt: voiceSessions.startedAt,
        status: voiceSessions.status,
      })
      .from(voiceSessions)
      .where(and(eq(voiceSessions.guildId, guildId), eq(voiceSessions.userId, userId)));

    const now = new Date();
    let totalDurationSeconds = 0;
    let nightHoursSeconds = 0;
    let morningHoursSeconds = 0;
    let weekendHoursSeconds = 0;

    for (const s of sessions) {
      const isLive = s.status === 'ACTIVE' || s.durationSeconds === null;
      const dur = isLive
        ? Math.max(0, Math.floor((now.getTime() - new Date(s.startedAt).getTime()) / 1000))
        : (s.durationSeconds || 0);

      totalDurationSeconds += dur;

      const date = new Date(s.startedAt);
      const hour = date.getUTCHours();
      const day = date.getUTCDay();

      if (hour >= 0 && hour < 5) {
        nightHoursSeconds += dur;
      } else if (hour >= 5 && hour < 8) {
        morningHoursSeconds += dur;
      }

      if (day === 0 || day === 6) {
        weekendHoursSeconds += dur;
      }
    }

    const segments = await this.database
      .select({
        durationSeconds: sessionSegments.durationSeconds,
        startedAt: sessionSegments.startedAt,
        endedAt: sessionSegments.endedAt,
        wasStreaming: sessionSegments.wasStreaming,
        wasVideo: sessionSegments.wasVideo,
        isFocus: sessionSegments.isFocus,
      })
      .from(sessionSegments)
      .innerJoin(voiceSessions, eq(sessionSegments.sessionId, voiceSessions.id))
      .where(and(eq(voiceSessions.guildId, guildId), eq(voiceSessions.userId, userId)));

    let totalStreamingSeconds = 0;
    let totalVideoSeconds = 0;
    let totalMediaSeconds = 0;
    let totalFocusSeconds = 0;

    for (const seg of segments) {
      const isLive = seg.endedAt === null || seg.durationSeconds === null;
      const dur = isLive
        ? Math.max(0, Math.floor((now.getTime() - new Date(seg.startedAt).getTime()) / 1000))
        : (seg.durationSeconds || 0);

      if (seg.wasStreaming) totalStreamingSeconds += dur;
      if (seg.wasVideo) totalVideoSeconds += dur;
      if (seg.wasStreaming || seg.wasVideo) totalMediaSeconds += dur;
      if (seg.isFocus) totalFocusSeconds += dur;
    }

    return {
      totalDurationSeconds,
      totalSessionsCount: sessions.length,
      totalStreamingSeconds,
      totalVideoSeconds,
      totalMediaSeconds,
      totalFocusSeconds,
      nightHoursSeconds,
      morningHoursSeconds,
      weekendHoursSeconds,
    };
  }
}

export interface UserLifetimeStats {
  totalDurationSeconds: number;
  totalSessionsCount: number;
  totalStreamingSeconds: number;
  totalVideoSeconds: number;
  totalMediaSeconds: number;
  totalFocusSeconds: number;
  nightHoursSeconds: number;
  morningHoursSeconds: number;
  weekendHoursSeconds: number;
}
