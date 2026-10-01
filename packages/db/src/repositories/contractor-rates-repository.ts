import { and, eq } from 'drizzle-orm';
import { db, AppDatabase } from '../client.js';
import { contractorRates, ContractorRateRow } from '../schema/contractor-rates.js';

export class ContractorRatesRepository {
  constructor(private readonly database: AppDatabase = db) {}

  /**
   * Retrieve the configured billing rate for a user in a guild
   */
  async getRate(guildId: string, userId: string): Promise<ContractorRateRow | null> {
    const [row] = await this.database
      .select()
      .from(contractorRates)
      .where(and(eq(contractorRates.guildId, guildId), eq(contractorRates.userId, userId)))
      .limit(1);

    return row || null;
  }

  /**
   * Set or update a contractor's hourly rate and currency (upsert)
   */
  async setRate(
    guildId: string,
    userId: string,
    hourlyRateCents: number,
    currency: string = 'BDT',
    setByUserId: string
  ): Promise<ContractorRateRow> {
    const normalizedCurrency = (currency || 'BDT').toUpperCase().trim();

    const [upserted] = await this.database
      .insert(contractorRates)
      .values({
        guildId,
        userId,
        hourlyRateCents,
        currency: normalizedCurrency,
        setByUserId,
      })
      .onConflictDoUpdate({
        target: [contractorRates.guildId, contractorRates.userId],
        set: {
          hourlyRateCents,
          currency: normalizedCurrency,
          setByUserId,
          updatedAt: new Date(),
        },
      })
      .returning();

    return upserted;
  }

  /**
   * Remove a configured rate for a member
   */
  async removeRate(guildId: string, userId: string): Promise<boolean> {
    const deleted = await this.database
      .delete(contractorRates)
      .where(and(eq(contractorRates.guildId, guildId), eq(contractorRates.userId, userId)))
      .returning();

    return deleted.length > 0;
  }

  /**
   * List all configured contractor rates in a guild
   */
  async listGuildRates(guildId: string): Promise<ContractorRateRow[]> {
    return this.database
      .select()
      .from(contractorRates)
      .where(eq(contractorRates.guildId, guildId))
      .orderBy(contractorRates.createdAt);
  }
}
