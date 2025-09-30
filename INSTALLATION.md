# 📦 Installation Guide

## Super Quick Install (Recommended)

```bash
cd intelligent-cloud-guardian
./install.sh
```

That's it! The script will:
- ✅ Check Node.js and npm
- ✅ Install all dependencies
- ✅ Make scripts executable
- ✅ Link `guardian` command globally
- ✅ Verify installation

---

## Manual Installation

### Requirements

- **Node.js** 16+ ([Download](https://nodejs.org/))
- **npm** 8+ (comes with Node.js)

### Steps

1. **Install dependencies**
```bash
cd intelligent-cloud-guardian
npm install
```

2. **Link globally**
```bash
npm link
```

Or with sudo if needed:
```bash
sudo npm link
```

3. **Verify installation**
```bash
guardian --version
```

---

## First Time Setup

After installation, run the setup wizard:

```bash
guardian setup
```

You'll be asked:
1. **Project name** - What are you building?
2. **Experience level** - Beginner, intermediate, or advanced?
3. **Cloud platform** - Firebase, AWS, GCP, etc.?
4. **AI provider** - Claude, Gemini, or both?
5. **API keys** - Optional, but recommended for AI features

### Getting API Keys (Free!)

#### Claude (Anthropic)
1. Visit: https://console.anthropic.com/
2. Sign up (free $5 credit)
3. Create API key
4. Paste in setup

#### Gemini (Google AI)
1. Visit: https://makersuite.google.com/app/apikey
2. Sign in with Google
3. Create API key
4. Paste in setup

**Both have generous free tiers - perfect for learning!**

---

## Quick Test

```bash
# See available commands
guardian --help

# Launch dashboard
guardian dashboard

# Chat with AI
guardian chat

# Scan a project
cd /path/to/your/project
guardian scan
```

---

## Updating

Pull latest changes and reinstall:

```bash
cd intelligent-cloud-guardian
git pull
npm install
npm link
```

---

## Uninstall

```bash
npm unlink -g intelligent-cloud-guardian
```

---

## Troubleshooting

### "command not found: guardian"

**Solution 1:** Restart your terminal

**Solution 2:** Run npm link again
```bash
cd intelligent-cloud-guardian
npm link
```

**Solution 3:** Check npm global path
```bash
npm config get prefix
# Make sure this is in your PATH
```

### "Permission denied"

Use sudo:
```bash
sudo npm link
```

### "Cannot find module"

Reinstall dependencies:
```bash
rm -rf node_modules
npm install
npm link
```

### API key errors

Check your keys:
```bash
cat .guardian/.env
```

Re-run setup:
```bash
guardian setup
```

### Dashboard won't open

Try a different port:
```bash
guardian dashboard -p 8080
```

Check if port is in use:
```bash
lsof -i :3333
```

---

## Platform-Specific Notes

### macOS

Should work out of the box with Homebrew Node.js:
```bash
brew install node
cd intelligent-cloud-guardian
./install.sh
```

### Linux

May need sudo for global install:
```bash
cd intelligent-cloud-guardian
npm install
sudo npm link
```

### Windows (WSL)

Works great in WSL! Follow Linux instructions.

### Windows (Native)

Use PowerShell or Git Bash:
```powershell
cd intelligent-cloud-guardian
npm install
npm link
```

---

## Next Steps

After installation:

1. **Run setup:** `guardian setup`
2. **Read quickstart:** `cat QUICKSTART.md`
3. **Launch dashboard:** `guardian dashboard`
4. **Try on a project:** `cd your-project && guardian scan`

---

## Need Help?

**Installation issues?**
```bash
guardian chat
# Ask: "I'm having trouble installing Guardian"
```

**Still stuck?**
- Check the README.md
- Email: Paul@clearseassolutions.com
- Open a GitHub issue

---

**You're about to make deployment way easier! 🚀**