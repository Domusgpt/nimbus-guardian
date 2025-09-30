# 🏗️ System Architecture

## Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                   INTELLIGENT CLOUD GUARDIAN                     │
│                  Your AI-Powered DevOps Portal                   │
└─────────────────────────────────────────────────────────────────┘

                              ┌────────┐
                              │  USER  │
                              └───┬────┘
                                  │
                    ┌─────────────┼─────────────┐
                    │             │             │
              ┌─────▼─────┐ ┌────▼────┐ ┌──────▼──────┐
              │  CLI Tool │ │Dashboard│ │  AI Chat    │
              │           │ │(Web UI) │ │             │
              └─────┬─────┘ └────┬────┘ └──────┬──────┘
                    │             │             │
                    └─────────────┼─────────────┘
                                  │
                    ┌─────────────▼─────────────┐
                    │   GUARDIAN ENGINE (Core)  │
                    │  • Security Scanning      │
                    │  • Tool Detection         │
                    │  • Auto-Fix System        │
                    │  • Analysis Engine        │
                    └─────────────┬─────────────┘
                                  │
                    ┌─────────────┼─────────────┐
                    │             │             │
        ┌───────────▼──────────┐  │  ┌─────────▼────────┐
        │   AI ASSISTANT       │  │  │  TOOL DETECTOR   │
        │  • Claude API        │  │  │  • Cloud CLIs    │
        │  • Gemini API        │  │  │  • Frameworks    │
        │  • Context Manager   │  │  │  • Dependencies  │
        └──────────────────────┘  │  └──────────────────┘
                                  │
                    ┌─────────────▼─────────────┐
                    │   YOUR PROJECT            │
                    │  • Files & Code           │
                    │  • Git Repository         │
                    │  • Configuration          │
                    └─────────────┬─────────────┘
                                  │
        ┌─────────────────────────┼─────────────────────────┐
        │                         │                         │
  ┌─────▼──────┐    ┌────────────▼────────┐    ┌──────────▼────────┐
  │  Firebase  │    │     GitHub          │    │   AWS/GCP/Azure   │
  │  • CLI     │    │     • gh CLI        │    │   • Cloud CLIs    │
  │  • Deploy  │    │     • Actions       │    │   • Services      │
  └────────────┘    └─────────────────────┘    └───────────────────┘
```

---

## Component Details

### 1. CLI Interface (`cli.js`)

**Purpose:** Command-line interface for all operations

**Commands:**
```
setup       → Setup wizard
dashboard   → Launch web UI
scan        → Security scan
tools       → Detect tools
fix         → Auto-fix issues
chat        → AI assistant
learn       → Tutorials
explain     → Concept explanation
debug       → Error debugging
pre-deploy  → Deployment check
```

**Flow:**
```
User types command
    ↓
Commander.js parses
    ↓
Loads config from .guardian/
    ↓
Executes appropriate module
    ↓
Displays formatted output
```

---

### 2. Guardian Engine (`guardian-engine.js`)

**Purpose:** Core analysis and scanning logic

**Capabilities:**

```
┌──────────────────────────────────────┐
│      GUARDIAN ENGINE                 │
├──────────────────────────────────────┤
│                                      │
│  📁 File System Analysis             │
│  • Reads project files               │
│  • Scans for patterns                │
│  • Detects configurations            │
│                                      │
│  🔒 Security Scanning                │
│  • Exposed secrets detection         │
│  • Vulnerability checking            │
│  • Git history analysis              │
│  • Dependency auditing               │
│                                      │
│  🔧 Auto-Fix System                  │
│  • .gitignore updates                │
│  • .env file management              │
│  • Package.json fixes                │
│  • npm vulnerability fixes           │
│                                      │
│  📊 Issue Management                 │
│  • Severity classification           │
│  • Priority determination            │
│  • Fix recommendations               │
│  • Progress tracking                 │
│                                      │
└──────────────────────────────────────┘
```

**Analysis Flow:**
```
1. checkGitignore()
   └─> Verify critical patterns

2. scanForSecrets()
   └─> Pattern matching for API keys

3. checkEnvironmentFiles()
   └─> .env, .env.example validation

4. analyzeDependencies()
   └─> npm audit, outdated packages

5. checkSecurity()
   └─> Helmet, CORS, headers

6. checkPerformance()
   └─> Compression, caching

