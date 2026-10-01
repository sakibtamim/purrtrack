import { pgTable, uuid, varchar, integer, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

export const contractorRates = pgTable(
  'contractor_rates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    guildId: varchar('guild_id', { length: 32 }).notNull(),
    userId: varchar('user_id', { length: 32 }).notNull(),
    hourlyRateCents: integer('hourly_rate_cents').notNull(), // stored in cents/poisha (e.g. 50000 = 500.00 BDT)
    currency: varchar('currency', { length: 10 }).notNull().default('BDT'),
    setByUserId: varchar('set_by_user_id', { length: 32 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('unique_user_guild_contractor_rate').on(table.guildId, table.userId),
  ]
);

export type ContractorRateRow = typeof contractorRates.$inferSelect;
export type InsertContractorRate = typeof contractorRates.$inferInsert;
