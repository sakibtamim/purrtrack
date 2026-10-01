import { Client, GatewayIntentBits } from 'discord.js';
import { VoiceSessionRepository, GuildSettingsRepository, UserGoalsRepository } from '@purrtrack/db';
import { env, getEnv } from './config/env.js';
import { logger } from './core/logger.js';
import { registerGracefulExit } from './core/graceful-exit.js';
import { VoiceTracker } from './engine/voice-tracker.js';
import { FocusManager } from './engine/focus-manager.js';
import { StartupReconciler } from './engine/reconciler.js';
import { registerReady } from './events/ready.js';
import { registerVoiceStateUpdate } from './events/voice-state-update.js';
import { registerInteractionCreate } from './events/interaction-create.js';

async function bootstrap(): Promise<void> {
  logger.info('🐱 Starting PurrTrack Voice Time Tracking Bot...');

  // 1. Validate environment variables
  try {
    getEnv();
    logger.info('✅ Environment configuration validated.');
  } catch {
    process.exit(1);
  }

  // 2. Initialize Repositories & Managers
  const sessionRepo = new VoiceSessionRepository();
  const settingsRepo = new GuildSettingsRepository();
  const goalsRepo = new UserGoalsRepository();
  const focusManager = new FocusManager(sessionRepo);

  // 3. Initialize Tracking Engine & Reconciler
  const voiceTracker = new VoiceTracker(sessionRepo, settingsRepo, 5, goalsRepo); // 5s anti-flap debounce
  const reconciler = new StartupReconciler(sessionRepo);

  // 4. Create Discord Client with exact required voice intents (unprivileged)
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildVoiceStates,
    ],
  });

  // 5. Register Process Signal & Graceful Exit Handlers
  registerGracefulExit(client, async () => {
    await voiceTracker.flushAllPending();
  });

  // 6. Register Gateway Events
  registerReady(client, reconciler);
  registerVoiceStateUpdate(client, voiceTracker);
  registerInteractionCreate(client, sessionRepo, settingsRepo, goalsRepo, focusManager);

  // 7. Login to Discord
  logger.info('🔐 Connecting to Discord Gateway...');
  await client.login(env.DISCORD_BOT_TOKEN);
}

bootstrap().catch((err) => {
  logger.error('❌ Fatal error during bootstrap:', err);
  process.exit(1);
});
