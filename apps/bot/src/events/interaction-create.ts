import { Interaction, Client } from 'discord.js';
import {
  VoiceSessionRepository,
  GuildSettingsRepository,
  UserGoalsRepository,
  UserBadgesRepository,
} from '@purrtrack/db';
import { FocusManager } from '../engine/focus-manager.js';
import { dispatchSlashCommand, dispatchAutocomplete, handleLeaderboardButton } from '../commands/index.js';
import { logger } from '../core/logger.js';

export function registerInteractionCreate(
  client: Client,
  sessionRepo: VoiceSessionRepository,
  settingsRepo: GuildSettingsRepository,
  goalsRepo: UserGoalsRepository,
  focusManager: FocusManager,
  badgesRepo: UserBadgesRepository,
  badgeManager?: any
): void {
  client.on('interactionCreate', async (interaction: Interaction) => {
    if (interaction.isAutocomplete()) {
      try {
        await dispatchAutocomplete(interaction, settingsRepo, badgesRepo);
      } catch (err) {
        logger.error('[events:interactionCreate] Autocomplete error:', err);
      }
      return;
    }

    if (interaction.isButton()) {
      try {
        if (interaction.customId.startsWith('lb_')) {
          await handleLeaderboardButton(interaction, sessionRepo, goalsRepo);
        }
      } catch (err) {
        logger.error('[events:interactionCreate] Button error:', err);
      }
      return;
    }

    if (!interaction.isChatInputCommand()) return;

    try {
      await dispatchSlashCommand(
        interaction,
        sessionRepo,
        settingsRepo,
        goalsRepo,
        focusManager,
        badgesRepo,
        badgeManager
      );
    } catch (err) {
      logger.error('[events:interactionCreate] Top-level interaction error:', err);
    }
  });
}
