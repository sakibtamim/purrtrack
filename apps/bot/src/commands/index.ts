import {
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  ButtonInteraction,
  RESTPostAPIChatInputApplicationCommandsJSONBody,
} from 'discord.js';
import {
  VoiceSessionRepository,
  GuildSettingsRepository,
  UserGoalsRepository,
  UserBadgesRepository,
} from '@purrtrack/db';
import { FocusManager } from '../engine/focus-manager.js';
import { statusCommand, handleStatusCommand } from './status.js';
import { reportCommand, handleReportCommand } from './report.js';
import { configCommand, handleConfigCommand, handleConfigAutocomplete } from './config.js';
import { helpCommand, handleHelpCommand } from './help.js';
import { pingCommand, handlePingCommand } from './ping.js';
import { goalCommand, handleGoalCommand } from './goal.js';
import { focusCommand, handleFocusCommand } from './focus.js';
import { profileCommand, handleProfileCommand, handleProfileAutocomplete } from './profile.js';
import { leaderboardCommand, handleLeaderboardCommand, handleLeaderboardButton } from './leaderboard.js';
import { logger } from '../core/logger.js';

export const slashCommands: RESTPostAPIChatInputApplicationCommandsJSONBody[] = [
  pingCommand.toJSON(),
  statusCommand.toJSON(),
  reportCommand.toJSON(),
  configCommand.toJSON(),
  goalCommand.toJSON(),
  focusCommand.toJSON(),
  profileCommand.toJSON(),
  leaderboardCommand.toJSON(),
  helpCommand.toJSON(),
];

export async function dispatchSlashCommand(
  interaction: ChatInputCommandInteraction,
  sessionRepo: VoiceSessionRepository,
  settingsRepo: GuildSettingsRepository,
  goalsRepo: UserGoalsRepository,
  focusManager: FocusManager,
  badgesRepo: UserBadgesRepository,
  badgeManager?: any
): Promise<void> {
  const { commandName, user } = interaction;
  logger.info(`⚡ [commands] /${commandName} invoked by @${user.username} (${user.id}) in guild ${interaction.guildId}`);

  try {
    switch (commandName) {
      case 'ping':
        await handlePingCommand(interaction);
        break;

      case 'status':
        await handleStatusCommand(interaction, sessionRepo, settingsRepo, goalsRepo);
        break;

      case 'report':
        await handleReportCommand(interaction, sessionRepo, settingsRepo);
        break;

      case 'config':
        await handleConfigCommand(interaction, settingsRepo);
        break;

      case 'goal':
        await handleGoalCommand(interaction, sessionRepo, goalsRepo);
        break;

      case 'focus':
        await handleFocusCommand(interaction, focusManager);
        break;

      case 'profile':
        await handleProfileCommand(interaction, sessionRepo, goalsRepo, badgesRepo, badgeManager);
        break;

      case 'leaderboard':
        await handleLeaderboardCommand(interaction, sessionRepo, goalsRepo, badgeManager);
        break;

      case 'help':
        await handleHelpCommand(interaction);
        break;

      default:
        logger.warn(`[commands] Unhandled command: /${commandName}`);
        await interaction.reply({ content: `Unknown command: /${commandName}`, ephemeral: true });
    }
  } catch (error) {
    logger.error(`[commands] Error executing /${commandName}:`, error);

    const errorMessage = '❌ An unexpected error occurred while processing this command.';
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ content: errorMessage, ephemeral: true }).catch(() => {});
    } else {
      await interaction.reply({ content: errorMessage, ephemeral: true }).catch(() => {});
    }
  }
}

export async function dispatchAutocomplete(
  interaction: AutocompleteInteraction,
  settingsRepo: GuildSettingsRepository,
  badgesRepo: UserBadgesRepository
): Promise<void> {
  const { commandName } = interaction;
  try {
    if (commandName === 'config') {
      await handleConfigAutocomplete(interaction, settingsRepo);
    } else if (commandName === 'profile') {
      await handleProfileAutocomplete(interaction, badgesRepo);
    }
  } catch (error) {
    logger.error(`[autocomplete] Error executing autocomplete for /${commandName}:`, error);
  }
}

export { handleLeaderboardButton };
