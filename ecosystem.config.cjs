const path = require('node:path');
const dotenv = require('dotenv');

// Load environment variables from root .env
dotenv.config({ path: path.join(__dirname, '.env') });

module.exports = {
  apps: [
    {
      name: "purrtrack-bot",
      cwd: path.resolve(__dirname, "apps/bot"),
      script: path.resolve(__dirname, "apps/bot/dist/index.js"),
      node_args: "--import tsx",
      exec_mode: "fork",
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
      cwd: path.resolve(__dirname, "apps/api"),
      script: path.resolve(__dirname, "apps/api/dist/index.js"),
      node_args: "--import tsx",
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "500M",
      env: {
        ...process.env,
        NODE_ENV: "production",
        API_PORT: process.env.API_PORT || 5125,
        API_HOST: "0.0.0.0",
      },
    },
  ],
};
