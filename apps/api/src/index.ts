import { buildServer } from './server.js';
import dotenv from 'dotenv';

dotenv.config();

const port = Number(process.env.API_PORT) || 4100;
const host = process.env.API_HOST || '0.0.0.0';

async function main(): Promise<void> {
  const server = buildServer();

  try {
    const address = await server.listen({ port, host });
    server.log.info(`🚀 PurrTrack API server listening at ${address}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

main();