7. generateAIInsights() (if --ai)
   └─> Get AI explanations
```

---

### 3. Tool Detector (`tool-detector.js`)

**Purpose:** Detect cloud tools, CLIs, and dependencies

**Detection Methods:**

```
┌────────────────────────────────────────┐
│       TOOL DETECTOR                    │
├────────────────────────────────────────┤
│                                        │
│  🔍 File-Based Detection               │
│  • firebase.json → Firebase            │
│  • Dockerfile → Docker                 │
│  • vercel.json → Vercel                │
│                                        │
│  📦 Package-Based Detection            │
│  • dependencies → Framework            │
│  • @google-cloud/* → GCP               │
│  • aws-sdk → AWS                       │
│                                        │
│  💻 CLI Detection                      │
│  • which firebase                      │
│  • which docker                        │
│  • which gcloud                        │
│                                        │
│  🎯 Smart Recommendations              │
│  • Framework → Testing tools           │
│  • Database → Migration tools          │
│  • No monitoring → Sentry/Winston      │
│                                        │
└────────────────────────────────────────┘
```

**Detection Hierarchy:**
```
Project Root
    │
    ├─> Config Files Detection
    │   ├─> firebase.json → Firebase
    │   ├─> vercel.json → Vercel
    │   └─> Dockerfile → Docker
    │
    ├─> package.json Analysis
    │   ├─> dependencies
    │   ├─> devDependencies
    │   └─> scripts
    │
    ├─> CLI Availability Check
    │   ├─> firebase (installed?)
    │   ├─> vercel (installed?)
    │   └─> docker (installed?)
    │
    └─> Recommendations
        ├─> Missing testing
        ├─> No CI/CD
        └─> Missing monitoring
```

---

### 4. AI Assistant (`ai-assistant.js`)

**Purpose:** Intelligent help via Claude and Gemini

**Architecture:**

```
┌─────────────────────────────────────────────┐
│          AI ASSISTANT                       │
├─────────────────────────────────────────────┤
│                                             │
│  🧠 Provider Selection                      │
│  ┌───────────────────────────────────────┐ │
│  │ Question Analysis                     │ │
│  │  • "explain" → Claude                 │ │
│  │  • "generate code" → Gemini           │ │
│  │  • Complex debugging → Claude         │ │
│  │  • Quick answers → Gemini             │ │
│  └───────────────────────────────────────┘ │
│                                             │
│  📊 Context Management                      │
│  ┌───────────────────────────────────────┐ │
│  │ • Conversation history (last 20)      │ │
│  │ • Project information                 │ │
│  │ • User experience level               │ │
│  │ • Current issues/errors               │ │
│  └───────────────────────────────────────┘ │
│                                             │
│  🎓 Experience-Level Adaptation             │
│  ┌───────────────────────────────────────┐ │
│  │ Beginner:    Simple, encouraging      │ │
│  │ Intermediate: Practical, detailed     │ │
│  │ Advanced:     Technical, in-depth     │ │
│  └───────────────────────────────────────┘ │
│                                             │
│  💬 Specialized Methods                     │
│  • explainIssue()                           │
│  • debugError()                             │
│  • generateSolution()                       │
│  • teachConcept()                           │
│  • reviewCode()                             │
│  • planDeployment()                         │
│                                             │
└─────────────────────────────────────────────┘
```

**Conversation Flow:**
```
User Question
    ↓
Detect Best Provider
    ↓
Format with Context
    ↓
Send to AI API
    ↓
Receive Response
    ↓
Store in History
    ↓
Return to User
```

---

### 5. Dashboard Server (`dashboard-server.js`)

**Purpose:** Web-based project management interface

**Architecture:**

```
┌────────────────────────────────────────────────┐
│            DASHBOARD SERVER                    │
│                (Port 3333)                     │
├────────────────────────────────────────────────┤
│                                                │
│  🌐 HTTP Server                                │
│  ┌──────────────────────────────────────────┐ │
│  │ Pure Node.js HTTP                        │ │
│  │ No Express needed                        │ │
│  │ RESTful API + HTML serving               │ │
│  └──────────────────────────────────────────┘ │
│                                                │
│  🔌 API Endpoints                              │
│  ┌──────────────────────────────────────────┐ │
│  │ GET  /api/status      → Project info     │ │
│  │ GET  /api/scan        → Security scan    │ │
│  │ GET  /api/tools       → Tool detection   │ │
│  │ GET  /api/git-status  → Git info         │ │
│  │ POST /api/fix         → Auto-fix issue   │ │
│  │ POST /api/chat        → AI assistant     │ │
│  │ POST /api/install     → Install tool     │ │
│  └──────────────────────────────────────────┘ │
│                                                │
│  🎨 Frontend (Single HTML)                     │
│  ┌──────────────────────────────────────────┐ │
│  │ Vanilla JavaScript (no frameworks)       │ │
│  │ CSS Grid layout                          │ │
│  │ Fetch API for backend calls              │ │
│  │ Auto-refresh every 30 seconds            │ │
│  └──────────────────────────────────────────┘ │
│                                                │
│  💬 Real-time Chat                             │
│  ┌──────────────────────────────────────────┐ │
│  │ Floating chat widget                     │ │
│  │ Direct AI integration                    │ │
│  │ Message history                          │ │
│  └──────────────────────────────────────────┘ │
│                                                │
└────────────────────────────────────────────────┘
```

**Dashboard Sections:**
```
┌─────────────────────────────────────────┐
│  DASHBOARD LAYOUT                       │
├─────────────────────────────────────────┤
│                                         │
│  📊 Project Status Card                 │
│  • Name, path, experience level         │
│  • Dependencies count                   │
│  • Git branch and uncommitted changes   │
│                                         │
│  🛡️ Security Scan Card                  │
│  • Critical, High, Medium, Low counts   │
│  • Visual severity indicators           │
│  • Health badge                         │
│                                         │
│  📁 Git Status Card                     │
│  • Current branch                       │
│  • Uncommitted files                    │
│  • Recent commits                       │
│                                         │
│  🔧 Tools & Dependencies (Full Width)   │
│  • Detected cloud providers             │
│  • Missing tools with install buttons   │
│  • Recommendations                      │
│                                         │
│  ⚠️ Issues & Recommendations            │
│  • All issues with severity icons       │
│  • One-click fix buttons                │
│  • Detailed descriptions                │
│                                         │
│  💬 AI Chat (Floating)                  │
│  • Bottom-right FAB                     │
│  • Expandable chat window               │
│  • Message history                      │
│                                         │
└─────────────────────────────────────────┘
```

---

## Data Flow

### Scan Flow

```
User: guardian scan --ai
    ↓
CLI: Load config from .guardian/config.json
    ↓
Engine: Initialize GuardianEngine
    ↓
Engine: Run all checks
    │
    ├─> checkGitignore()
    ├─> scanForSecrets()
    ├─> checkEnvironmentFiles()
    ├─> analyzeDependencies()
    ├─> checkSecurity()
    ├─> checkPerformance()
    └─> checkDeploymentReadiness()
    ↓
Engine: Collect issues
    ↓
AI: (if --ai) Get explanations
    │
    ├─> For each critical/high issue
    ├─> Send to Claude/Gemini
    └─> Store insights
    ↓
CLI: Display formatted results
    │
    ├─> Issues by severity
    ├─> AI explanations
    └─> Fix recommendations
```

### Fix Flow

```
User: guardian fix
    ↓
Engine: Scan for issues
    ↓
CLI: Display fixable issues
    ↓
User: Confirm fixes
    ↓
Engine: Apply fixes
    │
    ├─> fixGitignore()
    ├─> removeEnvFromGit()
    ├─> createEnvExample()
    └─> fixVulnerabilities()
    ↓
CLI: Show success messages
    ↓
Engine: Re-scan to verify
```

### Dashboard Flow

```
User: guardian dashboard
    ↓
Server: Start HTTP server on port 3333
    ↓
Server: Auto-open browser
    ↓
Browser: Load index.html
    ↓
Frontend: Call API endpoints
    │
    ├─> GET /api/status
    ├─> GET /api/scan
    ├─> GET /api/git-status
    └─> GET /api/tools
    ↓
Server: Execute corresponding functions
    │
    ├─> getProjectStatus()
    ├─> GuardianEngine.analyze()
    ├─> getGitStatus()
    └─> ToolDetector.analyze()
    ↓
Frontend: Render results
    ↓
Frontend: Auto-refresh every 30s
```

### Chat Flow

```
User: Types message in dashboard chat
    ↓
Frontend: POST /api/chat
    ↓
Server: Parse message
    ↓
AI: Initialize AIAssistant
    ↓
AI: Detect best provider
    │
    ├─> "explain" → Claude
    └─> "generate" → Gemini
    ↓
AI: Format with context
    │
    ├─> Project info
    ├─> User experience level
    └─> Conversation history
    ↓
AI: Send to API
    ↓
AI: Receive response
    ↓
Frontend: Display in chat
    ↓
Frontend: Store in history
```

---

## File Structure

```
.guardian/
├── config.json              # User configuration
├── .env                     # API keys (gitignored)
└── logs/                    # Operation logs

Project Root/
├── .gitignore               # Enhanced by Guardian
├── .env                     # Protected by Guardian
├── .env.example             # Created by Guardian
├── package.json             # Analyzed by Guardian
└── [your project files]
```

---

## Integration Points

### External CLIs

```
Guardian calls via execSync():

firebase deploy
    ↓
Guardian monitors output
    ↓
Shows status in dashboard

gh pr create
    ↓
Guardian tracks PR
    ↓
Shows in git status

docker build
    ↓
Guardian validates Dockerfile
    ↓
Shows security recommendations
```

### AI APIs

```
Claude API:
• Model: claude-3-5-sonnet-20241022
• Max tokens: 4096
• System prompt: Experience-level adapted
• Conversation history: Last 20 exchanges

Gemini API:
• Model: gemini-pro
• Temperature: 0.7
• Max output tokens: 2048
• Generation config: Balanced
```

---

## Performance Considerations

### Scanning Speed

```
Quick Scan (guardian scan):
• ~2-5 seconds for typical project
• Scans: gitignore, secrets, env, security
• Skips: Deep analysis, AI explanations

Deep Scan (guardian scan --deep):
• ~10-30 seconds for typical project
• Additional: Performance, dependencies, Docker
• Includes: All checks + recommendations

AI Scan (guardian scan --ai):
• +5-10 seconds per AI call
• Limited to: Top 3 critical/high issues
• Async: Multiple issues in parallel
```

### Dashboard Performance

```
Initial Load:
• 4 parallel API calls
• ~1-2 seconds total

Auto-refresh:
• Every 30 seconds
• Only updates changed sections
• Minimal bandwidth usage

Chat:
• Instant UI updates
• AI responses: 2-5 seconds
• Streaming: Not yet implemented (future)
```

---

## Security Model

### Data Privacy

```
Local Operations (100% Private):
├── File scanning
├── Pattern matching
├── Git operations
├── Tool detection
└── Configuration management

AI Operations (Opt-in):
├── --ai flag required
├── chat command explicit
├── explain command explicit
└── debug command explicit

Never Transmitted:
├── Source code (unless pasted in chat)
├── Passwords/secrets
├── File contents
├── Environment variables
└── User data
```

### API Key Storage

```
.guardian/.env (gitignored):
CLAUDE_API_KEY=sk-ant-...
GEMINI_API_KEY=...

Permissions:
• Read: Only Guardian processes
• Write: Only setup command
• Location: Project-local (.guardian/)
• Backup: User responsibility
```

---

## Error Handling

### Graceful Degradation

```
Missing API keys:
  ↓
Scan works without AI
  ↓
Chat shows helpful error
  ↓
Suggests: guardian setup

Missing CLIs:
  ↓
Detects and reports
  ↓
Provides install instructions
  ↓
Offers one-click install (npm packages)

Invalid project:
  ↓
Works with minimal features
  ↓
Suggests initialization
  ↓
Guides user step-by-step
```

---

## Extension Points

### Adding New Cloud Providers

```javascript
// In tool-detector.js

const indicators = {
    'new-provider': [
        'config-file.yml',
        '.provider-folder'
    ]
};

const clis = {
    'new-provider': {
        name: 'provider-cli',
        command: 'provider',
        install: 'npm install -g provider-cli',
        docs: 'https://...'
    }
};
```

### Adding New Checks

```javascript
// In guardian-engine.js

async checkNewFeature() {
    // Your check logic
    if (problemDetected) {
        this.issues.push({
            id: 'feature-issue',
            severity: 'HIGH',
            category: 'Category',
            message: 'Description',
            autoFixable: true
        });
    }
}

// Add to analyze()
await this.checkNewFeature();
```

---

**Guardian Architecture: Built for extensibility, privacy, and education.**