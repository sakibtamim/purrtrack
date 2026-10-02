const path = require('node:path');
const dotenv = require('dotenv');

// Load environment variables from root .env
dotenv.config({ path: path.join(__dirname, '.env') });

module.exports = {
  apps: [
    {
      name: "purrtrack-bot",
      cwd: "./apps/bot",
      script: "dist/index.js",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "500M",
      env: {
        ...process.env,
        NODE_ENV: "production",
      },
    },
    {
      name: "purrtrack-api",
      cwd: "./apps/api",
      script: "dist/index.js",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "500M",
      env: {
        ...process.env,
        NODE_ENV: "production",
        API_PORT: process.env.API_PORT || 4100,
        API_HOST: "0.0.0.0",
      },
    },
  ],
};
