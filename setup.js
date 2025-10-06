#!/usr/bin/env node

/**
 * Interactive Setup Wizard for Intelligent Cloud Guardian
 * A Paul Phillips Manifestation - Paul@clearseassolutions.com
 * "The Revolution Will Not be in a Structured Format" © 2025
 */

const inquirer = require('inquirer');
const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');
const boxen = require('boxen');

function createConfigFromAnswers(answers) {
    const config = {
        projectName: answers.projectName,
        experienceLevel: answers.experience,
        preferredProvider: answers.aiProvider,
        platform: answers.cloudProvider,
        setupDate: new Date().toISOString()
    };

    // Legacy fields for backward compatibility with older versions
    config.experience = config.experienceLevel;
    config.aiProvider = config.preferredProvider;
    config.cloudProvider = config.platform;

    return config;
}

async function setup() {
    console.clear();

    console.log(boxen(
        chalk.cyan.bold('🛡️  Intelligent Cloud Guardian Setup\n\n') +
        chalk.white('AI-Powered Deployment Assistant\n') +
        chalk.gray('Making cloud deployment safe and easy for everyone'),
        {
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'cyan'
        }
    ));

    console.log(chalk.yellow('\n👋 Welcome! Let\'s get you set up in just a few steps.\n'));

    const answers = await inquirer.prompt([
        {
            type: 'input',
            name: 'projectName',
            message: 'What\'s your project name?',
            default: path.basename(process.cwd())
        },
        {
            type: 'list',
            name: 'experience',
            message: 'How would you describe your coding experience?',
            choices: [
                { name: '🌱 Just starting out - I\'m brand new!', value: 'beginner' },
                { name: '🌿 Learning - I know the basics', value: 'intermediate' },
                { name: '🌳 Experienced - I know my way around', value: 'advanced' }
            ]
        },
        {
            type: 'list',
            name: 'cloudProvider',
            message: 'Which cloud platform are you using?',
            choices: [
                'Google Cloud (Firebase)',
                'AWS',
                'Azure',
                'Vercel',
                'Netlify',
                'Not sure yet'
            ]
        },
        {
            type: 'list',
            name: 'aiProvider',
            message: 'Which AI assistant would you like to use?',
            choices: [
                { name: '🤖 Claude (Anthropic) - Best for detailed explanations', value: 'claude' },
                { name: '🔮 Gemini (Google) - Great for quick answers', value: 'gemini' },
                { name: '✨ Both - Get help from either one!', value: 'both' }
            ],
            default: 'both'
        },
        {
            type: 'input',
            name: 'claudeApiKey',
            message: 'Enter your Claude API key (or press Enter to skip):',
            when: (answers) => answers.aiProvider === 'claude' || answers.aiProvider === 'both',
            validate: (input) => {
                if (!input) return true;
                if (input.startsWith('sk-ant-')) return true;
                return 'Claude API keys start with "sk-ant-"';
            }
        },
        {
            type: 'input',
            name: 'geminiApiKey',
            message: 'Enter your Google AI API key (or press Enter to skip):',
            when: (answers) => answers.aiProvider === 'gemini' || answers.aiProvider === 'both'
        },
        {
            type: 'confirm',
            name: 'needsApiKeyHelp',
            message: 'Need help getting API keys?',
            default: false,
            when: (answers) => !answers.claudeApiKey && !answers.geminiApiKey
        }
    ]);

    if (answers.needsApiKeyHelp) {
        showApiKeyHelp();
    }

    // Create configuration
    const config = createConfigFromAnswers(answers);

    const configDir = path.join(process.cwd(), '.guardian');
    await fs.ensureDir(configDir);
    await fs.writeJson(path.join(configDir, 'config.json'), config, { spaces: 2 });

    // Create .env file
    const envContent = `# Intelligent Cloud Guardian Configuration
# Generated: ${new Date().toISOString()}

${answers.claudeApiKey ? `CLAUDE_API_KEY=${answers.claudeApiKey}` : '# CLAUDE_API_KEY=your-key-here'}
${answers.geminiApiKey ? `GEMINI_API_KEY=${answers.geminiApiKey}` : '# GEMINI_API_KEY=your-key-here'}

# Project Configuration
PROJECT_NAME=${answers.projectName}
EXPERIENCE_LEVEL=${answers.experience}
PREFERRED_PROVIDER=${answers.aiProvider}
PLATFORM=${answers.cloudProvider}

# Legacy compatibility
AI_PROVIDER=${answers.aiProvider}
CLOUD_PROVIDER=${answers.cloudProvider}
`;

    await fs.writeFile(path.join(configDir, '.env'), envContent);

    // Update .gitignore
    const gitignorePath = path.join(process.cwd(), '.gitignore');
    let gitignoreContent = '';

    if (await fs.pathExists(gitignorePath)) {
        gitignoreContent = await fs.readFile(gitignorePath, 'utf-8');
    }

    if (!gitignoreContent.includes('.guardian/.env')) {
        gitignoreContent += '\n# Intelligent Cloud Guardian\n.guardian/.env\n.guardian/logs/\n';
        await fs.writeFile(gitignorePath, gitignoreContent);
    }

    // Create welcome guide
    const welcomeGuide = generateWelcomeGuide(answers);
    await fs.writeFile(path.join(configDir, 'WELCOME.md'), welcomeGuide);

    console.log('\n' + boxen(
        chalk.green.bold('✅ Setup Complete!\n\n') +
        chalk.white('Your Cloud Guardian is ready to help.\n\n') +
        chalk.cyan('Try these commands:\n') +
        chalk.gray('  guardian scan     - Check your project\n') +
        chalk.gray('  guardian chat     - Talk to your AI assistant\n') +
        chalk.gray('  guardian fix      - Auto-fix issues\n') +
        chalk.gray('  guardian learn    - Get tutorials\n'),
        {
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'green'
        }
    ));

    if (answers.experience === 'beginner') {
        console.log(chalk.yellow('\n💡 First time? Try: ') + chalk.cyan.bold('guardian learn basics\n'));
    }
}

