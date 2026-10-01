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
  <b>TimeTrack for Discord</b> — PurrTrack automatically tracks, logs, and analyzes voice channel activity across your Discord servers without requiring manual clock-in/out commands. Admins and managers can export rich timesheets and executive summaries across any timeframe in <b>Excel (.xlsx)</b>, <b>PDF</b>, <b>CSV</b>, <b>JSON</b>, or native <b>Discord Embeds</b>.
</p>

</div>

---

## 📑 Table of Contents

- [Overview & Architecture](#-overview--architecture)
- [100% Success Invariants](#-100-success-invariants)
- [Productivity Suite (Goals & Focus Sprints)](#-productivity-suite-goals--focus-sprints)
- [Screen Share & Webcam Media Tracking](#-screen-share--webcam-media-tracking)
- [Role-Based Access Control (RBAC)](#-role-based-access-control-rbac)
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
    subgraph GATEWAY ["Discord Gateway"]
        GW["Discord Gateway"]
        VOICE["voiceStateUpdate Events"]
        INTERACTION["interactionCreate (Slash Commands)"]
    end

    subgraph BOT ["apps/bot (Discord Bot Service)"]
        CLIENT["Discord Client (discord.js v14)"]
        TRACKER["Voice Tracking Engine<br/>• 5s Anti-Flap Debounce<br/>• Session State Machine<br/>• Channel & Media Segment Slicing"]
        FOCUS["Pomodoro Focus Engine<br/>• Work/Break Timers<br/>• Automated Channel & DM Notifications"]
        RECONCILER["Startup Reconciler<br/>• Voice Channel Scanner<br/>• Ghost Session Healer"]
        COMMANDS["Slash Command Router<br/>• /ping, /status, /report, /config<br/>• /goal, /focus, /help"]
        EXPORTER["Universal Multi-Format Exporter<br/>• Excel (.xlsx)<br/>• PDF Timesheets<br/>• CSV (UTF-8 BOM)<br/>• JSON & Discord Embeds"]
    end

    subgraph DB ["packages/db (PostgreSQL Persistence)"]
        REPOS["Repository Layer<br/>• VoiceSessionRepository<br/>• GuildSettingsRepository<br/>• UserGoalsRepository"]
        DRIZZLE["Drizzle ORM Engine"]
        PG[("PostgreSQL 16 Database<br/>Partial Unique Index Guard")]
    end

    subgraph API ["apps/api (REST Service)"]
        FASTIFY["Fastify 5 HTTP Service<br/>Health Check & Web Downloads"]
    end

    GW --> VOICE
    GW --> INTERACTION
    VOICE --> TRACKER
    INTERACTION --> COMMANDS
    CLIENT --> RECONCILER
    TRACKER --> REPOS
    TRACKER --> FOCUS
    COMMANDS --> FOCUS
    RECONCILER --> REPOS
    COMMANDS --> EXPORTER
    COMMANDS --> REPOS
    EXPORTER --> REPOS
    REPOS --> DRIZZLE
    DRIZZLE --> PG
    FASTIFY --> REPOS
```

---

## 🛡️ 100% Success Invariants

PurrTrack incorporates battle-tested resilience patterns from enterprise Discord bots:

1. **Fully Automated Voice Trigger:** Time tracking starts **strictly and automatically** when a user connects to a voice channel. Leaving finalizes the session. Switching voice channels splits the segment into new channel tracking seamlessly without breaking the parent session. No manual user action required.
2. **Anti-Flap Grace Window (5s Debounce):** In Discord, users frequently experience network hitches or momentary channel hops. When a disconnect event is detected, PurrTrack holds the session in an in-memory grace window for 5 seconds. If the user reconnects within 5 seconds, the disconnect is cleanly cancelled and tracking resumes uninterrupted.
3. **Startup Reconciliation & Ghost Session Healing:** If the bot restarts or crashes during maintenance while members are in voice:
   - On boot (`ready.ts`), the bot scans all guild voice channels.
   - Any session left open in the database whose member is no longer in voice is gracefully closed with `COMPLETED_RECOVERED`.
   - Any active member currently connected in voice is immediately picked up and tracked.
4. **Dynamic Live Duration Computing:** Active in-progress sessions are dynamically computed in real-time (`now - startedAt`) when generating reports. Active users are tagged with a `🟢 (Live)` indicator, and their live minutes are immediately included in total hours and leaderboard rankings.
5. **On-Demand Self-Healing:** Whenever a user executes `/status` or an admin runs `/report`, the bot cross-checks all connected voice members. If a user is physically sitting in a voice channel but lacks an active DB session, PurrTrack auto-resumes tracking immediately on the fly.
6. **Zero Privileged Gateway Intent Dependency:** PurrTrack operates using **only standard unprivileged gateway intents** (`Guilds` and `GuildVoiceStates`). It dynamically resolves un-cached member metadata via Discord REST fallback, ensuring 100% functionality out-of-the-box without requiring approval or toggles in the Discord Developer Portal.
7. **Database-Level Partial Unique Constraint:** 
   ```sql
   CREATE UNIQUE INDEX "unique_active_user_guild_session" 
   ON "voice_sessions" ("guild_id", "user_id") 
   WHERE status = 'ACTIVE';
   ```
   PostgreSQL guarantees that a user can **never** have duplicate overlapping active sessions in the same server.
8. **Clean Single-Source Command Deployment:** The deployment script purges redundant guild-specific command registrations before deploying global commands, eliminating duplicate slash command entries in Discord.
9. **Clean Shutdown Watchdog:** Signal handlers (`SIGINT`, `SIGTERM`) flush all pending in-memory segments to PostgreSQL, close connection pools, and destroy the Discord client with a 15-second safety watchdog.

---

## 🎯 Productivity Suite (Goals & Focus Sprints)

PurrTrack includes an integrated productivity and habit-building system directly within voice channels:

### 1. Weekly Voice Goals & Streaks (`/goal`)
* **`/goal set [target_hours:<1-168>] [week_start:<day>]`**: Configure your personal weekly voice time commitment and choose your preferred cycle start day (e.g. Monday for ISO standard, Sunday for US/CA/JP, Saturday for Middle East/Bangladesh/Islamic calendar).
* **`/goal view [target: Member]`**: Displays weekly progress towards your goal:
  * Dynamic visual ASCII progress bar: `[████████░░] 80.0% (16h 00m / 20h 00m)`.
  * Week countdown timeline: Tracks remaining hours and days until your custom week start day 00:00 UTC reset.
  * Active daily streak counter: Tracks consecutive calendar days with active voice activity (`🔥 5 consecutive days`).
  * In-database historical streak backfilling ensures existing active members maintain their current streaks automatically.

### 2. Pomodoro Focus Sprints (`/focus`)
* **`/focus start [work: 25] [break: 5] [task: "Refactoring API"]`**:
  * Engages distraction-free focus tracking while in a voice channel.
  * Slices active voice segments with `isFocus: true` and attaches the custom focus task description.
  * Automated completion alerts:
    * Work sprint completes: Sends an in-channel or DM notification reminding the user to take their break (`☕`).
    * Break completes: Sends an alert prompting the member to initiate their next focus sprint (`🚀`).
* **`/focus stop`**: Cancels active focus timers early, reverts segment focus status, and logs total focused time.
* **`/focus status`**: Inspects current phase (work sprint vs break), elapsed duration, and time remaining.

---

## 📹 Screen Share & Webcam Media Tracking

PurrTrack tracks when members are actively presenting or collaborating visually:

* **Real-Time State Slicing**: When a user turns on their camera (`selfVideo`) or starts sharing their screen (`streaming`), PurrTrack automatically slices the session segment in-place without ending the parent session. This guarantees down-to-the-second accuracy for screen sharing and webcam time.
* **Live Status Grid**: `/status` renders a clean, balanced 2-column embed with native Discord relative timestamps, presenting `🎙️ Voice & Audio` (Mic & Deafen) and `📺 Media & Video` (Screen Share & Camera) side-by-side.
* **Configurable Policies**: Admins can toggle `track_streaming` and `track_camera` via `/config set`.
* **Ignored Channels**: Channels can be excluded from tracking entirely via `/config channel_ignore` and restored via `/config channel_unignore` with interactive autocomplete.

---

## 🔒 Role-Based Access Control (RBAC)

PurrTrack enforces strict enterprise permission boundaries:

### 1. Default Hierarchy & Administrators
* **Top of Management:** The **Discord Server Owner** holds full unconditional authority.
* **Server Administrators:** Anyone with Discord's native `Administrator` or `Manage Server` (`ManageGuild`) permissions.

### 2. Delegated Management Roles
Server Admins can designate any role as a **Management Role** (e.g. `@Engineering Manager`, `@Team Lead`, `@HR`):
```text
/config role_add role:@Engineering Manager
```

### 3. Permissions Matrix

| Feature | Regular Team Member | Management Role | Server Admin / Owner |
| :--- | :---: | :---: | :---: |
| **`/status` (Self)** | ✅ Allowed | ✅ Allowed | ✅ Allowed |
| **`/status target:@other_user`** | ⛔ **Blocked** *(Self-only)* | ✅ Allowed | ✅ Allowed |
| **`/goal view` (Self / Other)** | ✅ Allowed | ✅ Allowed | ✅ Allowed |
| **`/goal set` (Personal Target)** | ✅ Allowed | ✅ Allowed | ✅ Allowed |
| **`/focus start / stop / status`** | ✅ Allowed | ✅ Allowed | ✅ Allowed |
| **`/report user target:@self`** | ✅ Allowed | ✅ Allowed | ✅ Allowed |
| **`/report user target:@other_user`** | ⛔ **Blocked** | ✅ Allowed | ✅ Allowed |
| **`/report guild` (Server Timesheet)** | ⛔ **Blocked** | ✅ Allowed | ✅ Allowed |
| **`/config view`** | ⛔ **Blocked** | ✅ Allowed | ✅ Allowed |
| **`/config set` / `role_add` / `channel_ignore`** | ⛔ **Blocked** | ⛔ **Blocked** | ✅ Allowed |

---

## 📊 Multi-Format Reporting Engine

Admins and team leads can pull timesheets across any timeframe (**Today**, **Yesterday**, **This Week**, **Last Week**, **This Month**, **Last Month**, **All Time**) in five distinct formats:

| Format | Technology | Features |
| :--- | :--- | :--- |
| **Excel (.xlsx)** | `exceljs` | Multi-tab workbook: Executive Summary tab with styled KPI cards (`Total Hours`, `Top Channels`, `Top Contributors`), auto-filter session table, zebra striping, duration formatted as `[h]:mm:ss`, and automatic `=SUM()` formulas. |
| **PDF** | `pdfkit` | Polished TimeTrack-style timesheet report with branding banner, executive metrics boxes, alternating shaded data rows, page numbers, and generation timestamp. |
| **CSV** | `fast-csv` | Standard RFC 4180 CSV export with **UTF-8 BOM (`\uFEFF`)** so Microsoft Excel and Google Sheets parse special characters and timestamps flawlessly. |
| **Discord Embed** | `discord.js` | Native in-chat interactive embed with top 5 voice channels, top team contributors, total hours breakdown, active live badges (`🟢 (Live)`), and recent sessions list. |
| **JSON** | Native | Machine-readable structured payload conforming strictly to `@purrtrack/shared` DTOs. |

---

## 📦 Monorepo Workspace Structure

```text
purrtrack/
├── apps/
│   ├── bot/                          # Discord Bot Service
│   │   ├── src/commands/             # /ping, /status, /report, /config, /goal, /focus, /help
│   │   ├── src/engine/               # Voice Tracker, Pomodoro Focus Manager & Startup Reconciler
│   │   ├── src/exporters/            # CSV, Excel, PDF, JSON, Discord Embed generators
│   │   ├── src/core/                 # Graceful exit watchdog, structured logger, announcer
│   │   ├── src/events/               # ready, voiceStateUpdate, interactionCreate
│   │   └── src/deploy-commands.ts    # Single global slash command registration script
│   │
│   └── api/                          # Fastify 5 REST API
│       └── src/                      # Health check (/health) and reporting endpoints
│
├── packages/
│   ├── shared/                       # Contracts, Zod schemas, DTOs, and time utilities
│   │   └── src/                      # Session schemas, report schemas, duration formatters
│   │
│   └── db/                           # Drizzle ORM PostgreSQL Persistence
│       ├── src/schema/               # voice_sessions, session_segments, guild_settings, user_goals
│       ├── src/repositories/         # VoiceSessionRepository, GuildSettingsRepository, UserGoalsRepository
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
  - `Guilds` (Standard unprivileged intent)
  - `GuildVoiceStates` (Standard unprivileged intent)
  - *No privileged gateway intents required!*

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
DISCORD_GUILD_ID="your_test_guild_id" # Optional: clears guild-level command duplicates
DATABASE_URL="postgres://purrtrack:purrtrack_password@localhost:5438/purrtrack"
API_PORT=4100
API_HOST="0.0.0.0"
NODE_ENV="development"
```

### 4. Deploy Slash Commands to Discord

```bash
# Clears any legacy guild duplicates and registers 5 global slash commands
pnpm deploy:commands
```

### 5. Start the Services

```bash
# Start the Discord Bot (with hot-reload and live console dashboard)
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
| `/ping` | — | — | Public | Checks Discord Gateway WebSocket ping, API latency, and responsiveness. |
| `/status` | — | `[target: Member]` | Self (Public) / Target (Manager) | Displays real-time live elapsed duration for current voice session, active channel, voice status, and media state (screen share & camera) in a balanced 2-column layout. |
| `/goal` | `view` | `[target: Member]` | Public | View current weekly goal progress, visual ASCII progress bar (`[████████░░]`), countdown to reset, and active daily streak. |
| `/goal` | `set` | `[target_hours: Number]`, `[week_start: Day]` | Self | Set your personal weekly voice target (1h – 168h) and preferred week start day (Monday, Sunday, Saturday, etc.). |
| `/focus` | `start` | `[work: Number]`, `[break: Number]`, `[task: String]` | Public (Connected in Voice) | Starts a Pomodoro focus sprint with automated completion alerts and distraction-free tracking. |
| `/focus` | `stop` | — | Public | Ends active focus session early and reports completed focus time. |
| `/focus` | `status` | — | Public | Checks remaining sprint time and active phase (work sprint vs break). |
| `/report` | `user` | `target: Member`, `[format: Format]`, `[range: Range]` | Self (Public) / Target (Manager) | Generates an individual timesheet in Excel, PDF, CSV, JSON, or Embed. Regular members can only view their own report. |
| `/report` | `guild` | `[format: Format]`, `[range: Range]` | Admin / Manager | Generates an aggregated timesheet and leaderboard across all voice channels for the entire server. |
| `/config` | `view` | — | Admin / Manager | Inspects current server tracking settings, ignored channels, and designated management roles. |
| `/config` | `role_add` | `role: Role` | Admin / Owner | Grants Management permissions to a role (allows inspecting other users and pulling server-wide reports). |
| `/config` | `role_remove`| `role: Role` | Admin / Owner | Revokes Management permissions from a role. |
| `/config` | `channel_ignore` | `channel: Channel` | Admin / Owner | Adds a voice channel to the ignore list (bypasses tracking). |
| `/config` | `channel_unignore` | `channel: Channel` | Admin / Owner | Removes a voice channel from the ignore list with dynamic autocomplete. |
| `/config` | `set` | `[enabled]`, `[exclude_afk]`, `[track_muted]`, `[track_deafened]`, `[track_streaming]`, `[track_camera]`, `[announce_channel]` | Admin / Owner | Updates voice tracking policies and announcement preferences. |
| `/help` | — | — | Public | Displays interactive command guide and feature documentation. |

---

## 🔧 Configuration & Environment Variables

| Variable | Required | Default | Description |
| :--- | :--- | :--- | :--- |
| `DISCORD_BOT_TOKEN` | **Yes** | — | Bot authentication token from Discord Developer Portal. |
| `DISCORD_CLIENT_ID` | **Yes** | — | Discord application client ID for command registration. |
| `DISCORD_GUILD_ID` | No | — | Target guild ID (used to purge guild duplicates during deploy). |
| `DISCORD_ANNOUNCE_CHANNEL_ID` | No | — | Text channel ID for online/offline status announcements. |
| `DATABASE_URL` | **Yes** | `postgres://purrtrack:purrtrack_password@localhost:5438/purrtrack` | PostgreSQL connection string. |
| `API_PORT` | No | `4100` | Port for Fastify REST API service. |
| `API_HOST` | No | `0.0.0.0` | Binding host for Fastify API service. |
| `NODE_ENV` | No | `development` | Runtime environment (`development`, `production`, `test`). |

---

## 🧪 Quality Gates & Testing

PurrTrack adheres to strict engineering standards. All pull requests and commits are verified against automated unit and integration tests:

```bash
# Run complete test suite (38 unit & database integration tests across 5 suites)
pnpm test

# Run TypeScript compiler checks across all workspace packages
pnpm typecheck

# Build all monorepo packages
pnpm build
```

---

## 📄 License

MIT © [Purrfect Software Ltd](https://github.com/purrfectsoft) & [Sakib Tamim](https://github.com/sakibtamim).
