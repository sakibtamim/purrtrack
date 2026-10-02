import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index';
import dotenv from 'dotenv';

dotenv.config();
dotenv.config({ path: '../../.env' });

const connectionString =
  process.env.DATABASE_URL || 'postgres://purrtrack:purrtrack_password@localhost:5438/purrtrack';

// Create the connection client
export const sqlClient = postgres(connectionString, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
});

export const db = drizzle(sqlClient, { schema });
export type AppDatabase = typeof db;
