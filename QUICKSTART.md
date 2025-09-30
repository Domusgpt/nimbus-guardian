# ⚡ Quick Start - Get Running in 5 Minutes

## For Complete Beginners (Never Coded Before?)

Welcome! This tool will help you deploy safely. Don't worry about the technical stuff - we'll explain everything.

### Step 1: Install Dependencies

```bash
cd intelligent-cloud-guardian
npm install
```

**What does this do?** Downloads the helper libraries this tool needs.

### Step 2: Make it Available Everywhere

```bash
npm link
```

**What does this do?** Lets you type `guardian` from any folder on your computer.

### Step 3: Setup (Takes 2 minutes)

```bash
guardian setup
```

Answer these questions:
- **Project name?** Type your app's name (or just press Enter)
- **Experience level?** Choose "Just starting out"
- **Cloud platform?** Pick the one you're using (or "Not sure yet")
- **AI assistant?** Choose "Both" to get help from Claude and Gemini

**About API Keys:**
- These are like passwords that let Guardian talk to AI
- Don't have them yet? The tool will show you exactly where to get them
- It's free for beginners! Both services have generous free tiers

### Step 4: Check Your Project

```bash
cd /path/to/your/project
guardian scan
```

**What happens?** Guardian looks at your code and tells you:
- 🔴 Critical problems that could break things
- 🟠 Important issues to fix
- 🟡 Suggestions to make your code better

### Step 5: Fix Issues (The Easy Way!)

```bash
guardian fix
```

**What happens?** Guardian fixes common problems automatically. You just say "yes"!

---

## For Intermediate Developers

### Quick Setup

```bash
cd intelligent-cloud-guardian
npm install && npm link
guardian setup
```

Choose "intermediate" experience level.

### Daily Workflow

```bash
# Before committing
guardian scan --ai

# Fix automatically
guardian fix

# Pre-deployment check
guardian pre-deploy

# Need help?
guardian chat
```

### Get AI Explanations

```bash
guardian explain "docker security"
guardian debug "Cannot read property of undefined"
```

---

## For Advanced Developers

### Installation

```bash
npm install && npm link
guardian setup
```

Select "advanced" experience level for expert-focused insights.

### Integration

**Pre-commit Hook:**
```bash
echo '#!/bin/bash\nguardian scan --quick || exit 1' > .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```

**CI/CD (GitHub Actions):**
```yaml
- name: Security & Best Practice Check
  run: |
    npm install -g /path/to/intelligent-cloud-guardian
    guardian scan --fail-on high
```

**Package Scripts:**
```json
{
  "scripts": {
    "guardian": "guardian scan --ai",
    "pre-deploy": "guardian pre-deploy"
  }
}
```

### Advanced Usage

```bash
guardian scan --deep --ai                    # Comprehensive analysis
guardian explain "microservices architecture"
guardian chat                                 # Architecture discussions
```

---

## Getting API Keys (5 Minutes)

### Claude (Anthropic)

1. Go to: https://console.anthropic.com/
2. Click "Sign Up" (or "Log In")
3. Verify your email
4. Go to "API Keys" section
5. Click "Create Key"
6. Copy the key (starts with `sk-ant-`)
7. Paste when `guardian setup` asks

**Free Tier:** $5 credit when you sign up (plenty for learning!)

### Gemini (Google AI)

1. Go to: https://makersuite.google.com/app/apikey
2. Sign in with Google
3. Click "Create API Key"
4. Select or create a project
5. Copy the key
6. Paste when `guardian setup` asks

**Free Tier:** 60 requests per minute (more than enough!)

### Add Keys Later

Already ran setup? Add keys manually:

```bash
nano .guardian/.env
```

Add these lines:
```
CLAUDE_API_KEY=your-claude-key-here
GEMINI_API_KEY=your-gemini-key-here
```

---

## First Time Using Guardian?

Try this learning path:

### 1. Scan Your Project
```bash
guardian scan --ai
```

See what Guardian finds. Don't panic if there are issues - that's normal!

### 2. Learn About Issues
```bash
guardian explain "environment variables"
guardian explain "gitignore"
guardian explain "security headers"
```

### 3. Fix Issues
```bash
guardian fix
```

Let Guardian fix the easy stuff.

### 4. Chat for Custom Help
```bash
guardian chat
```

Ask:
- "Why is .env important?"
- "How do I deploy this?"
- "Is my code secure?"
- "What should I do next?"

### 5. Learn Fundamentals
```bash
guardian learn
```

Pick a tutorial and start learning!

---

## Common First-Time Questions

**Q: Will Guardian change my code?**
A: Only if you say "yes" when it asks! It never makes changes without asking first.

**Q: Do I need API keys to use Guardian?**
A: The scanning works without them! But AI explanations and chat need keys.

**Q: Is this safe? Will my code be sent somewhere?**
A: Scans run 100% locally. Code is only sent to AI when you use `--ai` flag or `chat` command.

**Q: What if I break something?**
A: Guardian uses git, so you can always undo changes with `git reset --hard HEAD`

**Q: How much does it cost?**
A: The tool is free! AI services have free tiers (Claude: $5 credit, Gemini: 60 req/min)

**Q: I'm completely new. Will I understand this?**
A: Yes! Guardian explains everything in plain English. Try `guardian learn` to start.

**Q: What should I do first?**
A: Run `guardian setup`, then `guardian learn`, then `guardian scan` on your project.

---

## Test It's Working

```bash
# Check Guardian is installed
guardian --help

# Should see:
# 🛡️  Intelligent Cloud Guardian
# AI-Powered Deployment Safety for Everyone

# Run setup
guardian setup

# Should see welcome wizard

# Try chat (if you have API keys)
guardian chat
# Ask: "Hello! How do you work?"
```

If you see errors:
1. Make sure you ran `npm install`
2. Make sure you ran `npm link`
3. Try `npm link` again
4. Still stuck? Open an issue on GitHub

---

## Next Steps

After setup:

1. **Scan your project:** `guardian scan --ai`
2. **Fix issues:** `guardian fix`
3. **Learn basics:** `guardian learn`
4. **Get help anytime:** `guardian chat`
5. **Before deploying:** `guardian pre-deploy`

---

## Tips for Success

### For Beginners
- Don't skip `guardian learn` - it's built for you!
- Ask questions in `guardian chat` - there are no stupid questions
- Use `--ai` flag to get explanations: `guardian scan --ai`
- Run `guardian scan` often to catch issues early

### For Everyone
- Run `guardian scan` before every commit
- Use `guardian pre-deploy` before deploying
- Bookmark `guardian chat` for quick help
- Share Guardian with your team!

---

## Help & Support

**Stuck?** Try:
```bash
guardian chat
# Ask: "I'm having trouble with [describe issue]"
```

**Bug or Feature Request?**
Open an issue with your feedback!

**Questions?**
Paul@clearseassolutions.com

---

**Ready? Let's go!**

```bash
guardian setup
```

🚀