<div align="center">

# 🐱 PurrTrack
### Enterprise Automatic Voice Time Tracking & Reporting Bot for Discord

[![Version](https://img.shields.io/badge/version-v1.0.0-5865F2?logo=github&logoColor=white)](https://github.com/sakibtamim/purrtrack/releases)
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
- [Gamification, Badges & Community Leaderboard](#-gamification-badges--community-leaderboard)
- [Contractor Billing & Invoicing Engine](#-contractor-billing--invoicing-engine)
- [Manual Time Adjustments & Audit Trail](#-manual-time-adjustments--audit-trail)
- [Screen Share & Webcam Media Tracking](#-screen-share--webcam-media-tracking)
- [Inactivity Sleep Guard & Auto-Move](#-inactivity-sleep-guard--auto-move)
- [Role-Based Access Control (RBAC)](#-role-based-access-control-rbac)
- [Multi-Format Reporting Engine](#-multi-format-reporting-engine)
- [Monorepo Workspace Structure](#-monorepo-workspace-structure)
- [Prerequisites](#-prerequisites)
- [Quick Start Guide](#-quick-start-guide)
- [Slash Command Reference](#-slash-command-reference)
- [Configuration & Environment Variables](#-configuration--environment-variables)
- [Quality Gates & Testing](#-quality-gates--testing)
- [License & Security](#-license--security)

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
  * **Active Goal Guard Rail**: Once activated, an in-progress goal cannot be overwritten mid-cycle until you **finish it (100%)** or until the weekly cycle resets at 00:00 UTC.
* **`/goal reset`**: Cancel or forfeit your active weekly goal early if unexpected events prevent you from completing it. Your recorded voice hours and streaks remain safe.
* **`/goal view [target: Member]`**: Displays weekly progress towards your goal:
  * Dynamic visual ASCII progress bar: `[████████░░] 80.0% (16h 00m / 20h 00m)`.
  * Week countdown timeline: Tracks remaining hours and days until your custom week start day 00:00 UTC reset.
  * Active daily streak counter: Tracks consecutive calendar days with active voice activity (`🔥 5 consecutive days`).
  * In-database historical streak backfilling ensures existing active members maintain their current streaks automatically.

### 2. Pomodoro Focus Sprints (`/focus`)
* **`/focus start [timer: "25m"] [break: "5m"] [task: "Refactoring API"]`**:
  * Engages distraction-free focus tracking while in a voice channel.
  * **Flexible Duration Input**: Accepts hours or minutes (e.g. `2h`, `1.5h`, `90m`, `120`, or `25m`). Displays clean hour formatting (e.g. `2 hours` / `2h work`).
  * **Smart Defaults**: Defaults to 25 minutes work and 5 minutes break if timer options are omitted. Supports custom manual timers up to 240 minutes (4 hours).
  * **Active Sprint Protection**: Protects existing sessions from being overwritten. If you have an active sprint running, the bot prompts you with remaining time and asks you to wait or `/focus stop` before starting a new one.
  * Slices active voice segments with `isFocus: true` and attaches the custom focus task description.
  * Automated completion alerts:
    * Work sprint completes: Sends an in-channel or DM notification reminding the user to take their break (`☕`).
    * Break completes: Sends an alert prompting the member to initiate their next focus sprint (`🚀`).
* **`/focus stop`**: Cancels active focus timers early, reverts segment focus status, and logs total focused time.
* **`/focus status`**: Inspects current phase (work sprint vs break), elapsed duration, and time remaining.

---

## 🏆 Gamification, Badges & Community Leaderboard

PurrTrack features a comprehensive achievement and community engagement engine designed to encourage voice participation, productivity, and healthy competition:

### 1. Achievement Badges (26 Badges across 6 Categories)
Badges start locked (`🔒`) and unlock dynamically in real-time as users hit voice milestones, complete weekly goals, run focus sprints, or stream:
* **🎯 Goals**: `goal_first` (First Goal Crushed), `goal_5` (Consistent Achiever), `goal_10` (Goal Master), `goal_25` (Unstoppable).
* **🔥 Streaks**: `streak_3` (3-Day Streak), `streak_7` (Week of Fire), `streak_14` (Fortnight Flame), `streak_30` (Monthly Legend).
* **⏱️ Lifetime Voice Time**: `time_10h` (Voice Novice - 10h), `time_50h` (Voice Regular - 50h), `time_100h` (Centurion - 100h), `time_250h` (Veteran - 250h), `time_500h` (Voice Titan - 500h), `time_1000h` (Voice Mythic - 1000h).
* **🍅 Pomodoro Focus**: `focus_first` (First Sprint Done), `focus_10` (Focus Enthusiast - 10 sprints), `focus_50` (Deep Worker - 50 sprints), `focus_100` (Zen Master - 100 sprints).
* **📺 Media & Streaming**: `stream_10h` (Broadcaster - 10h stream), `camera_10h` (Face to Face - 10h webcam).
* **✨ Special & Community**: `night_owl` (Late Nighter - 10h between 12am-5am), `early_bird` (Morning Voice - 10h between 5am-9am), `weekend_warrior` (Weekend Hustler - 20h Sat-Sun).

### 2. Profile & 3-Badge Showcase (`/profile`)
Members can customize their personal 3-badge showcase:
* **Slot 1 (Primary Title)**: Displayed next to your username on `/status`, compact leaderboard rows, and profile headers.
* **Slots 2 & 3 (Showcase Trophy Rack)**: Displayed prominently on your `/profile view` card alongside total voice hours, goals completed, focus sprints, and active streaks.
* **Commands**:
  * **`/profile view [target: Member]`**: View dynamic profile card with equipped title, showcase rack, productivity stats, and unlock progress.
  * **`/profile badges [target: Member] [category: Category]`**: Interactive browser for all badges with criteria and unlock status (`🔒 Locked` vs `✅ Unlocked`).
  * **`/profile equip [slot: 1-3] [badge: ID]`**: Equip an unlocked badge with live autocomplete suggestions.
  * **`/profile unequip [slot: 1-3]`**: Clear a showcase slot.

### 3. Server-Wide Leaderboard (`/leaderboard`)
* **Visual Top 3 Podiums**: First, second, and third place podiums highlighted with 🥇, 🥈, and 🥉 cards, custom badge titles, and total recorded hours.
* **Filter Options**:
  * **Periods**: `all_time`, `this_month`, `this_week`, `today`.
  * **Metrics**: `voice` (Voice Duration), `stream` (Screen Share Duration), `camera` (Camera Duration), `focus` (Pomodoro Duration), `streak` (Daily Streaks).
* **Interactive Pagination Buttons**: Navigate pages seamlessly with `◀️ Prev`, `Next ▶️`, and jump directly to your own position with `🎯 My Rank`.

### 4. Monthly Champion Race & Automated Month-End Reset
PurrTrack operates on an automatic monthly competition cycle:
* **Dynamic Monthly Tracking**: The monthly leaderboard (`/leaderboard [period: this_month]`) logs voice duration for the active calendar month and displays a live countdown to the month-end reset.
* **Automatic Month-End Reset**: At 00:00 UTC on the 1st of every month, the monthly leaderboard naturally resets back to zero for a fresh, clean start.
* **Top 3 Monthly Champion Badges**: When the month concludes, the top 3 contributors on the server leaderboard earn permanent exclusive badges:
  * 🥇 **Monthly Champion** (`monthly_champion_1st`): Crowned #1 on the monthly server leaderboard.
  * 🥈 **Monthly Runner-Up** (`monthly_champion_2nd`): 2nd place on the monthly server leaderboard.
  * 🥉 **Monthly Podium** (`monthly_champion_3rd`): 3rd place on the monthly server leaderboard.

---

## 💵 Contractor Billing & Invoicing Engine

PurrTrack bridges Discord voice collaboration with professional contractor management, automated timesheets, and itemized PDF invoices:

### 1. Hourly Rate Configuration (`/config rate_*`)
* **`/config rate_set user:@member hourly_rate:500 [currency:BDT]`**: Configure an hourly compensation rate for any team member or contractor.
  * **Default Currency**: Defaults to Bangladeshi Taka (`BDT`), but accepts any 3-letter ISO currency code (`USD`, `EUR`, `GBP`, `CAD`, etc.).
  * **Zero Floating-Point Drift**: Hourly rates are stored internally in minor currency units (cents / poise) to eliminate financial rounding errors.
  * **Strict Permission Boundaries**: Rates can only be set or removed by Server Admins and Management roles.
* **`/config rate_remove user:@member`**: Revokes a configured billing rate.
* **`/config rate_view [user:@member]`**: Inspect current hourly rate and currency:
  * Regular contractors have **read-only access** to view their own rate.
  * Server Admins & Managers can inspect any member's rate across the server.

### 2. Multi-Format Contractor Invoicing
Whenever a report is generated for a user with an active billing rate (`/report user target:@member`):
* **📄 Official Contractor Invoice & Timesheet (PDF)**:
  * Prominent **Invoice Header & Identifier**: Automatically generates unique invoice number `INV-YYYYMMDD-XXXX` with current date and payment due terms.
  * **Contractor & Organization Metadata**: Highlights Contractor username, Discord User ID, Guild Name, and authorized manager.
  * **Executive Billing Summary**: Clean KPI metric cards displaying Total Billable Hours, Configured Hourly Rate, Net Manual Adjustments, and **Total Amount Payable** in bold format.
  * **Itemized Session Lines**: Every voice session includes duration, effective hourly rate, and line total amount.
* **📊 Excel (.xlsx) & Embed Invoicing**:
  * Excel exports append styled billing KPI summary cards and an `Amount ({currency})` column for each session line.
  * Discord Embeds display contractor hourly rate, total compensation, and net manual adjustment badges.

---

## ⏱️ Manual Time Adjustments & Audit Trail

Administrators and managers can adjust tracked time for team members with complete accountability and audit logging:

* **Strict Admin/Manager Access**: Regular members cannot adjust time. Only authorized Admins and Management roles can apply credits or deductions.
* **Flexible Duration Parsing**: Accepts human-readable durations such as `1h 30m`, `45m`, `2h`, `1.5h`, or raw minutes `90`.
* **Historical & Backdated Adjustments**: Accepts an optional `[date]` argument (`YYYY-MM-DD`, `yesterday`, or `today` - defaults to today) so adjustments apply accurately to past timesheets and invoices.
* **Commands**:
  * **`/time add target:@member duration:"1h 30m" reason:"Meeting on Zoom" [date:"2026-10-01"]`**: Credits manual time to a user's timesheet.
  * **`/time subtract target:@member duration:"45m" reason:"Accidental AFK voice stay" [date:"yesterday"]`**: Deducts manual time.
  * **`/time history target:@member`**: Displays the 10 most recent time adjustments for a member, detailing credit/deduction amounts, reasons, effective dates, issuing manager, and relative Discord timestamps.
* **Integrated Invoicing**: Net adjustment hours and amounts are factored dynamically into timesheet calculations, PDF invoices, and Excel workbooks.

---

## 📹 Screen Share & Webcam Media Tracking

PurrTrack tracks when members are actively presenting or collaborating visually:

* **Real-Time State Slicing**: When a user turns on their camera (`selfVideo`) or starts sharing their screen (`streaming`), PurrTrack automatically slices the session segment in-place without ending the parent session. This guarantees down-to-the-second accuracy for screen sharing and webcam time.
* **Live Status Grid**: `/status` renders a clean, balanced 2-column embed with native Discord relative timestamps, presenting `🎙️ Voice & Audio` (Mic & Deafen) and `📺 Media & Video` (Screen Share & Camera) side-by-side.
* **Configurable Policies**: Admins can toggle `track_streaming` and `track_camera` via `/config set`.
* **Ignored Channels**: Channels can be excluded from tracking entirely via `/config channel_ignore` and restored via `/config channel_unignore` with interactive autocomplete.

---

## 💤 Inactivity Sleep Guard & Auto-Move

To prevent unattended voice channels from skewing timesheets, PurrTrack features an automated background inactivity watchdog:

* **Configurable Threshold**: Admins can set the server inactivity limit via `/config set [max_inactive_minutes: 15-180]` (default: 60 minutes).
* **Multi-Signal Inactivity Detection**: Evaluates voice mute state (`selfMute` or `serverMute`), screen sharing status (`streaming`), and camera status (`selfVideo`). If a user has been unmuted or streaming/presenting, their activity timer resets automatically.
* **Dual-Action Fallback Policy**:
  * **Auto-Move to AFK Channel**: If the server has a configured Discord AFK voice channel (`guild.afkChannelId`), inactive members are automatically transferred to the AFK channel.
  * **Auto-Disconnect Fallback**: If no AFK channel exists or the server does not have one designated, the watchdog cleanly disconnects the idle member from voice.
* **Guaranteed Timesheet Integrity**: In both cases, PurrTrack immediately finalizes and commits the database voice session at the exact moment of inactivity detection, ensuring idle hours are never billed or counted on reports.

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
| **`/profile view / badges`** | ✅ Allowed | ✅ Allowed | ✅ Allowed |
| **`/profile equip / unequip`** | ✅ Allowed | ✅ Allowed | ✅ Allowed |
| **`/leaderboard`** | ✅ Allowed | ✅ Allowed | ✅ Allowed |
| **`/report user target:@self`** | ✅ Allowed | ✅ Allowed | ✅ Allowed |
| **`/report user target:@other_user`** | ⛔ **Blocked** | ✅ Allowed | ✅ Allowed |
| **`/report guild` (Server Timesheet)** | ⛔ **Blocked** | ✅ Allowed | ✅ Allowed |
| **`/config rate_view target:@self`** | ✅ Allowed | ✅ Allowed | ✅ Allowed |
| **`/config rate_view target:@other_user`** | ⛔ **Blocked** | ✅ Allowed | ✅ Allowed |
| **`/config rate_set` / `rate_remove`** | ⛔ **Blocked** | ⛔ **Blocked** | ✅ Allowed |
| **`/time add` / `subtract` / `history`** | ⛔ **Blocked** | ✅ Allowed | ✅ Allowed |
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

### 🌐 Fully Dynamic Server Timezone & Regional Localization
PurrTrack eliminates timezone confusion with zero static assumptions:
* **Server Timezone Configuration (`/config timezone zone:...`)**: Admins and Managers can configure the server's home timezone with live autocomplete supporting all **418+ canonical IANA timezones** (`Asia/Dhaka`, `America/New_York`, `Europe/London`), city searches (`Dhaka`, `Tokyo`, `Berlin`), and offset formats (`UTC+6`, `GMT-5`, `+6`).
* **Dynamic PDF Timesheets**: Column headers dynamically resolve to `START (${tzLabel})` and `END (${tzLabel})` (e.g. `START (UTC+6)`), displaying clean 12-hour clock timestamps (`08:44:54 PM`) within single-page printable bounds.
* **Unified Alignment Across Exporters**: Excel, CSV, and Discord Embeds automatically format all dates, timestamps, and column headers to the configured server timezone.
* **Timezone-Aware Date Math**: Presets (`Today`, `Yesterday`, `This Week`, `Last Week`, `This Month`, `Last Month`) calculate reporting boundaries relative to the server's local midnight rather than UTC.

---

## 📦 Monorepo Workspace Structure

```text
purrtrack/
├── apps/
│   ├── bot/                          # Discord Bot Service
│   │   ├── src/commands/             # /ping, /status, /report, /config, /goal, /focus, /profile, /leaderboard, /help
│   │   ├── src/engine/               # Voice Tracker, Focus Manager, Badge Manager & Role Reward Manager
│   │   ├── src/exporters/            # CSV, Excel, PDF, JSON, Discord Embed generators
│   │   ├── src/core/                 # Graceful exit watchdog, structured logger, announcer
│   │   ├── src/events/               # ready, voiceStateUpdate, interactionCreate
│   │   └── src/deploy-commands.ts    # Single global slash command registration script
│   │
│   └── api/                          # Fastify 5 REST API
│       └── src/                      # Health check (/health) and reporting endpoints
│
├── packages/
│   ├── shared/                       # Contracts, Zod schemas, DTOs, badge definitions, time utilities
│   │   └── src/                      # Session schemas, report schemas, duration formatters, badge metadata
│   │
│   └── db/                           # Drizzle ORM PostgreSQL Persistence
│       ├── src/schema/               # voice_sessions, session_segments, guild_settings, user_goals, user_badges
│       ├── src/repositories/         # VoiceSessionRepository, GuildSettingsRepository, UserGoalsRepository, UserBadgesRepository
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
# Clears any legacy guild duplicates and registers 10 global slash commands
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
| `/goal` | `reset` | — | Self | Cancel or forfeit your active weekly goal early. |
| `/focus` | `start` | `[timer: String]`, `[break: String]`, `[task: String]` | Public (Connected in Voice) | Starts a Pomodoro focus sprint (default: 25m work, 5m break) with automated completion alerts and distraction-free tracking. |
| `/focus` | `stop` | — | Public | Ends active focus session early and reports completed focus time. |
| `/focus` | `status` | — | Public | Checks remaining sprint time and active phase (work sprint vs break). |
| `/report` | `user` | `target: Member`, `[format]`, `[range]`, `[start_date]`, `[end_date]` | Self (Public) / Target (Manager) | Generates an individual timesheet in Excel, PDF, CSV, JSON, or Embed. Supports presets or custom dates/months (`YYYY-MM` or `YYYY-MM-DD`). If user has a contractor rate, PDF generates an official Invoice. Regular members can only view their own report. |
| `/report` | `guild` | `[format]`, `[range]`, `[start_date]`, `[end_date]` | Admin / Manager | Generates an aggregated timesheet and leaderboard across all voice channels for the entire server with custom date/month range support. |
| `/time` | `add` | `target: Member`, `duration: String`, `reason: String`, `[date: String]` | Admin / Manager | Manually credits time to a user (e.g. `1h 30m`, `45m`) with audit reason and optional backdate (`YYYY-MM-DD`, `yesterday`, or `today`). |
| `/time` | `subtract` | `target: Member`, `duration: String`, `reason: String`, `[date: String]` | Admin / Manager | Manually deducts time from a user with audit reason and optional backdate. |
| `/time` | `history` | `target: Member` | Admin / Manager | Displays the 10 most recent time adjustments applied to a member. |
| `/config` | `view` | — | Admin / Manager | Inspects current server tracking settings, ignored channels, and designated management roles. |
| `/config` | `set` | `[track_streaming]`, `[track_camera]`, `[max_inactive_minutes]` | Admin / Owner | Configures server tracking policies and AFK/inactivity threshold (15-180m). |
| `/config` | `rate_set` | `user: Member`, `hourly_rate: Number`, `[currency: String]` | Admin / Owner | Sets contractor hourly rate (default currency: BDT, or custom ISO code). |
| `/config` | `rate_remove` | `user: Member` | Admin / Owner | Removes contractor hourly rate. |
| `/config` | `rate_view` | `[user: Member]` | Self (Contractor) / Target (Manager) | Checks configured contractor rate and currency (read-only for members). |
| `/config` | `role_add` | `role: Role` | Admin / Owner | Grants Management permissions to a role (allows inspecting other users and pulling server-wide reports). |
| `/config` | `role_remove`| `role: Role` | Admin / Owner | Revokes Management permissions from a role. |
| `/config` | `channel_ignore` | `channel: Channel` | Admin / Owner | Adds a voice channel to the ignore list (bypasses tracking). |
| `/config` | `channel_unignore` | `channel: Channel` | Admin / Owner | Removes a voice channel from the ignore list with dynamic autocomplete. |
| `/config` | `timezone` | `zone: String` | Admin / Manager | Sets or updates server reporting timezone with dynamic autocomplete (418+ IANA timezones, cities, and UTC/GMT offsets). All reports and leaderboards automatically reflect this timezone. |
| `/profile` | `view` | `[target: Member]` | Public | View member profile card, equipped title, showcase rack, productivity stats, and unlock progress. |
| `/profile` | `badges` | `[target: Member]`, `[category: Category]` | Public | Browse all 26 achievement badges with criteria, icons, and unlock status. |
| `/profile` | `equip` | `slot: Number (1-3)`, `badge: Badge` | Self | Equip an unlocked badge into your showcase (Slot 1 = Primary Title, Slots 2-3 = Showcase Rack) with autocomplete. |
| `/profile` | `unequip` | `slot: Number (1-3)` | Self | Unequip a badge from your showcase. |
| `/leaderboard` | — | `[period: Period]`, `[metric: Metric]`, `[page: Number]` | Public | View server leaderboard with visual podiums (🥇🥈🥉), badge titles, and button pagination (◀️ Prev, Next ▶️, 🎯 My Rank). |
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
# Run complete test suite (90 unit & database integration tests across 8 suites)
pnpm test

# Run TypeScript compiler checks across all workspace packages
pnpm typecheck

# Build all monorepo packages
pnpm build
```

---

## 📄 License & Security

- **License**: Released under the [MIT License](LICENSE). Copyright © 2026 [Purrfect Software Ltd](https://github.com/purrfectsoft) & [Sakib Tamim](https://github.com/sakibtamim).
- **Security Policy**: For responsible disclosure and vulnerability reports, please consult our [Security Policy](.github/SECURITY.md).

