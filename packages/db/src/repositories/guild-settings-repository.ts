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
      trackStreaming: true,
      trackCamera: true,
      excludeAfk: true,
      minDurationSeconds: 10,
      timezone: 'UTC',
      ignoredChannelIds: [],
      adminRoleIds: [],
      lastAnnouncedMonth: null,
      autoReportConfig: {
        enabled: false,
        format: 'excel',
        includePayroll: true,
      },
      lastReportedMonth: null,
    };

    const [inserted] = await this.database
      .insert(guildSettings)
      .values(defaultSettings)
      .onConflictDoNothing()
      .returning();

    return inserted || (await this.database.select().from(guildSettings).where(eq(guildSettings.guildId, guildId)).limit(1))[0];
  }

  async listAllSettings(): Promise<GuildSetting[]> {
    return this.database.select().from(guildSettings);
  }

  async setLastAnnouncedMonth(guildId: string, month: string): Promise<GuildSetting> {
    return this.updateSettings(guildId, { lastAnnouncedMonth: month });
  }

  async setLastReportedMonth(guildId: string, month: string): Promise<GuildSetting> {
    return this.updateSettings(guildId, { lastReportedMonth: month });
  }

  async setAutoReportConfig(
    guildId: string,
    config: NonNullable<NewGuildSetting['autoReportConfig']>
  ): Promise<GuildSetting> {
    return this.updateSettings(guildId, { autoReportConfig: config });
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

  async addAdminRole(guildId: string, roleId: string): Promise<GuildSetting> {
    const settings = await this.getSettings(guildId);
    const roles = new Set(settings.adminRoleIds || []);
    roles.add(roleId);
    return this.updateSettings(guildId, { adminRoleIds: Array.from(roles) });
  }

  async removeAdminRole(guildId: string, roleId: string): Promise<GuildSetting> {
    const settings = await this.getSettings(guildId);
    const roles = (settings.adminRoleIds || []).filter((id) => id !== roleId);
    return this.updateSettings(guildId, { adminRoleIds: roles });
  }

  async addIgnoredChannel(guildId: string, channelId: string): Promise<GuildSetting> {
    const settings = await this.getSettings(guildId);
    const channels = new Set(settings.ignoredChannelIds || []);
    channels.add(channelId);
    return this.updateSettings(guildId, { ignoredChannelIds: Array.from(channels) });
  }

  async setTimezone(guildId: string, timezone: string): Promise<GuildSetting> {
    return this.updateSettings(guildId, { timezone });
  }

  async removeIgnoredChannel(guildId: string, channelId: string): Promise<GuildSetting> {
    const settings = await this.getSettings(guildId);
    const channels = (settings.ignoredChannelIds || []).filter((id) => id !== channelId);
    return this.updateSettings(guildId, { ignoredChannelIds: channels });
  }
}

