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

Each `data:` frame contains a `type: "fingerprints"` payload with the latest anonymized fingerprint totals and recent activity windows, ready to ingest into log forwarders or remote dashboards.

Prefer to avoid managing curl headers? Nimbus now includes a helper command that keeps your terminal subscribed:

```bash
nimbus observability-stream \
  --cookie "guardian_session=<your-session-cookie>"
```

The CLI prints formatted summaries by default, or you can pass `--json` to emit newline-delimited payloads for piping into other tools. Use `--once` to exit after the next update or `--timeout 60` to auto-disconnect after a minute.

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
