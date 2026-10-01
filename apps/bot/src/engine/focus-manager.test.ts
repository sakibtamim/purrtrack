import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FocusManager } from './focus-manager.js';

describe('FocusManager Engine', () => {
  let mockSessionRepo: any;
  let focusManager: FocusManager;
  let mockClient: any;

  beforeEach(() => {
    vi.useFakeTimers();

    mockSessionRepo = {
      getActiveSession: vi.fn().mockResolvedValue({ id: 'sess-123', status: 'ACTIVE' }),
      setSegmentFocus: vi.fn().mockResolvedValue({ id: 'seg-123', isFocus: true, focusTask: 'Deep Work' }),
    };

    mockClient = {
      channels: {
        fetch: vi.fn().mockResolvedValue({
          isSendable: () => true,
          send: vi.fn().mockResolvedValue(true),
        }),
      },
      users: {
        fetch: vi.fn().mockResolvedValue({
          send: vi.fn().mockResolvedValue(true),
        }),
      },
    };

    focusManager = new FocusManager(mockSessionRepo);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts a focus session and sets segment focus in DB', async () => {
    const session = await focusManager.startFocus({
      guildId: 'guild-1',
      userId: 'user-1',
      textChannelId: 'chan-1',
      workMinutes: 25,
      breakMinutes: 5,
      task: 'Writing Compiler',
      client: mockClient,
    });

    expect(session).toBeDefined();
    expect(session.phase).toBe('work');
    expect(session.workMinutes).toBe(25);
    expect(session.breakMinutes).toBe(5);
    expect(session.task).toBe('Writing Compiler');

    expect(mockSessionRepo.getActiveSession).toHaveBeenCalledWith('guild-1', 'user-1');
    expect(mockSessionRepo.setSegmentFocus).toHaveBeenCalledWith('sess-123', true, 'Writing Compiler');

    const active = focusManager.getFocus('guild-1', 'user-1');
    expect(active).not.toBeNull();
    expect(active?.task).toBe('Writing Compiler');
  });

  it('stops an active focus session and reverts DB state', async () => {
    await focusManager.startFocus({
      guildId: 'guild-1',
      userId: 'user-1',
      textChannelId: 'chan-1',
      workMinutes: 25,
      breakMinutes: 5,
      task: 'Writing Tests',
      client: mockClient,
    });

    const stopped = await focusManager.stopFocus('guild-1', 'user-1', true);
    expect(stopped).toBeDefined();
    expect(stopped?.task).toBe('Writing Tests');

    expect(mockSessionRepo.setSegmentFocus).toHaveBeenCalledWith('sess-123', false);
    expect(focusManager.getFocus('guild-1', 'user-1')).toBeNull();
  });

  it('transitions from work sprint to break after workMinutes expires', async () => {
    await focusManager.startFocus({
      guildId: 'guild-1',
      userId: 'user-1',
      textChannelId: 'chan-1',
      workMinutes: 25,
      breakMinutes: 5,
      task: 'Architecture Review',
      client: mockClient,
    });

    // Advance time by 25 minutes
    await vi.advanceTimersByTimeAsync(25 * 60 * 1000);

    const active = focusManager.getFocus('guild-1', 'user-1');
    expect(active?.phase).toBe('break');

    // Advance time by 5 minutes to complete break
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);

    expect(focusManager.getFocus('guild-1', 'user-1')).toBeNull();
  });
});
