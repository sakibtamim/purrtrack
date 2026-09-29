<div align="center">

# 🐱 PurrTrack
### Enterprise Automatic Voice Time Tracking & Reporting Bot for Discord

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7+-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![discord.js](https://img.shields.io/badge/discord.js-v14.16-5865F2?logo=discord&logoColor=white)](https://discord.js.org/)
[![Fastify](https://img.shields.io/badge/Fastify-v5.2-000000?logo=fastify&logoColor=white)](https://fastify.dev/)
[![Drizzle ORM](https://img.shields.io/badge/Drizzle_ORM-0.39-C5F74F?logo=drizzle&logoColor=black)](https://orm.drizzle.team/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Vitest](https://img.shields.io/badge/Vitest-3.0-6E9F18?logo=vitest&logoColor=white)](https://vitest.dev/)
[![pnpm](https://img.shields.io/badge/pnpm-9.15-F69220?logo=pnpm&logoColor=white)](https://pnpm.io/)
[![Turborepo](https://img.shields.io/badge/Turborepo-2.3-EF4444?logo=turborepo&logoColor=white)](https://turbo.build/)

<p align="center">
  <b>Clockify for Discord</b> — PurrTrack automatically tracks, logs, and analyzes voice channel activity across your Discord servers without requiring manual clock-in/out commands. Admins can export rich timesheets and executive summaries across any timeframe in <b>Excel (.xlsx)</b>, <b>PDF</b>, <b>CSV</b>, <b>JSON</b>, or native <b>Discord Embeds</b>.
</p>

</div>

---

## 📑 Table of Contents

- [Overview & Architecture](#-overview--architecture)
- [100% Success Invariants](#-100-success-invariants)
- [Multi-Format Reporting Engine](#-multi-format-reporting-engine)
- [Monorepo Workspace Structure](#-monorepo-workspace-structure)
- [Prerequisites](#-prerequisites)
- [Quick Start Guide](#-quick-start-guide)
- [Slash Command Reference](#-slash-command-reference)
- [Configuration & Environment Variables](#-configuration--environment-variables)
- [Quality Gates & Testing](#-quality-gates--testing)
- [License](#-license)

---

## 🏛 Overview & Architecture

PurrTrack is built as a high-performance **pnpm + Turborepo monorepo**, cleanly decoupling business contracts, database models, gateway event handlers, and REST API services:

```mermaid
graph TD
    subgraph Discord Gateway
        GW["Discord Gateway"]
        VOICE["voiceStateUpdate Events"]
        INTERACTION["interactionCreate (Slash / Buttons)"]
    end

    subgraph apps/bot (Discord Bot Service)
        CLIENT["Discord Client (discord.js v14)"]
        TRACKER["Voice Tracking Engine<br/>• 5s Anti-Flap Debounce<br/>• Session State Machine<br/>• Channel Segment Splitter"]
        RECONCILER["Startup Reconciler<br/>• Voice Channel Scanner<br/>• Ghost Session Healer"]
        COMMANDS["Slash Command Router (/status, /report, /config)"]
        EXPORTER["Universal Multi-Format Exporter<br/>• Excel (.xlsx)<br/>• PDF Timesheets<br/>• CSV (UTF-8 BOM)<br/>• JSON & Discord Embeds"]
    end

    subgraph packages/db (PostgreSQL Persistence)
        REPOS["Repository Layer (VoiceSessionRepository, GuildSettingsRepository)"]
        DRIZZLE["Drizzle ORM Engine"]
        PG[("PostgreSQL 16 Database<br/>Partial Unique Index Guard")]
    end

    subgraph apps/api (REST Service)
        FASTIFY["Fastify 5 HTTP Service<br/>Health Check & Web Downloads"]
    end

    GW --> VOICE
    GW --> INTERACTION
    VOICE --> TRACKER
    INTERACTION --> COMMANDS
    CLIENT --> RECONCILER
    TRACKER --> REPOS
    RECONCILER --> REPOS
    COMMANDS --> EXPORTER
    EXPORTER --> REPOS
    REPOS --> DRIZZLE
    DRIZZLE --> PG
    FASTIFY --> REPOS
```

---

## 🛡️ 100% Success Invariants

PurrTrack incorporates battle-tested resilience patterns from production bots:

1. **Fully Automated Voice Trigger:** Time tracking starts **strictly and automatically** when a user connects to a voice channel. Leaving finalizes the session. No manual user action required.
2. **Anti-Flap Grace Window (5s Debounce):** In Discord, users frequently experience network hitches or momentary channel hops. When a disconnect event is detected, PurrTrack holds the session in an in-memory grace window for 5 seconds. If the user reconnects within 5 seconds, the disconnect is cleanly cancelled and tracking resumes uninterrupted.
3. **Startup Reconciliation & Ghost Session Healing:** If the bot restarts or crashes during maintenance while members are in voice:
   - On boot (`ready.ts`), the bot scans all guild voice channels.
   - Any session left open in the database whose member is no longer in voice is gracefully closed with `COMPLETED_RECOVERED`.
   - Any active member currently connected in voice is immediately picked up and tracked.
4. **Database-Level Partial Unique Constraint:** 
   ```sql
   CREATE UNIQUE INDEX "unique_active_user_guild_session" 
   ON "voice_sessions" ("guild_id", "user_id") 
   WHERE status = 'ACTIVE';
   ```
   PostgreSQL guarantees that a user can **never** have duplicate overlapping active sessions in the same server.
5. **Clean Shutdown Watchdog:** Signal handlers (`SIGINT`, `SIGTERM`) flush all pending in-memory segments to PostgreSQL, close connection pools, and destroy the Discord client with a 15-second safety watchdog.

---

## 📊 Multi-Format Reporting Engine

Admins and team leads can pull timesheets across any timeframe (**Today**, **Yesterday**, **This Week**, **Last Week**, **This Month**, **Last Month**, **All Time**, or **Custom Range**) in five distinct formats:

| Format | Technology | Features |
| :--- | :--- | :--- |
| **Excel (.xlsx)** | `exceljs` | Multi-tab workbook: Executive Summary tab with styled KPI cards (`Total Hours`, `Top Channels`, `Top Contributors`), auto-filter session table, zebra striping, duration formatted as `[h]:mm:ss`, and automatic `=SUM()` formulas. |
| **PDF** | `pdfkit` | Polished Clockify-style timesheet report with branding banner, executive metrics boxes, alternating shaded data rows, page numbers, and generation timestamp. |
| **CSV** | `fast-csv` | Standard RFC 4180 CSV export with **UTF-8 BOM (`\uFEFF`)** so Microsoft Excel and Google Sheets parse special characters and timestamps flawlessly. |
| **Discord Embed** | `discord.js` | Native in-chat interactive embed with top 5 voice channels, top team contributors, total hours breakdown, and recent sessions list. |
| **JSON** | Native | Machine-readable structured payload conforming strictly to `@purrtrack/shared` DTOs. |

---

## 📦 Monorepo Workspace Structure

```text
purrtrack/
├── apps/
│   ├── bot/                          # Discord Bot Service
│   │   ├── src/commands/             # /status, /report (user & guild), /config, /help
│   │   ├── src/engine/               # Voice Tracker (5s anti-flap) & Startup Reconciler
│   │   ├── src/exporters/            # CSV, Excel, PDF, JSON, Discord Embed generators
│   │   ├── src/core/                 # Graceful exit watchdog, structured logger, announcer
│   │   ├── src/events/               # ready, voiceStateUpdate, interactionCreate
│   │   └── src/deploy-commands.ts    # Slash command registration script
│   │
│   └── api/                          # Fastify 5 REST API
│       └── src/                      # Health check (/health) and reporting endpoints
│
├── packages/
│   ├── shared/                       # Contracts, Zod schemas, DTOs, and time utilities
│   │   └── src/                      # Session schemas, report schemas, duration formatters
│   │
│   └── db/                           # Drizzle ORM PostgreSQL Persistence
│       ├── src/schema/               # voice_sessions, session_segments, guild_settings, etc.
│       ├── src/repositories/         # VoiceSessionRepository & GuildSettingsRepository
│       └── drizzle/                  # Auto-generated SQL migrations
│
├── docker-compose.yml                # Dedicated PostgreSQL 16 container (port 5438)
├── pnpm-workspace.yaml               # Monorepo workspaces definition
├── turbo.json                        # Turborepo task pipeline
├── package.json                      # Unified root scripts (dev, test, build, db)
├── tsconfig.base.json                # TypeScript base configuration
└── vitest.config.ts                  # Root Vitest test runner
```

---

## ⚡ Prerequisites

- **Node.js**: `20.x` or `22.x` LTS
- **pnpm**: `9.x` (`pnpm@9.15.9` recommended)
- **Docker**: For running PostgreSQL 16
- **Discord Bot Token**: From the [Discord Developer Portal](https://discord.com/developers/applications) with:
  - `Guilds`
  - `GuildVoiceStates`
  - `GuildMembers` (Privileged Gateway Intent)

---

## 🚀 Quick Start Guide

### 1. Clone & Install Dependencies

```bash
git clone https://github.com/sakibtamim/purrtrack.git
cd purrtrack
pnpm install
```

### 2. Launch Local PostgreSQL Database

```bash
# Starts PostgreSQL 16 on port 5438
docker compose up -d

# Push Drizzle schema to database
pnpm db:push
```

### 3. Configure Environment Variables

```bash
cp .env.example .env
```

Edit `.env` and provide your credentials:

```env
DISCORD_BOT_TOKEN="your_bot_token_here"
DISCORD_CLIENT_ID="your_application_client_id"
DISCORD_GUILD_ID="your_test_guild_id" # Optional: provides instant command deployment in dev
DATABASE_URL="postgres://purrtrack:purrtrack_password@localhost:5438/purrtrack"
```

### 4. Deploy Slash Commands to Discord

```bash
# Registers /status, /report, /config, and /help with Discord
pnpm deploy:commands
```

### 5. Start the Services

```bash
# Start the Discord Bot (with hot-reload)
pnpm dev:bot

# Start the Fastify HTTP API (optional)
pnpm dev:api

# Or start all services simultaneously
pnpm dev
```

---

## 💬 Slash Command Reference

| Command | Subcommand | Arguments | Permission | Description |
| :--- | :--- | :--- | :--- | :--- |
| `/status` | — | `[target: Member]` | Public / Admin | Displays real-time live elapsed duration for the current voice session and channel. |
| `/report` | `user` | `target: Member`, `[format: Format]`, `[range: Range]` | Member (Self) / Admin | Generates a formatted time report for a specific member in Excel, PDF, CSV, JSON, or Embed. |
| `/report` | `guild` | `[format: Format]`, `[range: Range]` | Admin / Manager | Generates an aggregated timesheet and leaderboard across all voice channels for the entire server. |
| `/config` | `view` | — | Admin | Inspects current server tracking settings (AFK rule, deafened tracking, timezone). |
| `/config` | `set` | `[enabled]`, `[exclude_afk]`, `[track_muted]`, `[track_deafened]`, `[announce_channel]` | Admin | Updates voice tracking policies and announcement preferences. |
| `/help` | — | — | Public | Displays interactive command guide and feature documentation. |

---

## 🔧 Configuration & Environment Variables

| Variable | Required | Default | Description |
| :--- | :--- | :--- | :--- |
| `DISCORD_BOT_TOKEN` | **Yes** | — | Bot authentication token from Discord Developer Portal. |
| `DISCORD_CLIENT_ID` | **Yes** | — | Discord application client ID for command registration. |
| `DISCORD_GUILD_ID` | No | — | Target guild ID for instant development slash command deployment. |
| `DISCORD_ANNOUNCE_CHANNEL_ID` | No | — | Text channel ID for online/offline status announcements. |
| `DATABASE_URL` | **Yes** | `postgres://purrtrack:purrtrack_password@localhost:5438/purrtrack` | PostgreSQL connection string. |
| `API_PORT` | No | `4100` | Port for Fastify REST API service. |
| `NODE_ENV` | No | `development` | Runtime environment (`development`, `production`, `test`). |

---

## 🧪 Quality Gates & Testing

PurrTrack adheres to strict engineering standards. All pull requests and commits are verified against automated unit and integration tests:

```bash
# Run complete test suite (24 unit & integration tests)
pnpm test

# Run TypeScript compiler checks across all workspace packages
pnpm typecheck

# Build all monorepo packages
pnpm build
```

---

## 📄 License

MIT © [Purrfect Software Ltd](https://github.com/purrfectsoft) & [Sakib Tamim](https://github.com/sakibtamim).
