import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { z } from 'zod';

// Load local .env first
dotenv.config();

// Search upward for monorepo root .env if not found
const CORE_VARS = ['DISCORD_BOT_TOKEN', 'DISCORD_CLIENT_ID'];
const isMissingCore = CORE_VARS.some((v) => !process.env[v]);

if (isMissingCore) {
  const __filename = fileURLToPath(import.meta.url);
  let currentDir = path.dirname(__filename);

  while (currentDir !== path.dirname(currentDir)) {
    const candidatePath = path.join(currentDir, '.env');
    if (fs.existsSync(candidatePath)) {
      dotenv.config({ path: candidatePath });
      break;
    }
    currentDir = path.dirname(currentDir);
  }
}

const envSchema = z.object({
  DISCORD_BOT_TOKEN: z.string().min(1, 'DISCORD_BOT_TOKEN is required'),
  DISCORD_CLIENT_ID: z.string().min(1, 'DISCORD_CLIENT_ID is required'),
  DISCORD_GUILD_ID: z.string().optional(),
  DISCORD_ANNOUNCE_CHANNEL_ID: z.string().optional(),
  DATABASE_URL: z.string().default('postgres://purrtrack:purrtrack_password@localhost:5438/purrtrack'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

export type BotEnv = z.infer<typeof envSchema>;

let validatedEnv: BotEnv | null = null;

export function getEnv(): BotEnv {
  if (validatedEnv) return validatedEnv;

  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('❌ Invalid environment variables:', result.error.format());
    throw new Error('Environment validation failed');
  }

  validatedEnv = result.data;
  return validatedEnv;
}

export const env = {
  get DISCORD_BOT_TOKEN() {
    return process.env.DISCORD_BOT_TOKEN || '';
  },
  get DISCORD_CLIENT_ID() {
    return process.env.DISCORD_CLIENT_ID || '';
  },
  get DISCORD_GUILD_ID() {
    return process.env.DISCORD_GUILD_ID;
  },
  get DISCORD_ANNOUNCE_CHANNEL_ID() {
    return process.env.DISCORD_ANNOUNCE_CHANNEL_ID;
  },
  get DATABASE_URL() {
    return process.env.DATABASE_URL || 'postgres://purrtrack:purrtrack_password@localhost:5438/purrtrack';
  },
  get NODE_ENV() {
    return process.env.NODE_ENV || 'development';
  },
};
