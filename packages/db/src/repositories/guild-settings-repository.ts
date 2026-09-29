import { eq } from 'drizzle-orm';
import { db, AppDatabase } from '../client';
import { guildSettings, GuildSetting, NewGuildSetting } from '../schema/guild-settings';

export class GuildSettingsRepository {
  constructor(private readonly database: AppDatabase = db) {}

  async getSettings(guildId: string): Promise<GuildSetting> {
    const [existing] = await this.database
      .select()
      .from(guildSettings)
      .where(eq(guildSettings.guildId, guildId))
      .limit(1);

    if (existing) {
      return existing;
    }

    // Default settings if not configured
    const defaultSettings: NewGuildSetting = {
      guildId,
      trackingEnabled: true,
      trackMuted: true,
      trackDeafened: false,
      excludeAfk: true,
      minDurationSeconds: 10,
      timezone: 'UTC',
      ignoredChannelIds: [],
      adminRoleIds: [],
    };

    const [inserted] = await this.database
      .insert(guildSettings)
      .values(defaultSettings)
      .onConflictDoNothing()
      .returning();

    return inserted || (await this.database.select().from(guildSettings).where(eq(guildSettings.guildId, guildId)).limit(1))[0];
  }

  async updateSettings(guildId: string, updates: Partial<NewGuildSetting>): Promise<GuildSetting> {
    const [updated] = await this.database
      .insert(guildSettings)
      .values({ guildId, ...updates })
      .onConflictDoUpdate({
        target: guildSettings.guildId,
        set: { ...updates, updatedAt: new Date() },
      })
      .returning();

    return updated;
  }
}
