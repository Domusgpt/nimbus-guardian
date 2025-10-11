# Nimbus Guardian

AI-Powered Cloud Deployment Safety for Everyone

[![npm version](https://img.shields.io/npm/v/nimbus-guardian.svg)](https://www.npmjs.com/package/nimbus-guardian)
[![GitHub](https://img.shields.io/github/stars/Domusgpt/nimbus-guardian?style=social)](https://github.com/Domusgpt/nimbus-guardian)

Never deploy broken code again. Your personal AI mentor for cloud deployment, security, and best practices.

---

## What is Nimbus Guardian?

Nimbus Guardian is like having a senior developer watching over your shoulder, catching mistakes before they become problems. It uses Claude (Anthropic) and Gemini (Google AI) to explain issues in plain English and teach you as you code.

### Perfect for:

- **New developers** - Learn deployment the right way
- **Solo developers** - Catch issues before production
- **Teams** - Enforce best practices automatically
- **Learners** - Get instant explanations of concepts

---

## Features

### Smart Scanning
- **Security:** Catches exposed API keys, secrets, and vulnerabilities
- **Configuration:** Validates .env, .gitignore, and deployment configs
- **Dependencies:** Finds vulnerabilities and outdated packages
- **Performance:** Suggests optimizations and caching strategies
- **Docker:** Validates container security and best practices
- **Firebase:** Checks security rules and configuration

### AI-Powered Assistance
- **Natural Language:** Ask questions in plain English
- **Context-Aware:** Understands your project and experience level
- **Explanations:** Learn WHY something is wrong, not just WHAT
- **Code Review:** Get AI feedback on your code
- **Debugging Help:** Understand and fix errors faster

### Auto-Fix
- Missing .gitignore patterns
- Exposed .env files
- Security vulnerabilities
- Missing environment examples
- Common configuration issues

### Interactive Learning
- Built-in tutorials for beginners
- Concept explanations at your level
- Best practices guidance
- Real-time mentorship

---

## Quick Start

### Install

```bash
npm install -g nimbus-guardian
```

### Setup

```bash
nimbus setup
```

Answer a few questions:
- What's your project name?
- Are you new to coding? (We adjust our help!)
- Which cloud platform? (Firebase, AWS, etc.)
- API keys for AI assistants (optional)

### Scan Your Project

```bash
nimbus scan
```

Get instant feedback on:
- Security issues
- Configuration problems
- Missing best practices
- Deployment readiness

### Fix Issues Automatically

```bash
nimbus fix
```

Let the AI fix common issues automatically.

### Get Help Anytime

```bash
nimbus chat
```

Chat with your AI assistant:
- "What does this error mean?"
- "How do I deploy to Firebase?"
- "Is my code secure?"
- "Explain environment variables"

---

## Commands

### Essential Commands

```bash
nimbus setup          # Interactive setup wizard
nimbus scan           # Scan project for issues
nimbus fix            # Auto-fix common issues
nimbus chat           # Chat with AI assistant
nimbus dashboard      # Launch web dashboard
nimbus install-hooks  # Add pre-commit hooks
```

### Advanced Commands

```bash
nimbus scan --quick             # Quick scan (essential checks only)
nimbus scan --ai                # Include AI explanations
nimbus scan --fail-on critical  # Exit code for CI/CD
nimbus scan --json              # Machine-readable output
nimbus explain <topic>          # Learn about any concept
nimbus debug "<error>"          # Get help with errors
```

---

## Web Dashboard

Launch the interactive dashboard:

```bash
nimbus dashboard
```

Opens at http://localhost:3333 with:
- Real-time project scanning
- Security metrics
- Issue tracking
- AI-powered insights

#### Allow additional dashboard origins

The dashboard APIs only trust the local loopback origins by default. If you embed the UI inside another trusted site (for example, an internal developer portal served from `https://portal.example.com`), set the `GUARDIAN_DASHBOARD_ALLOWED_ORIGINS` environment variable before running `nimbus dashboard`.

```bash
export GUARDIAN_DASHBOARD_ALLOWED_ORIGINS="https://portal.example.com"
nimbus dashboard
```

You can provide multiple comma- or newline-separated origins, but every entry must be an `http://` or `https://` origin. Unrecognized values are ignored for safety.

#### Observability snapshots

Nimbus now captures lightweight session and throttling telemetry while the dashboard runs. The built-in cards surface the live metrics, and operators can retrieve the raw snapshot at any time via:

```
GET /api/observability
```

The JSON response includes:

- Session lifecycle counters (active sessions, creations, touches, expirations) with ISO timestamps.
- Rate limit outcomes for each profile (actions, scans, chat, installs) with anonymized request fingerprints and last retry guidance.
- Persistent fingerprint telemetry summarizing hashed client identities, TTL, and latest activity even after dashboard restarts.
- Observability sink telemetry detailing disk and webhook delivery health (pending queue sizes, retry counts, timestamps).

All identifiers are hashed before exposure so observability tooling can monitor behavior without leaking cookies or IP addresses.

Need a live feed for remote dashboards? Connect to the streaming exporter:

```
GET /api/observability/stream
```

This endpoint uses Server-Sent Events (SSE) to push fingerprint summaries as they change. For example:

```bash
curl --no-buffer \
  -H "Cookie: guardian_session=<your-session-cookie>" \
  http://localhost:3333/api/observability/stream
```

Each `data:` frame contains a `type: "fingerprints"` payload with the latest anonymized fingerprint totals, recent activity windows, and any configured sink telemetry so operators can watch queue depth, delivery health, and batching counters in real time.

Prefer to avoid managing curl headers? Nimbus now includes a helper command that keeps your terminal subscribed:

```bash
nimbus observability-stream \
  --cookie "guardian_session=<your-session-cookie>"
```

The CLI prints formatted summaries by default—including per-sink status badges and nested metrics—or you can pass `--json` to emit newline-delimited payloads for piping into other tools. Use `--once` to exit after the next update or `--timeout 60` to auto-disconnect after a minute.

Need a quick health check without staying connected? Grab a single snapshot (including sink telemetry) whenever you need it:

```bash
nimbus observability-status \
  --cookie "guardian_session=<your-session-cookie>"
```

By default the command renders a readable summary showing total fingerprints plus per-sink delivery metrics and status badges. Add `--json` to print the raw API response or `--timeout 10` to raise an error if the dashboard takes longer than ten seconds to respond. Supply `--header KEY:VALUE` flags to forward custom headers such as `X-Forwarded-For` or additional authentication.

Trying to spot trends or confirm when a sink last updated? The dashboard now keeps a lightweight history buffer that you can query at any time:

```
GET /api/observability/history?limit=10
```

The response returns the most recent fingerprint snapshots—including sink telemetry—bounded by the optional `limit` parameter (defaults to 50 when omitted). Each entry carries the emitted timestamp so downstream tooling can reconstruct a short timeline without tailing the live stream. Operators can adjust the in-memory buffer size with the `GUARDIAN_OBSERVABILITY_HISTORY_LIMIT` environment variable when launching the dashboard.

CLI fans can request the same backlog using:

```bash
nimbus observability-status \
  --cookie "guardian_session=<your-session-cookie>" \
  --history 5
```

When `--history` is supplied Nimbus appends a “Recent observability history” section after the live snapshot (or returns `{ "snapshot": ..., "history": [...], "overview": {...} }` in JSON mode) so operators can see the latest fingerprint totals and sink counts over the requested window. Nimbus also prints an aggregated history overview ahead of the timestamped entries so you can glance at coverage length, min/max fingerprint totals, average activity, and sink transition counts without parsing the raw payloads.

Need durable breadcrumbs for compliance or offline analysis? Set the `GUARDIAN_OBSERVABILITY_LOG_PATH` environment variable before launching the dashboard and Nimbus will append every fingerprint snapshot to that file as newline-delimited JSON.

##### Snapshot summary rollups

Snapshots now include a `summary` block that condenses the most useful fingerprint and sink metrics into a quick-glance digest. The exporter tallies how many fingerprints are currently tracked, how many recent entries are active, the combined session count for the recent window, and the TTL/last-update metadata provided by the fingerprint store. Sink telemetry receives the same treatment: Nimbus records how many sinks are registered, buckets them by health status, tracks how many are exporting metrics, and highlights degraded or failing destinations under an `unhealthy` key.

Both `nimbus observability-stream` and `nimbus observability-status` render this rollup automatically so operators can immediately see counts and health summaries without parsing the raw JSON. History output reuses the same aggregates, surfacing failing/degraded sink totals alongside each archived timestamp for faster troubleshooting. Downstream tooling can read the same structure programmatically from `/api/observability`, `/api/observability/stream`, or `/api/observability/history` responses under `payload.summary`.

##### History overview analytics

The history endpoint now includes an `overview` companion object that summarizes trends across the returned snapshots. It reports the total number of entries, the first/last emission timestamps, and the millisecond coverage window so you know how much time the buffer spans. Fingerprint analytics capture min/max/average totals, average recent fingerprint volume, maximum active fingerprints, session-count averages, and a unique fingerprint estimate drawn from the recent window. Sink analytics highlight how many unique sinks appeared, aggregate status occurrence counts, the number of status transitions (broken down by `from->to` pairs), how many snapshots reported degraded/failing sinks, how often sink metric collection errored, and when the most recent unhealthy snapshot occurred. Nimbus now layers an incident timeline on top of those aggregates: the exporter detects whenever a sink transitions into a degraded or failing state, tracks how long the incident lasts (until recovery, removal, or the end of the requested window), and returns a concise ledger of those events. Incident summaries include total/open counts, per-status tallies, the longest observed duration, per-sink breakdowns, and the most recent incident details so operators can prioritize remediation without spelunking through raw history entries.

The CLI renders this overview automatically whenever `--history` is requested, printing a dedicated “Incidents” section with recent events and their durations. Automation can inspect the same structure under `overview.sinks.incidents` from either the status client or the dashboard API responses.

##### Dedicated incident reports

Operators who need to drill into outages without fetching the full snapshot backlog can now hit a purpose-built endpoint:

```
GET /api/observability/incidents?status=failing&sink=webhook&open=true&limit=5
```

The dashboard reuses the cached history overview to generate a filtered incident ledger, returning totals, per-status/per-sink counts, and the matching records sorted by recency. Omit the query parameters to retrieve every tracked incident or supply multiple `status=`/`sink=` values (comma-separated or repeated) to focus on specific sinks and health states. The optional `open` flag accepts `true`/`false` while `limit` caps how many incidents are returned after filtering.

Nimbus also exposes the same analytics through a dedicated CLI helper:

```bash
nimbus observability-incidents \
  --cookie "guardian_session=<your-session-cookie>" \
  --status failing degraded \
  --sink webhook \
  --open
```

By default the command prints a human-readable report that summarizes the applied filters, total/open counts, per-status and per-sink breakdowns, and a ledger of the most recent incidents with start/end timestamps and durations. Add `--closed` to focus on resolved outages, `--limit 3` to keep the ledger short, or `--json` to capture the raw API payload for downstream tooling. Custom headers and alternate endpoints are supported via the existing `--header` and `--url` options shared with the other observability commands.

#### Claude Code observability plugin

Working inside Claude Code? The repository now ships with a dedicated plugin so you can access the observability tooling without
memorizing every CLI flag. Add the local marketplace and install the plugin:

```shell
/plugin marketplace add ./claude-plugins
/plugin install nimbus-guardian-observability@claude-plugins
```

The plugin registers `/observability-status`, `/observability-history`, `/observability-stream`, and `/observability-incidents`
commands that wrap the corresponding `node cli.js` helpers. Each command walks you through optional cookies, headers, and
formatting preferences before executing the Nimbus CLI from within Claude Code. Check `claude-plugins/nimbus-guardian-
observability/README.md` for additional usage notes.

##### Snapshot change deltas

Every fingerprint snapshot now carries a lightweight `delta` block that highlights what changed since the previous emission. The exporter tracks fingerprint totals, recent fingerprint additions/removals, and per-sink status or metric shifts so operators can immediately spot activity spikes or failing sinks. Both the streaming and status CLI commands surface these deltas—look for the `Δ Fingerprint activity` and `Δ Sink changes` sections after each payload—or inspect the raw JSON to programmatically react to the same data.

```bash
export GUARDIAN_OBSERVABILITY_LOG_PATH="/var/log/nimbus/observability.log"
nimbus dashboard
```

The log writer creates directories as needed, stores entries with a `receivedAt` timestamp, and automatically rotates the file once it grows past ~1 MB (keeping up to five historical archives with `.1`, `.2`, etc. suffixes). Dashboard operators can confirm the sink is healthy by checking the `/api/observability` response – the `sinks` array will include a `disk-log` entry describing the resolved path, rotation thresholds, and a `status`/`statusReason` pair that flips to **degraded** or **failing** when writes begin erroring.

Need to fan fingerprints out to a remote observability platform instead? Provide a webhook endpoint and Nimbus will POST every snapshot as JSON with automatic retries on transient failures:

```bash
export GUARDIAN_OBSERVABILITY_WEBHOOK_URL="https://ops.example.com/hooks/nimbus"
export GUARDIAN_OBSERVABILITY_WEBHOOK_HEADERS='{"Authorization":"Bearer <token>","X-Source":"nimbus-dashboard"}'
export GUARDIAN_OBSERVABILITY_WEBHOOK_TIMEOUT_MS=5000
export GUARDIAN_OBSERVABILITY_WEBHOOK_MAX_RETRIES=3
# Optional batching controls to limit request volume during traffic spikes
export GUARDIAN_OBSERVABILITY_WEBHOOK_BATCH_MAX_ITEMS=10
export GUARDIAN_OBSERVABILITY_WEBHOOK_BATCH_MAX_WAIT_MS=1000
export GUARDIAN_OBSERVABILITY_WEBHOOK_BATCH_MAX_BYTES=32768
nimbus dashboard
```

Each request includes the fingerprint summary plus a `sentAt` timestamp so downstream processors can reconcile delivery time. When batching is enabled Nimbus coalesces multiple summaries into a single payload shaped as:

```json
{
  "type": "fingerprints-batch",
  "sentAt": "2025-10-10T12:00:00.000Z",
  "count": 3,
  "entries": [
    { "type": "fingerprints", "sentAt": "2025-10-10T11:59:30.000Z", ... },
    { "type": "fingerprints", "sentAt": "2025-10-10T11:59:45.000Z", ... },
    { "type": "fingerprints", "sentAt": "2025-10-10T12:00:00.000Z", ... }
  ]
}
```

The `/api/observability` snapshot now exposes real-time delivery telemetry for every configured sink. Webhook entries report queue depth, batching configuration, the last HTTP status observed, and timestamps for the most recent successes or failures alongside a health `status` and explanatory `statusReason`. This makes it easy to verify that batches are flushing on schedule and to alert when downstream endpoints stop accepting payloads.

When batching is enabled the snapshot also includes a `batchingStats` object that tracks how and when deliveries are flushed. Counters cover manual flush invocations, automatic drains triggered by the `maxItems`, `maxBytes`, or `maxWaitMs` thresholds, and the largest batch Nimbus has shipped so far. Each update stamps the most recent flush reason and ISO timestamp so operators can confirm the pipeline is moving regularly. The `nimbus observability-status` CLI renders the nested structure directly, keeping related counters grouped for quick triage.

Requests still honor custom headers from the JSON blob exactly as provided, making it easy to attach API tokens or routing hints without touching code. Tune the batching knobs to trade latency for lower webhook volume or set them to `1`/`0` to preserve one-request-per-snapshot behavior.

---

## Getting API Keys

### Claude (Anthropic)
1. Visit: https://console.anthropic.com/
2. Sign up or log in
3. Create API key
4. Add to Nimbus: `nimbus setup`

**Best for:** Detailed explanations, complex debugging

### Gemini (Google AI)
1. Visit: https://makersuite.google.com/app/apikey
2. Sign in with Google
3. Click "Create API Key"
4. Add to Nimbus: `nimbus setup`

**Best for:** Quick answers, code generation

**Cost:** Both have generous free tiers.

---

## What Nimbus Catches

### Security Issues (CRITICAL)
- API keys in code
- .env files in git
- Missing .gitignore patterns
- Hardcoded passwords
- Security vulnerabilities
- Exposed secrets

### Platform Validation (HIGH)
- **Docker**: Root user detection, hardcoded secrets, :latest tags, multi-stage builds
- **Firebase**: Security rules, open database access, configuration validation
- Missing environment files
- No .env.example
- Missing security headers

### Best Practices (MEDIUM)
- Missing compression
- No caching strategy
- Outdated dependencies
- Performance optimizations

---

## Real-World Example

```bash
$ nimbus scan --ai

Starting comprehensive analysis...

Scan Results
Critical: 1
High: 2
Medium: 3

Issues Found:

[CRITICAL] .env file is tracked in git (exposes secrets!)
   File: .env
   Auto-fixable: Yes

   AI Explanation:
   When you commit .env to git, anyone with access to your repository
   can see your secret keys and passwords. This is extremely dangerous
   because attackers could use these to access your databases, APIs,
   and user data. Always keep .env in .gitignore!

[HIGH] Dockerfile doesn't specify USER (runs as root by default)
   Auto-fixable: Yes

   AI Explanation:
   Running containers as root is a security risk. If an attacker
   compromises your container, they have full system access. Always
   create a non-root user in your Dockerfile.

$ nimbus fix

Found 2 fixable issues
? Fix these issues? Yes

✓ Removed .env from git
✓ Added USER directive to Dockerfile

All fixes applied!
```

---

## For Complete Beginners

Don't worry if terms like "environment variables" or "API keys" sound confusing. Nimbus explains everything in plain English.

**First time?** Just run:

```bash
nimbus setup
nimbus learn
```

Choose "Git & Version Control Basics" and start learning by doing.

**Stuck?** Ask for help:

```bash
nimbus chat
```

Type your question in normal English. No technical jargon required.

---

## How It Works

1. **Scans** your project files for common issues
2. **Analyzes** Docker, Firebase, dependencies, security patterns
3. **Explains** using AI (Claude or Gemini) at your experience level
4. **Fixes** automatically when safe
5. **Teaches** you how to prevent issues next time

**Privacy:** Your code is only sent to AI when you explicitly use `--ai` flag or `chat` command. Regular scans run 100% locally.

---

## Project Structure

```
nimbus-guardian/
├── cli.js                      # Main CLI interface
├── guardian-engine.js          # Core scanning engine
├── validators/                 # Platform validators
│   ├── docker-validator.js    # Docker security scanning
│   └── firebase-validator.js  # Firebase validation
├── ai-assistant.js             # Claude & Gemini integration
├── dashboard-server.js         # Web dashboard backend
├── public/                     # Dashboard frontend
├── setup.js                    # Interactive setup wizard
├── package.json                # Dependencies
└── README.md                  # This file
```

---

## CI/CD Integration

### GitHub Actions

```yaml
name: Security Scan
on: [push, pull_request]

jobs:
  nimbus-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Install Nimbus
        run: npm install -g nimbus-guardian
      - name: Run Security Scan
        run: nimbus scan --fail-on critical
```

### Pre-commit Hook (Automatic)

```bash
# Install git hooks
nimbus install-hooks

# Now every commit will be scanned automatically
```

**Manual hook:**
```bash
#!/bin/bash
nimbus scan --quick || exit 1
```

---

## Experience Levels

Nimbus adapts to your experience:

### Beginner
- Simple, jargon-free explanations
- Step-by-step instructions
- Lots of encouragement
- "Why" explanations for everything

### Intermediate
- Best practices focus
- Multiple solution approaches
- Industry standards
- Practical examples

### Advanced
- Architecture insights
- Performance deep-dives
- Enterprise considerations
- Cutting-edge techniques

Change anytime: `nimbus setup`

---

## Troubleshooting

### "No AI provider configured"
Run `nimbus setup` and add your API keys.

### "Invalid API key"
Check your keys in `.nimbus/.env` or run `nimbus setup` again.

### "Command not found: nimbus"
```bash
npm install -g nimbus-guardian
```

### Still stuck?
```bash
nimbus chat
```
Ask: "I'm having trouble with [your issue]"

---

## Pro Tips

1. **Auto-scan commits:** `nimbus install-hooks`
2. **Quick checks:** `nimbus scan --quick` (< 5 seconds)
3. **CI/CD integration:** Use `--fail-on critical` for exit codes
4. **Dashboard mode:** `nimbus dashboard` for visual interface
5. **Learning?** Use `nimbus explain` and `nimbus learn` liberally

---

## What's Next?

After setup, try this workflow:

```bash
# 1. Check your project health
nimbus scan --ai

# 2. Fix issues automatically
nimbus fix

# 3. Learn about any confusing issues
nimbus explain "environment variables"

# 4. Install pre-commit hooks
nimbus install-hooks

# 5. Launch web dashboard
nimbus dashboard
```

---

## Licensing

**Copyright © 2025 Paul Phillips - Clear Seas Solutions LLC**
**All Rights Reserved - Proprietary Software**

This is proprietary software. Personal, non-commercial use is permitted for evaluation purposes only.

For commercial use, enterprise licensing, or custom deployments, contact:

**Paul Phillips**
Chairman, Clear Seas Solutions LLC
Email: chairman@parserator.com
Website: https://parserator.com

See LICENSE.md for full terms.

---

## Links

- npm: https://www.npmjs.com/package/nimbus-guardian
- GitHub: https://github.com/Domusgpt/nimbus-guardian
- Website: https://nimbus-guardian.web.app
- Documentation: Coming soon

---

## Current Status

**Version**: 1.0.0

### Fully Tested Features
- Security scanning (API keys, secrets, .env exposure)
- Docker validation (5 security checks)
- Firebase validation (security rules, config)
- Dependency vulnerability scanning
- AI assistance (Claude + Gemini)
- Auto-fix capabilities
- CLI with all commands
- Web dashboard backend
- Pre-commit hooks
- CI/CD integration

### Upcoming Features
- Dashboard frontend integration
- AWS validator
- GCP validator
- Documentation site
- Video tutorials

See WIP-STATUS.md for detailed progress tracking.

---

**A Paul Phillips Manifestation**

Making cloud deployment safe and accessible for everyone, one commit at a time.

**Ready to deploy with confidence?**

```bash
npm install -g nimbus-guardian
nimbus setup
```
