import { VoiceState } from 'discord.js';
import { VoiceTracker } from '../engine/voice-tracker.js';
import { logger } from '../core/logger.js';

export function registerVoiceStateUpdate(
  client: any,
  voiceTracker: VoiceTracker
): void {
  client.on('voiceStateUpdate', async (oldState: VoiceState, newState: VoiceState) => {
    try {
      await voiceTracker.handleVoiceStateUpdate(oldState, newState);
    } catch (error) {
      logger.error('[events:voiceStateUpdate] Uncaught error handling voice state update:', error);
    }
  });
}
