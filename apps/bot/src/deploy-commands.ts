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
    if (guildId) {
      logger.info(`🚀 Deploying ${slashCommands.length} commands to guild ${guildId} (Instant server update)...`);
      const data = (await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
        body: slashCommands,
      })) as any[];

      logger.info(`✅ Successfully registered ${data.length} guild commands for server ${guildId}:`);
      data.forEach((cmd) => logger.info(`   - /${cmd.name}`));
    }

    // Also deploy globally
    logger.info(`🌍 Deploying ${slashCommands.length} global commands across all servers...`);
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
