import { and, eq, gte, lte, desc } from 'drizzle-orm';
import { db, AppDatabase } from '../client.js';
import { timeAdjustments, TimeAdjustmentRow } from '../schema/time-adjustments.js';

export interface CreateAdjustmentParams {
  guildId: string;
  userId: string;
  adjustedByUserId: string;
  type: 'ADD' | 'SUBTRACT';
  durationSeconds: number;
  reason: string;
  createdAt?: Date;
}

export class TimeAdjustmentsRepository {
  constructor(private readonly database: AppDatabase = db) {}

  /**
   * Record a manual time adjustment made by an admin
   */
  async createAdjustment(params: CreateAdjustmentParams): Promise<TimeAdjustmentRow> {
    const [inserted] = await this.database
      .insert(timeAdjustments)
      .values({
        guildId: params.guildId,
        userId: params.userId,
        adjustedByUserId: params.adjustedByUserId,
        type: params.type,
        durationSeconds: Math.max(0, Math.round(params.durationSeconds)),
        reason: params.reason.trim(),
        createdAt: params.createdAt || new Date(),
      })
      .returning();

    return inserted;
  }

  /**
   * Fetch all adjustments for a user, optionally filtered by a date window
   */
  async getUserAdjustments(
    guildId: string,
    userId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<TimeAdjustmentRow[]> {
    const conditions = [
      eq(timeAdjustments.guildId, guildId),
      eq(timeAdjustments.userId, userId),
    ];

    if (startDate) {
      conditions.push(gte(timeAdjustments.createdAt, startDate));
    }
    if (endDate) {
      conditions.push(lte(timeAdjustments.createdAt, endDate));
    }

    return this.database
      .select()
      .from(timeAdjustments)
      .where(and(...conditions))
      .orderBy(desc(timeAdjustments.createdAt));
  }

  /**
   * Calculate net manual adjustment seconds (ADD positive, SUBTRACT negative) in a timeframe
   */
  async getNetAdjustmentSeconds(
    guildId: string,
    userId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<number> {
    const adjustments = await this.getUserAdjustments(guildId, userId, startDate, endDate);
    return adjustments.reduce((net, adj) => {
      return adj.type === 'ADD' ? net + adj.durationSeconds : net - adj.durationSeconds;
    }, 0);
  }

  /**
   * List recent manual adjustments in a guild for auditing
   */
  async getRecentGuildAdjustments(guildId: string, limit: number = 25): Promise<TimeAdjustmentRow[]> {
    return this.database
      .select()
      .from(timeAdjustments)
      .where(eq(timeAdjustments.guildId, guildId))
      .orderBy(desc(timeAdjustments.createdAt))
      .limit(limit);
  }
}
