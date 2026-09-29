import { Client } from 'discord.js';
import { logger } from './logger.js';
import { sqlClient } from '@purrtrack/db';

let isShuttingDown = false;

export function registerGracefulExit(client: Client, cleanupFn?: () => Promise<void>): void {
  const handleExit = async (reason: string, error?: Error) => {
    if (isShuttingDown) {
      logger.warn(`[lifecycle] Shutdown already in progress (Reason: ${reason})`);
      return;
    }

    isShuttingDown = true;
    logger.info(`[lifecycle] Shutdown initiated (Reason: ${reason})`);

    // Safety watchdog timer: force exit if cleanup hangs for > 15s
    setTimeout(() => {
      logger.error('[lifecycle] Shutdown timed out after 15 seconds, forcing exit.');
      process.exit(1);
    }, 15000).unref();

    if (error) {
      logger.error(`[lifecycle] Error details: ${error.stack || error.message}`);
    }

    try {
      if (cleanupFn) {
        logger.info('[lifecycle] Running in-memory flush & pending session finalizer...');
        await cleanupFn();
      }
    } catch (err) {
      logger.error('[lifecycle] Error during pre-shutdown cleanup:', err);
    }

    try {
      logger.info('[lifecycle] Destroying Discord client...');
      await client.destroy();
    } catch (err) {
      logger.error('[lifecycle] Error destroying Discord client:', err);
    }

    try {
      logger.info('[lifecycle] Closing database pool...');
      await sqlClient.end();
    } catch (err) {
      logger.error('[lifecycle] Error closing database pool:', err);
    }

    logger.info('👋 [lifecycle] PurrTrack shutdown complete.');
    process.exit(error ? 1 : 0);
  };

  process.on('SIGINT', () => handleExit('SIGINT'));
  process.on('SIGTERM', () => handleExit('SIGTERM'));

  process.on('uncaughtException', (error) => {
    logger.error(`[lifecycle] Uncaught Exception: ${error.stack || error.message}`);
    handleExit('uncaughtException', error);
  });

  process.on('unhandledRejection', (reason) => {
    const errorMsg = reason instanceof Error ? reason.stack || reason.message : String(reason);
    logger.error(`[lifecycle] Unhandled Rejection: ${errorMsg}`);
  });
}
