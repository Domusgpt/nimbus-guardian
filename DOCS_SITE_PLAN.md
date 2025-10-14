# 📚 DOCUMENTATION SITE PLAN

## Goal
Create comprehensive documentation at docs.nimbus-guardian.web.app

## Platform Choice: Docusaurus ⭐ (Recommended)

**Why Docusaurus:**
- Used by Meta, Stripe, Supabase
- Great search functionality
- Beautiful default theme
- Easy to deploy to Firebase
- Markdown-based (we already have docs)
- Versioned docs support

## Quick Setup

```bash
cd /mnt/c/Users/millz/intelligent-cloud-guardian

# Create docs directory
npx create-docusaurus@latest docs classic

# Or faster template
npx create-docusaurus@latest docs classic --typescript=false
```

## Structure

```
docs/
├── docs/
│   ├── intro.md
│   ├── getting-started/
│   │   ├── installation.md
│   │   ├── quick-start.md
│   │   └── setup.md
│   ├── features/
│   │   ├── security-scanning.md
│   │   ├── ai-assistance.md
│   │   ├── docker-validation.md
│   │   ├── firebase-validation.md
│   │   ├── auto-fix.md
│   │   └── dashboard.md
│   ├── guides/
│   │   ├── ci-cd-integration.md
│   │   ├── pre-commit-hooks.md
│   │   ├── custom-validators.md
│   │   └── troubleshooting.md
│   ├── api/
│   │   ├── guardian-engine.md
│   │   ├── validators.md
│   │   ├── cli-reference.md
│   │   └── programmatic-use.md
│   └── community/
│       ├── contributing.md
│       ├── roadmap.md
│       └── faq.md
├── blog/
│   └── 2025-09-30-launch.md
├── src/
│   └── pages/
│       └── index.js (custom homepage)
├── static/
│   └── img/
├── docusaurus.config.js
└── sidebars.js
```

## Content Migration

