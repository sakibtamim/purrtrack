import { Interaction, Client } from 'discord.js';
import { VoiceSessionRepository, GuildSettingsRepository, UserGoalsRepository } from '@purrtrack/db';
import { FocusManager } from '../engine/focus-manager.js';
import { dispatchSlashCommand, dispatchAutocomplete } from '../commands/index.js';
import { logger } from '../core/logger.js';

export function registerInteractionCreate(
  client: Client,
  sessionRepo: VoiceSessionRepository,
  settingsRepo: GuildSettingsRepository,
  goalsRepo: UserGoalsRepository,
  focusManager: FocusManager
): void {
  client.on('interactionCreate', async (interaction: Interaction) => {
    if (interaction.isAutocomplete()) {
      try {
        await dispatchAutocomplete(interaction, settingsRepo);
      } catch (err) {
        logger.error('[events:interactionCreate] Autocomplete error:', err);
      }
      return;
    }

    if (!interaction.isChatInputCommand()) return;

    try {
      await dispatchSlashCommand(interaction, sessionRepo, settingsRepo, goalsRepo, focusManager);
    } catch (err) {
      logger.error('[events:interactionCreate] Top-level interaction error:', err);
    }
  });
}
