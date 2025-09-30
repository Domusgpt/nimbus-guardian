# 🛡️ Nimbus Guardian

**AI-Powered Cloud Deployment Safety for Everyone**

[![npm version](https://img.shields.io/npm/v/nimbus-guardian.svg)](https://www.npmjs.com/package/nimbus-guardian)
[![GitHub](https://img.shields.io/github/stars/Domusgpt/nimbus-guardian?style=social)](https://github.com/Domusgpt/nimbus-guardian)
[![Website](https://img.shields.io/badge/website-live-blue)](https://nimbus-guardian.web.app)

Never deploy broken code again. Your personal AI mentor for cloud deployment, security, and best practices.

---

## 🌟 What is Nimbus Guardian?

Nimbus Guardian is like having a senior developer watching over your shoulder, catching mistakes **before** they become problems. It uses Claude (Anthropic) and Gemini (Google AI) to explain issues in plain English and teach you as you code.

### Perfect for:

- 🌱 **New developers** - Learn deployment the right way
- 🚀 **Solo developers** - Catch issues before production
- 👥 **Teams** - Enforce best practices automatically
- 🎓 **Learners** - Get instant explanations of concepts

---

## ✨ Features

### 🔍 Smart Scanning
- **Security:** Catches exposed API keys, secrets, and vulnerabilities
- **Configuration:** Validates .env, .gitignore, and deployment configs
- **Dependencies:** Finds vulnerabilities and outdated packages
- **Performance:** Suggests optimizations and caching strategies
- **Docker:** Validates container security and best practices

### 🤖 AI-Powered Assistance
- **Natural Language:** Ask questions in plain English
- **Context-Aware:** Understands your project and experience level
- **Explanations:** Learn WHY something is wrong, not just WHAT
- **Code Review:** Get AI feedback on your code
- **Debugging Help:** Understand and fix errors faster

### 🔧 Auto-Fix Everything
- Missing .gitignore patterns
- Exposed .env files
- Security vulnerabilities
- Missing environment examples
- Common configuration issues

### 📚 Interactive Learning
- Built-in tutorials for beginners
- Concept explanations at your level
- Best practices guidance
- Real-time mentorship

---

## 🚀 Quick Start

### 1. Install

```bash
npm install -g nimbus-guardian
```

### 2. Setup (Super Easy!)

```bash
nimbus setup
```

Answer a few questions:
- What's your project name?
- Are you new to coding? (We adjust our help!)
- Which cloud platform? (Firebase, AWS, etc.)
- API keys for AI assistants (optional - we'll help you get them!)

### 3. Scan Your Project

```bash
nimbus scan
```

Get instant feedback on:
- Security issues
- Configuration problems
- Missing best practices
- Deployment readiness

### 4. Fix Issues Automatically

```bash
nimbus fix
```

Let the AI fix common issues automatically.

### 5. Get Help Anytime

```bash
nimbus chat
```

Chat with your AI assistant:
- "What does this error mean?"
- "How do I deploy to Firebase?"
- "Is my code secure?"
- "Explain environment variables like I'm 5"

---

## 📖 Commands

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

## 💬 Chat Examples

The AI assistant speaks human, not just code:

```bash
nimbus chat
```

**You:** *"I'm getting 'Cannot read property of undefined'. What does that mean?"*

**AI:** *"Great question! This error means you're trying to access a property on something that doesn't exist yet..."*

**You:** *"How do I deploy my Node.js app?"*

**AI:** *"Let me walk you through it step-by-step..."*

**You:** *"What's the difference between dependencies and devDependencies?"*

**AI:** *"Think of it like this: dependencies are ingredients you need to serve your dish to customers..."*

---

## 📊 Web Dashboard

Launch the interactive dashboard:

```bash
nimbus dashboard
```

Opens at http://localhost:3333 with:
- 🔍 Real-time project scanning
- 📈 Security metrics
- 🎯 Issue tracking
- 🤖 AI-powered insights
- ⚡ One-click fixes

---

## 🎓 Learning Mode

Built-in tutorials for beginners:

```bash
nimbus learn
```

Choose from:
- 🌱 Git & Version Control Basics
- 🌍 Environment Variables
- 🔐 Security Best Practices
- 🚀 Deploying Your First App
- 🐛 Debugging Like a Pro
- 📦 Understanding Dependencies
- 🐳 Docker Containers
- ⚙️ CI/CD Pipelines

---

## 🔑 Getting API Keys

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

**Cost:** Both have generous free tiers! Perfect for learning.

---

## 🛡️ What Nimbus Catches

### Security Issues (CRITICAL)
- ❌ API keys in code
- ❌ .env files in git
- ❌ Missing .gitignore patterns
- ❌ Hardcoded passwords
- ❌ Security vulnerabilities
- ❌ Exposed secrets

### Platform Validation (HIGH)
- 🐳 **Docker**: Root user detection, hardcoded secrets, :latest tags, multi-stage builds
- 🔥 **Firebase**: Security rules, open database access, configuration validation
- ⚠️ Missing environment files
- ⚠️ No .env.example
- ⚠️ Missing security headers

### Best Practices (MEDIUM)
- 💡 Missing compression
- 💡 No caching strategy
- 💡 Outdated dependencies
- 💡 Performance optimizations

---

## 🎯 Real-World Example

```bash
$ nimbus scan --ai

🔍 Starting comprehensive analysis...

📊 Scan Results
🔴 Critical: 1
🟠 High: 2
🟡 Medium: 3

❌ Issues Found:

🔴 .env file is tracked in git (exposes secrets!)
   📄 .env
   ✅ Auto-fixable

   🤖 AI Explanation:
   When you commit .env to git, anyone with access to your repository
   can see your secret keys and passwords. This is extremely dangerous
   because attackers could use these to access your databases, APIs,
   and user data. Always keep .env in .gitignore!

🟠 Dockerfile doesn't specify USER (runs as root by default)
   ✅ Auto-fixable

   🤖 AI Explanation:
   Running containers as root is a security risk. If an attacker
   compromises your container, they have full system access. Always
   create a non-root user in your Dockerfile...

$ nimbus fix

🔧 Found 2 fixable issues
? Fix these issues? Yes

✅ Removed .env from git
✅ Added USER directive to Dockerfile

All fixes applied!
```

---

## 🌱 For Complete Beginners

Don't worry if terms like "environment variables" or "API keys" sound confusing. Nimbus explains everything in plain English!

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

Type your question in normal English. No technical jargon required!

---

## 🔧 How It Works

1. **Scans** your project files for common issues
2. **Analyzes** Docker, Firebase, dependencies, security patterns
3. **Explains** using AI (Claude or Gemini) at your experience level
4. **Fixes** automatically when safe
5. **Teaches** you how to prevent issues next time

**Privacy:** Your code is only sent to AI when you explicitly use `--ai` flag or `chat` command. Regular scans run 100% locally.

---

## 🏗️ Project Structure

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
│   └── dashboard.html         # Interactive UI
├── setup.js                    # Interactive setup wizard
├── package.json                # Dependencies
└── README.md                  # This file
```

---

## 🤝 CI/CD Integration

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

# Now every commit will be scanned automatically!
```

**Manual hook:**
```bash
#!/bin/bash
nimbus scan --quick || exit 1
```

---

## 📊 Experience Levels

Nimbus adapts to your experience:

### 🌱 Beginner
- Simple, jargon-free explanations
- Step-by-step instructions
- Lots of encouragement
- "Why" explanations for everything

### 🌿 Intermediate
- Best practices focus
- Multiple solution approaches
- Industry standards
- Practical examples

### 🌳 Advanced
- Architecture insights
- Performance deep-dives
- Enterprise considerations
- Cutting-edge techniques

Change anytime: `nimbus setup`

---

## 🐛 Troubleshooting

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

## 🌟 Pro Tips

1. **Auto-scan commits:** `nimbus install-hooks`
2. **Quick checks:** `nimbus scan --quick` (< 5 seconds)
3. **CI/CD integration:** Use `--fail-on critical` for exit codes
4. **Dashboard mode:** `nimbus dashboard` for visual interface
5. **Learning?** Use `nimbus explain` and `nimbus learn` liberally

---

## 🎯 What's Next?

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

## 📜 License

© 2025 Paul Phillips - Clear Seas Solutions LLC
All Rights Reserved - Proprietary Technology

For licensing inquiries: Paul@clearseassolutions.com

---

## 🌟 A Paul Phillips Manifestation

**Send Love, Hate, or Opportunity to:** Paul@clearseassolutions.com
**Join The Exoditical Moral Architecture Movement:** [Parserator.com](https://parserator.com)

> *"The Revolution Will Not be in a Structured Format"*

**Making cloud deployment safe and accessible for everyone, one commit at a time.**

---

**Ready to deploy with confidence?**

```bash
npm install -g nimbus-guardian
nimbus setup
```

Let's go! 🚀

---

## 🔗 Links

- 📦 **npm**: https://www.npmjs.com/package/nimbus-guardian
- 💻 **GitHub**: https://github.com/Domusgpt/nimbus-guardian
- 🌐 **Website**: https://nimbus-guardian.web.app
- 📚 **Documentation**: Coming soon at docs.nimbus-guardian.web.app

---

## 📈 Current Status

**Version**: 1.0.0 (Launch Ready!)

### ✅ Fully Tested Features
- Security scanning (API keys, secrets, .env exposure)
- Docker validation (5 security checks)
- Firebase validation (security rules, config)
- Dependency vulnerability scanning
- AI assistance (Claude + Gemini)
- Auto-fix capabilities
- CLI with all commands
- Web dashboard (backend ready)
- Pre-commit hooks
- CI/CD integration

### 🔜 Coming Soon
- Dashboard frontend integration (guide available)
- AWS validator
- GCP validator
- Documentation site (Docusaurus)
- Video tutorials

See [WIP-STATUS.md](WIP-STATUS.md) for detailed progress tracking.