import { Interaction, Client } from 'discord.js';
import { VoiceSessionRepository, GuildSettingsRepository } from '@purrtrack/db';
import { dispatchSlashCommand, dispatchAutocomplete } from '../commands/index.js';
import { logger } from '../core/logger.js';

export function registerInteractionCreate(
  client: Client,
  sessionRepo: VoiceSessionRepository,
  settingsRepo: GuildSettingsRepository
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
      await dispatchSlashCommand(interaction, sessionRepo, settingsRepo);
    } catch (err) {
      logger.error('[events:interactionCreate] Top-level interaction error:', err);
    }
  });
}
