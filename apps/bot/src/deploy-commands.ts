import { REST, Routes } from 'discord.js';
import { slashCommands } from './commands/index.js';
import { env, getEnv } from './config/env.js';
import { logger } from './core/logger.js';

async function deployCommands(): Promise<void> {
  getEnv();

  const token = env.DISCORD_BOT_TOKEN;
  const clientId = env.DISCORD_CLIENT_ID;
  const guildId = env.DISCORD_GUILD_ID;

  if (!token || !clientId) {
    logger.error('❌ DISCORD_BOT_TOKEN and DISCORD_CLIENT_ID are required to deploy commands.');
    process.exit(1);
  }

  const rest = new REST({ version: '10' }).setToken(token);

  try {
    // 1. If guildId is specified, clear any duplicate guild-specific commands
    // Discord displays both Guild & Global commands simultaneously in that server if both are registered!
    if (guildId) {
      logger.info(`🧹 Clearing guild-specific commands for server ${guildId} to prevent duplicates...`);
      await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: [] });
      logger.info(`✅ Cleared guild-level duplicate commands for ${guildId}.`);
    }

    // 2. Deploy single source of truth: Global commands
    logger.info(`🌍 Deploying ${slashCommands.length} global commands...`);
    const globalData = (await rest.put(Routes.applicationCommands(clientId), {
      body: slashCommands,
    })) as any[];

    logger.info(`✅ Successfully registered ${globalData.length} global commands:`);
    globalData.forEach((cmd) => logger.info(`   - /${cmd.name}`));

  } catch (error) {
    logger.error('❌ Failed to deploy commands:', error);
    process.exit(1);
  }
}

deployCommands();
