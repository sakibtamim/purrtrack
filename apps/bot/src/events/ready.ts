import { Client, Events } from 'discord.js';
import { StartupReconciler } from '../engine/reconciler.js';
import { sendStartupAnnouncement } from '../core/announcer.js';
import { logger } from '../core/logger.js';

export function registerReady(
  client: Client,
  reconciler: StartupReconciler
): void {
  client.once(Events.ClientReady, async (readyClient) => {
    logger.info(`🎉 [ready] PurrTrack is logged in as ${readyClient.user.tag}!`);
    logger.info(`🌐 [ready] Connected to ${readyClient.guilds.cache.size} server(s).`);

    // 100% Invariant: Run startup reconciliation immediately
    try {
      await reconciler.reconcile(client);
    } catch (err) {
      logger.error('❌ [ready] Failed to complete startup reconciliation:', err);
    }

    // Send startup announcement
    await sendStartupAnnouncement(client);
  });
}