### From Existing Files:
1. **README.md** → docs/intro.md
2. **QUICKSTART.md** → docs/getting-started/quick-start.md
3. **FEATURES.md** → Split into features/*.md
4. **INSTALLATION.md** → docs/getting-started/installation.md
5. **ARCHITECTURE.md** → docs/api/architecture.md

### New Content Needed:
- CLI Command Reference (all commands with examples)
- API Documentation (GuardianEngine, validators)
- Video tutorials (screen recordings)
- FAQ (common questions)

## Firebase Deployment

### Option 1: Separate Subdomain
```bash
# Create new Firebase project for docs
firebase projects:create nimbus-docs

# Initialize hosting
cd docs
firebase init hosting
# Public directory: build
# Single-page app: Yes

# Build and deploy
npm run build
firebase deploy
```

**Result**: docs.nimbus-guardian.web.app

### Option 2: Subdirectory (Simpler)
```json
// firebase.json
{
  "hosting": {
    "public": "public",
    "rewrites": [
      {
        "source": "/docs/**",
        "destination": "/docs/index.html"
      },
      {
        "source": "**",
        "destination": "/index.html"
      }
    ]
  }
}
```

**Result**: nimbus-guardian.web.app/docs

## Quick Start Commands

```bash
# 1. Create Docusaurus site
npx create-docusaurus@latest docs classic

# 2. Start dev server
cd docs
npm start
# Opens http://localhost:3000

# 3. Add content
# Edit docs/*.md files

# 4. Build for production
npm run build

# 5. Deploy to Firebase
firebase init hosting
firebase deploy
```

## Observability microsite refresh

To support the Claude Code plugin rollout we’ll sync the main marketing site and docs portal with a light-touch content update that respects the current holographic look-and-feel.

1. **Landing page hero card** – Add a tertiary call-to-action beneath the dashboard showcase that links to [parserstor.com](https://parserstor.com) for deeper partner resources while reusing the existing glowing button styles.
2. **Observability deep-dive section** – Introduce a new scroll block that mirrors the CLI walkthroughs (`status`, `stream`, `history`, `incidents`, `digest`) with icon tiles and short captions, each pointing back to the on-site documentation.
3. **Upcoming products teaser** – Reserve a gradient band near the footer that teases the soon-to-be released **Reposiologist** and **Vib3-Scribe** companions, positioning them as complementary storytelling and repository intelligence tools without altering the established typography scale.
4. **Docs alignment** – Create matching pages inside Docusaurus under `docs/observability/` so the marketing site and documentation share terminology, screenshots, and updated copy.
5. **Design guardrails** – Lock in the existing font stack, neon grid background, and holographic card treatment; only swap copy and imagery so the vibe stays intact while the content evolves.
6. **Orbit Terminal preview** – Embed a code-preview surface that rotates through CLI commands, exposes copy-to-clipboard helpers, and summarizes when to reach for each flow. Reuse this same content in the docs portal so the messaging stays synchronized.
7. **Trajectory timeline** – Capture major exporter, CLI, and plugin releases in a compact roadmap block so stakeholders can retell the observability story without digging through dev notes.

These updates can ship as a single content deployment once the new screenshots and copy clear review.

## Docusaurus Config

```javascript
// docusaurus.config.js
module.exports = {
  title: 'Nimbus Guardian',
  tagline: 'AI-Powered Cloud Deployment Safety',
  url: 'https://nimbus-guardian.web.app',
  baseUrl: '/docs/',

  organizationName: 'Domusgpt',
  projectName: 'nimbus-guardian',

  themeConfig: {
    navbar: {
      title: 'Nimbus Guardian',
      logo: {
        alt: 'Nimbus Logo',
        src: 'img/logo.svg',
      },
      items: [
        {
          type: 'doc',
          docId: 'intro',
          position: 'left',
          label: 'Docs',
        },
        {to: '/blog', label: 'Blog', position: 'left'},
        {
          href: 'https://github.com/Domusgpt/nimbus-guardian',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Docs',
          items: [
            {label: 'Getting Started', to: '/docs/intro'},
            {label: 'Features', to: '/docs/features'},
            {label: 'API Reference', to: '/docs/api'},
          ],
        },
        {
          title: 'Community',
          items: [
            {label: 'GitHub', href: 'https://github.com/Domusgpt/nimbus-guardian'},
            {label: 'Twitter', href: 'https://twitter.com/nimbus-guardian'},
          ],
        },
      ],
      copyright: `© ${new Date().getFullYear()} Paul Phillips - Clear Seas Solutions LLC`,
    },
  },

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: require.resolve('./sidebars.js'),
          editUrl: 'https://github.com/Domusgpt/nimbus-guardian/tree/main/docs/',
        },
        blog: {
          showReadingTime: true,
          editUrl: 'https://github.com/Domusgpt/nimbus-guardian/tree/main/docs/',
        },
        theme: {
          customCss: require.resolve('./src/css/custom.css'),
        },
      },
    ],
  ],
};
```

## Priority Content (Week 1)

### Must Have:
1. **Getting Started** (intro.md)
   - What is Nimbus?
   - Why use it?
   - Quick 5-minute demo

2. **Installation** (installation.md)
   - npm install command
   - Requirements
   - Troubleshooting

3. **CLI Reference** (cli-reference.md)
   - All commands with examples
   - Flags and options
   - Use cases

4. **Features Overview** (features/*.md)
   - Security scanning
   - AI assistance
   - Auto-fix
   - Dashboard

### Nice to Have (Week 2):
1. **Guides** (guides/*.md)
   - CI/CD integration
   - Pre-commit hooks
   - Docker best practices
   - Firebase security

2. **API Docs** (api/*.md)
   - GuardianEngine class
   - Validators
   - Programmatic use

3. **FAQ** (faq.md)
   - Common questions
   - Troubleshooting
   - Best practices

## Alternative: GitHub Wiki

**Pros:**
- Built into GitHub
- Easy to edit
- No deployment needed

**Cons:**
- Less pretty
- No search
- Limited customization

**Setup:**
```bash
# Enable wiki in repo settings
# Then add pages manually or via API
```

## Alternative: Simple Markdown in /docs

**Pros:**
- Super simple
- GitHub renders it
- No build step

**Cons:**
- No navigation
- No search
- Basic styling

**Setup:**
```bash
mkdir docs
# Copy markdown files
# Link from README
```

## Recommendation

**For v1.0 Launch**: GitHub Wiki (fast)
**For v1.1**: Docusaurus on Firebase (professional)
**For v2.0**: Add video tutorials, interactive examples

## Timeline

**Week 1** (GitHub Wiki):
- Day 1: Enable wiki, add 5 core pages
- Day 2-3: Migrate existing docs
- Day 4: Add CLI reference
- Day 5: FAQ and troubleshooting

**Week 2-3** (Docusaurus):
- Day 1: Setup Docusaurus
- Day 2-3: Migrate from wiki
- Day 4: Custom styling
- Day 5: Deploy to Firebase

**Estimated Total**: 2-3 days for Docusaurus setup + content migration

## Quick Win: Update Website Links

Until docs exist, update website to point to GitHub:

```html
<!-- In public/index.html -->
<a href="https://github.com/Domusgpt/nimbus-guardian#readme">Documentation</a>
<a href="https://github.com/Domusgpt/nimbus-guardian/wiki">Guides</a>
<a href="https://github.com/Domusgpt/nimbus-guardian/issues">Support</a>
```

---

# 🌟 A Paul Phillips Manifestation

**© 2025 Paul Phillips - Clear Seas Solutions LLC**