function showApiKeyHelp() {
    console.log('\n' + boxen(
        chalk.bold('🔑 Getting Your API Keys\n\n') +
        chalk.cyan('Claude (Anthropic):\n') +
        chalk.white('1. Visit: https://console.anthropic.com/\n') +
        chalk.white('2. Sign up or log in\n') +
        chalk.white('3. Go to API Keys section\n') +
        chalk.white('4. Create a new key\n\n') +
        chalk.cyan('Gemini (Google AI):\n') +
        chalk.white('1. Visit: https://makersuite.google.com/app/apikey\n') +
        chalk.white('2. Sign in with Google\n') +
        chalk.white('3. Click "Create API Key"\n\n') +
        chalk.gray('You can add these keys later in .guardian/.env'),
        {
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'yellow'
        }
    ));
}

function generateWelcomeGuide(answers) {
    const experienceGuides = {
        beginner: `# 🌱 Welcome, New Developer!

You're at the beginning of an amazing journey. Cloud Guardian is here to help you every step of the way.

## What is Cloud Guardian?

Think of it as your personal coding mentor. It:
- 🔍 Checks your code for problems
- 🛡️ Protects you from security mistakes
- 💬 Explains things in plain English
- 🔧 Fixes common issues automatically
- 📚 Teaches you as you go

## Your First Steps

1. **Check your project**: Run \`guardian scan\`
   - This looks at your code and tells you what needs attention

2. **Chat with your AI assistant**: Run \`guardian chat\`
   - Ask questions like "What does this error mean?"
   - Get explanations about anything confusing

3. **Learn the basics**: Run \`guardian learn\`
   - Interactive tutorials
   - Learn by doing

## Common Questions

**Q: What's an API key?**
A: It's like a password that lets Cloud Guardian talk to AI assistants

**Q: Will this change my code?**
A: Only if you tell it to! It always asks first.

**Q: What if I break something?**
A: Guardian checks for problems before they happen!

## Need Help?

Just ask! Type \`guardian chat\` and say:
- "I don't understand this error"
- "How do I deploy my app?"
- "What should I do first?"

Your AI assistant speaks human, not just code! 🚀`,

        intermediate: `# 🌿 Welcome, Developer!

Cloud Guardian helps you level up your deployment and cloud skills.

## What You Get

- **Smart Scanning**: Catches issues you might miss
- **Security Checks**: Protects against common vulnerabilities
- **AI Assistance**: Claude and Gemini explain complex topics
- **Auto-fixes**: Handles routine configuration tasks
- **Best Practices**: Learn industry standards

## Quick Start

\`\`\`bash
guardian scan          # Audit your project
guardian fix           # Auto-fix safe issues
guardian chat          # AI-powered help
guardian deploy        # Guided deployment
\`\`\`

## Common Use Cases

**Before Deployment:**
\`\`\`bash
guardian pre-deploy    # Pre-flight checklist
\`\`\`

**Debugging:**
\`\`\`bash
guardian debug         # AI-powered debugging help
\`\`\`

**Learning:**
\`\`\`bash
guardian explain <topic>   # Deep dive explanations
\`\`\``,

        advanced: `# 🌳 Welcome, Experienced Developer!

Cloud Guardian provides enterprise-grade deployment intelligence.

## Features

- **Advanced Security Auditing**: CVE detection, dependency analysis
- **Cost Optimization**: Resource usage analysis and recommendations
- **Performance Profiling**: Bottleneck detection
- **Infrastructure as Code**: Terraform/CloudFormation validation
- **CI/CD Integration**: Pipeline optimization suggestions

## CLI Commands

\`\`\`bash
guardian scan --deep             # Comprehensive audit
guardian analyze performance     # Performance profiling
guardian analyze security        # Security audit
guardian analyze costs           # Cost optimization
guardian explain <complex-topic> # AI-powered deep dives
\`\`\`

## Integration

Add to your CI/CD pipeline:
\`\`\`yaml
- name: Cloud Guardian Scan
  run: guardian scan --ci --fail-on high
\`\`\`

## AI Assistance

Leverage Claude and Gemini for:
- Architecture review
- Complex debugging
- Performance optimization strategies
- Security best practices`
    };

    return experienceGuides[answers.experience] || experienceGuides.beginner;
}

if (require.main === module) {
    setup().catch(console.error);
}

module.exports = setup;
module.exports.createConfigFromAnswers = createConfigFromAnswers;
