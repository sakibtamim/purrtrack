# Feature Issue: Interactive Web Dashboard & Real-Time Voice Analytics

## 📌 Summary
Build an interactive web dashboard for PurrTrack using Next.js/Vite React and the existing `apps/api` Fastify backend. The dashboard will allow server managers, team leads, and members to log in via Discord OAuth2 to visualize live voice channel activity, inspect historical timesheets with dynamic charts, and download reports without executing Discord slash commands.

---

## 🎯 Target Audience & Use Cases
1. **Contractors & Employees**: Log in to view personal timesheets, weekly goal progress bars, and export their own invoices.
2. **Managers & Admins**: View server-wide leaderboards, audit live voice channels in real-time, configure rates, and export multi-user Excel/PDF reports.

---

## 🏗 Architecture & Tech Stack
- **Frontend App**: `apps/web` (Next.js 14+ or React + Vite)
- **Styling**: Vanilla CSS Design System or modern CSS modules with dark mode support.
- **Charts**: Recharts or Chart.js for time-series activity heatmaps.
- **Backend**: Expand existing `apps/api` (Fastify 5) with:
  - `@fastify/oauth2` or `@fastify/session` for Discord OAuth2 login.
  - JWT / session-based authentication verifying Discord server roles.
  - Endpoints to fetch live sessions, historical aggregations, and settings.
- **Database**: Drizzle ORM directly accessing PostgreSQL `voice_sessions`, `session_segments`, and `guild_settings`.

---

## 📋 Key Features & Requirements

### 1. Discord OAuth2 Authentication & Role-Based Views
- User logs in with Discord (`identify`, `guilds`, `guilds.members.read`).
- Backend verifies guild membership and role permissions:
  - **Regular Members**: Restricted to viewing their personal tracking stats.
  - **Managers / Admins**: Full server dashboard with multi-member analytics and server configuration.

### 2. Live Channel Radar (Real-Time Floor Plan)
- Visual live map displaying active voice channels and current members connected.
- Live elapsed timers updating dynamically every second (`01:24:18`).
- Badges for Muted, Deafened, and Screen-sharing statuses.

### 3. Analytics & Heatmap Charts
- **Time Distribution Chart**: Daily voice hours across the current week/month.
- **Peak Hours Heatmap**: Highlights peak activity hours (e.g. 2 PM - 5 PM).
- **Top Channels & Contributors Leaderboard**: Sortable rankings table.

### 4. Interactive Report Exporter
- Date picker with custom date range selection.
- One-click downloads for:
  - Excel (`.xlsx`)
  - PDF Timesheets
  - CSV (`\uFEFF` UTF-8 BOM)
  - JSON

### 5. Server Settings Management (Admin Only)
- Toggle tracking on/off per server.
- Manage ignored channels and designated management roles.
- Set contractor hourly rates.

---

## 📦 Acceptance Criteria
- [ ] Responsive UI supporting desktop and mobile browsers.
- [ ] Secure Discord OAuth2 callback with CSRF state protection.
- [ ] Strict RBAC matching bot's permissions matrix.
- [ ] E2E and component tests for core dashboard flows.
