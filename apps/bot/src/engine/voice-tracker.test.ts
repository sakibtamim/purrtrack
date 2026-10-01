import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { VoiceTracker } from './voice-tracker.js';

describe('VoiceTracker Engine & Anti-Flap Protection', () => {
  let mockSessionRepo: any;
  let mockSettingsRepo: any;
  let tracker: VoiceTracker;

  beforeEach(() => {
    vi.useFakeTimers();

    mockSessionRepo = {
      upsertUser: vi.fn().mockResolvedValue(undefined),
      upsertChannel: vi.fn().mockResolvedValue(undefined),
      startSession: vi.fn().mockResolvedValue({
        session: { id: 'sess-123', status: 'ACTIVE' },
        segment: { id: 'seg-123' },
      }),
      getActiveSession: vi.fn().mockResolvedValue({ id: 'sess-123', status: 'ACTIVE' }),
      getActiveSegment: vi.fn().mockResolvedValue({ id: 'seg-123' }),
      switchChannel: vi.fn().mockResolvedValue({ id: 'seg-456' }),
      transitionState: vi.fn().mockResolvedValue({ id: 'seg-789' }),
      endSession: vi.fn().mockResolvedValue({ id: 'sess-123', status: 'COMPLETED', durationSeconds: 120 }),
    };

    mockSettingsRepo = {
      getSettings: vi.fn().mockResolvedValue({
        trackingEnabled: true,
        excludeAfk: true,
        ignoredChannelIds: ['afk-chan-999'],
      }),
    };

    tracker = new VoiceTracker(mockSessionRepo, mockSettingsRepo, 5);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('ignores bot accounts from time tracking', async () => {
    const oldState: any = { channelId: null, member: { user: { bot: true, id: 'bot-1' } }, guild: { id: 'g-1' } };
    const newState: any = { channelId: 'vc-1', member: { user: { bot: true, id: 'bot-1' } }, guild: { id: 'g-1' } };

    await tracker.handleVoiceStateUpdate(oldState, newState);
    expect(mockSessionRepo.startSession).not.toHaveBeenCalled();
  });

  it('starts session when a human member connects to a voice channel', async () => {
    const oldState: any = {
      channelId: null,
      channel: null,
      member: { user: { bot: false, id: 'user-1', username: 'purr', displayAvatarURL: () => '' } },
      guild: { id: 'g-1', afkChannelId: 'afk-chan-999' },
    };
    const newState: any = {
      channelId: 'vc-1',
      channel: { id: 'vc-1', name: 'General Voice' },
      member: { user: { bot: false, id: 'user-1', username: 'purr', displayAvatarURL: () => '' } },
      guild: { id: 'g-1', afkChannelId: 'afk-chan-999' },
    };

    mockSessionRepo.getActiveSession.mockResolvedValueOnce(null);

    await tracker.handleVoiceStateUpdate(oldState, newState);

    expect(mockSessionRepo.upsertUser).toHaveBeenCalled();
    expect(mockSessionRepo.upsertChannel).toHaveBeenCalledWith('vc-1', 'g-1', 'General Voice', false);
    expect(mockSessionRepo.startSession).toHaveBeenCalledWith(
      expect.objectContaining({
        guildId: 'g-1',
        userId: 'user-1',
        channelId: 'vc-1',
        channelName: 'General Voice',
      })
    );
  });

  it('Anti-Flap Invariant: Cancels termination if user reconnects within 5s grace window', async () => {
    const member = { user: { bot: false, id: 'user-1', username: 'purr', displayAvatarURL: () => '' } };
    const guild = { id: 'g-1', afkChannelId: 'afk-chan-999' };

    // 1. User disconnects
    const disconnectOldState: any = { channelId: 'vc-1', channel: { id: 'vc-1', name: 'General Voice' }, member, guild };
    const disconnectNewState: any = { channelId: null, channel: null, member, guild };

    await tracker.handleVoiceStateUpdate(disconnectOldState, disconnectNewState);

    // Session is not immediately finalized
    expect(mockSessionRepo.endSession).not.toHaveBeenCalled();

    // Advance 3 seconds (less than 5s grace window)
    vi.advanceTimersByTime(3000);
    expect(mockSessionRepo.endSession).not.toHaveBeenCalled();

    // 2. User reconnects at 3s
    const reconnectOldState: any = { channelId: null, channel: null, member, guild };
    const reconnectNewState: any = { channelId: 'vc-1', channel: { id: 'vc-1', name: 'General Voice' }, member, guild };

    await tracker.handleVoiceStateUpdate(reconnectOldState, reconnectNewState);

    // Advance past the original 5s mark
    vi.advanceTimersByTime(5000);

    // Termination was successfully cancelled! Session was NOT closed!
    expect(mockSessionRepo.endSession).not.toHaveBeenCalled();
  });

  it('Finalizes session after 5s grace window expires without reconnection', async () => {
    const member = { user: { bot: false, id: 'user-1', username: 'purr', displayAvatarURL: () => '' } };
    const guild = { id: 'g-1', afkChannelId: 'afk-chan-999' };

    const disconnectOldState: any = { channelId: 'vc-1', channel: { id: 'vc-1', name: 'General Voice' }, member, guild };
    const disconnectNewState: any = { channelId: null, channel: null, member, guild };

    await tracker.handleVoiceStateUpdate(disconnectOldState, disconnectNewState);
    expect(mockSessionRepo.endSession).not.toHaveBeenCalled();

    // Advance 5.1 seconds
    await vi.advanceTimersByTimeAsync(5100);

    // Session must be finalized!
    expect(mockSessionRepo.endSession).toHaveBeenCalledTimes(1);
    expect(mockSessionRepo.endSession).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 'sess-123' })
    );
  });

  it('Splits segment when switching between two active voice channels', async () => {
    const member = { user: { bot: false, id: 'user-1', username: 'purr', displayAvatarURL: () => '' } };
    const guild = { id: 'g-1', afkChannelId: 'afk-chan-999' };

    const switchOldState: any = { channelId: 'vc-1', channel: { id: 'vc-1', name: 'General Voice' }, member, guild };
    const switchNewState: any = { channelId: 'vc-2', channel: { id: 'vc-2', name: 'Gaming Lounge' }, member, guild };

    await tracker.handleVoiceStateUpdate(switchOldState, switchNewState);

    expect(mockSessionRepo.switchChannel).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'sess-123',
        newChannelId: 'vc-2',
        newChannelName: 'Gaming Lounge',
      })
    );
  });

  it('Transitions in-channel media state when toggling screen share or camera', async () => {
    const member = { user: { bot: false, id: 'user-1', username: 'purr', displayAvatarURL: () => '' } };
    const guild = { id: 'g-1', afkChannelId: 'afk-chan-999' };

    const oldState: any = { channelId: 'vc-1', streaming: false, selfVideo: false, member, guild };
    const newState: any = { channelId: 'vc-1', streaming: true, selfVideo: true, member, guild };

    await tracker.handleVoiceStateUpdate(oldState, newState);

    expect(mockSessionRepo.transitionState).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'sess-123',
        wasStreaming: true,
        wasVideo: true,
      })
    );
  });

  it('Ignores voice connections in ignored channels configured in guild settings', async () => {
    const member = { user: { bot: false, id: 'user-1', username: 'purr', displayAvatarURL: () => '' } };
    const guild = { id: 'g-1', afkChannelId: 'afk-chan-999' };

    // Connect to ignored channel 'afk-chan-999'
    const oldState: any = { channelId: null, member, guild };
    const newState: any = { channelId: 'afk-chan-999', member, guild };

    await tracker.handleVoiceStateUpdate(oldState, newState);

    expect(mockSessionRepo.startSession).not.toHaveBeenCalled();
  });

  it('Inactivity Watchdog: moves inactive member to AFK channel and ends session', async () => {
    mockSettingsRepo.getSettings.mockResolvedValue({
      trackingEnabled: true,
      maxInactiveMinutes: 60,
      excludeAfk: true,
    });

    const mockSetChannel = vi.fn().mockResolvedValue(undefined);
    const mockDisconnect = vi.fn().mockResolvedValue(undefined);

    const mockMember = {
      id: 'user-inactive',
      displayName: 'Sleeping Member',
      voice: {
        setChannel: mockSetChannel,
        disconnect: mockDisconnect,
      },
    };

    const mockVoiceState = {
      id: 'user-inactive',
      channelId: 'vc-active',
      selfMute: true,
      selfDeaf: true,
      member: mockMember,
    };

    const mockGuild = {
      id: 'g-1',
      name: 'Test Guild',
      afkChannelId: 'afk-channel-1',
      voiceStates: {
        cache: new Map([['user-inactive', mockVoiceState]]),
      },
    };

    const mockClient = {
      guilds: {
        cache: new Map([['g-1', mockGuild]]),
      },
    };

    // First check registers lastActive timestamp
    await tracker.checkInactivity(mockClient);
    expect(mockSetChannel).not.toHaveBeenCalled();

    // Advance time by 61 minutes
    vi.advanceTimersByTime(61 * 60 * 1000);

    // Second check triggers inactivity move
    await tracker.checkInactivity(mockClient);
    expect(mockSetChannel).toHaveBeenCalledWith('afk-channel-1');
    expect(mockSessionRepo.endSession).toHaveBeenCalled();
  });

  it('Inactivity Watchdog: disconnects member when no AFK channel is configured', async () => {
    mockSettingsRepo.getSettings.mockResolvedValue({
      trackingEnabled: true,
      maxInactiveMinutes: 30,
      excludeAfk: true,
    });

    const mockSetChannel = vi.fn().mockResolvedValue(undefined);
    const mockDisconnect = vi.fn().mockResolvedValue(undefined);

    const mockMember = {
      id: 'user-no-afk',
      displayName: 'Idle Member',
      voice: {
        setChannel: mockSetChannel,
        disconnect: mockDisconnect,
      },
    };

    const mockVoiceState = {
      id: 'user-no-afk',
      channelId: 'vc-active',
      selfMute: true,
      selfDeaf: true,
      member: mockMember,
    };

    const mockGuild = {
      id: 'g-2',
      name: 'No AFK Guild',
      afkChannelId: null,
      voiceStates: {
        cache: new Map([['user-no-afk', mockVoiceState]]),
      },
    };

    const mockClient = {
      guilds: {
        cache: new Map([['g-2', mockGuild]]),
      },
    };

    // First check registers timestamp
    await tracker.checkInactivity(mockClient);
    expect(mockDisconnect).not.toHaveBeenCalled();

    // Advance time by 31 minutes
    vi.advanceTimersByTime(31 * 60 * 1000);

    // Second check triggers disconnect
    await tracker.checkInactivity(mockClient);
    expect(mockDisconnect).toHaveBeenCalled();
    expect(mockSessionRepo.endSession).toHaveBeenCalled();
  });
});
