import { Client, GatewayIntentBits } from 'discord.js';
import {
  VoiceSessionRepository,
  GuildSettingsRepository,
  UserGoalsRepository,
  UserBadgesRepository,
  ContractorRatesRepository,
  TimeAdjustmentsRepository,
} from '@purrtrack/db';
import { env, getEnv } from './config/env.js';
import { logger } from './core/logger.js';
import { registerGracefulExit } from './core/graceful-exit.js';
import { VoiceTracker } from './engine/voice-tracker.js';
import { FocusManager } from './engine/focus-manager.js';
import { StartupReconciler } from './engine/reconciler.js';
import { BadgeManager } from './engine/badge-manager.js';
import { MonthlyCoronationScheduler } from './engine/monthly-scheduler.js';
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

  // 2. Initialize Repositories & Gamification Managers
  const sessionRepo = new VoiceSessionRepository();
  const settingsRepo = new GuildSettingsRepository();
  const goalsRepo = new UserGoalsRepository();
  const badgesRepo = new UserBadgesRepository();
  const ratesRepo = new ContractorRatesRepository();
  const timeRepo = new TimeAdjustmentsRepository();

  const badgeManager = new BadgeManager(sessionRepo, goalsRepo, badgesRepo);
  const focusManager = new FocusManager(sessionRepo, goalsRepo, badgeManager);

  // 3. Initialize Tracking Engine & Reconciler
  const voiceTracker = new VoiceTracker(
    sessionRepo,
    settingsRepo,
    5,
    goalsRepo,
    badgeManager
  ); // 5s anti-flap debounce
  const reconciler = new StartupReconciler(sessionRepo);

  // 4. Create Discord Client with exact required voice intents (unprivileged)
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildVoiceStates,
    ],
  });

  // 5. Initialize Timezone-Aware Monthly Coronation Watchdog
  const monthlyScheduler = new MonthlyCoronationScheduler(
    client,
    settingsRepo,
    sessionRepo,
    badgesRepo,
    badgeManager
  );

  // 6. Register Process Signal & Graceful Exit Handlers
  registerGracefulExit(client, async () => {
    monthlyScheduler.stop();
    voiceTracker.stopInactivityWatchdog();
    await voiceTracker.flushAllPending();
  });

  // 7. Start Background Watchdogs
  voiceTracker.startInactivityWatchdog(client, 60000);
  monthlyScheduler.start();

  // 7. Register Gateway Events
  registerReady(client, reconciler);
  registerVoiceStateUpdate(client, voiceTracker);
  registerInteractionCreate(
    client,
    sessionRepo,
    settingsRepo,
    goalsRepo,
    focusManager,
    badgesRepo,
    badgeManager,
    ratesRepo,
    timeRepo
  );

  // 7. Login to Discord
  logger.info('🔐 Connecting to Discord Gateway...');
  await client.login(env.DISCORD_BOT_TOKEN);
}

bootstrap().catch((err) => {
  logger.error('❌ Fatal error during bootstrap:', err);
  process.exit(1);
});
