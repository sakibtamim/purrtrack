# Security Policy

The PurrTrack engineering team takes the security of our voice time-tracking software, Discord integrations, and user data very seriously. We appreciate the efforts of security researchers and community members who responsibly report vulnerabilities.

---

## 🛡️ Supported Versions

Only the latest active versions of PurrTrack receive security patches and updates. We strongly encourage all operators and self-hosters to stay updated with the latest releases.

| Version | Supported          | Status             |
| ------- | ------------------ | ------------------ |
| 1.0.x   | :white_check_mark: | Currently Supported |
| < 1.0   | :x:                | End of Life (EOL)  |

---

## 🚨 Reporting a Vulnerability

**Please DO NOT report security vulnerabilities through public GitHub issues, discussions, or pull requests.**

If you discover a security vulnerability in PurrTrack, please disclose it responsibly through one of the following channels:

### Option 1: GitHub Private Vulnerability Reporting (Recommended)
You can report security vulnerabilities privately via GitHub:
1. Navigate to the repository's **[Security Tab](https://github.com/sakibtamim/purrtrack/security)**.
2. Select **Advisories** and click **Report a vulnerability**.
3. Fill out the advisory form with detailed reproduction steps and impact.

### Option 2: Direct Email
Alternatively, report directly to our security contacts:
- ✉️ **security@purrfecthq.com**
- ✉️ **sakib@purrfecthq.com**

Please include **`[SECURITY] PurrTrack Vulnerability Report`** in the subject line.

---

## 📋 What to Include in Your Report

To help us investigate and resolve the issue quickly, please provide as much context as possible:

- **Summary**: A clear description of the vulnerability and its potential security impact.
- **Affected Components**: Specify which service or package is affected (`apps/bot`, `apps/api`, `packages/db`, `packages/shared`, or reporting exporters).
- **Reproduction Steps**: Step-by-step instructions or minimal proof-of-concept (PoC) code to reproduce the issue.
- **Environment**: Node.js version, PostgreSQL version, OS, and deployment configuration.
- **Mitigation / Remediation**: Suggested fixes or workarounds, if available.

---

## ⏱️ Response & Disclosure Process

When a vulnerability is submitted, we follow a strict coordinated disclosure process:

1. **Initial Acknowledgment**: We will acknowledge receipt of your report within **48 hours**.
2. **Triage & Assessment**: We will assess severity (CVSS), reproduce the behavior, and determine affected versions within **5 business days**.
3. **Fix & Verification**: A security patch will be developed, tested in isolation, and verified against regression suites.
4. **Coordinated Release & Advisory**: We will publish a patched release and credit the reporter in the GitHub Security Advisory (unless you request anonymity).

---

## 🔒 Security Best Practices for Self-Hosting

When self-hosting PurrTrack, we strongly recommend following these security practices:

- **Secret Protection**: Never commit `.env` or expose sensitive environment variables (`DISCORD_BOT_TOKEN`, `DATABASE_URL`).
- **Database Hardening**:
  - Restrict PostgreSQL access to private networks or localhost.
  - Use strong passwords and enable TLS/SSL for remote database connections.
  - Follow the principle of least privilege for database user accounts.
- **API Isolation**:
  - Ensure the Fastify API (`API_PORT=4100`) is placed behind a secure reverse proxy (e.g., Caddy, NGINX, or Cloudflare Tunnel) with HTTPS/TLS.
  - Configure rate limiting and firewall rules to prevent abuse.
- **Discord Bot Permissions**:
  - Grant only the minimum necessary Discord Gateway intents and channel permissions required for voice tracking and command execution.
- **Dependency Hygiene**:
  - Regularly run `pnpm audit` and keep runtime dependencies updated.
