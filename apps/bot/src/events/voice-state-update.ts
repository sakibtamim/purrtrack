import { VoiceState } from 'discord.js';
import { VoiceTracker } from '../engine/voice-tracker.js';
import { logger } from '../core/logger.js';

export function registerVoiceStateUpdate(
  client: any,
  voiceTracker: VoiceTracker
): void {
  client.on('voiceStateUpdate', async (oldState: VoiceState, newState: VoiceState) => {
    try {
      const userId = newState.id || oldState.id;
      const userTag = newState.member?.user?.username || oldState.member?.user?.username || `User(${userId})`;
      const fromCh = oldState.channel?.name || oldState.channelId || 'none';
      const toCh = newState.channel?.name || newState.channelId || 'none';

      logger.info(`📡 [voice-event] @${userTag}: ${fromCh} ➔ ${toCh}`);
      await voiceTracker.handleVoiceStateUpdate(oldState, newState);
    } catch (error) {
      logger.error('[events:voiceStateUpdate] Uncaught error handling voice state update:', error);
    }
  });
}
