import {
  ChatInputCommandInteraction,
  RESTPostAPIChatInputApplicationCommandsJSONBody,
} from 'discord.js';
import { VoiceSessionRepository, GuildSettingsRepository } from '@purrtrack/db';
import { statusCommand, handleStatusCommand } from './status.js';
import { reportCommand, handleReportCommand } from './report.js';
import { configCommand, handleConfigCommand } from './config.js';
import { helpCommand, handleHelpCommand } from './help.js';
import { logger } from '../core/logger.js';

export const slashCommands: RESTPostAPIChatInputApplicationCommandsJSONBody[] = [
  statusCommand.toJSON(),
  reportCommand.toJSON(),
  configCommand.toJSON(),
  helpCommand.toJSON(),
];

export async function dispatchSlashCommand(
  interaction: ChatInputCommandInteraction,
  sessionRepo: VoiceSessionRepository,
  settingsRepo: GuildSettingsRepository
): Promise<void> {
  const { commandName } = interaction;

  try {
    switch (commandName) {
      case 'status':
        await handleStatusCommand(interaction, sessionRepo);
        break;

      case 'report':
        await handleReportCommand(interaction, sessionRepo, settingsRepo);
        break;

      case 'config':
        await handleConfigCommand(interaction, settingsRepo);
        break;

      case 'help':
        await handleHelpCommand(interaction);
        break;

      default:
        logger.warn(`[commands] Unhandled command: ${commandName}`);
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
