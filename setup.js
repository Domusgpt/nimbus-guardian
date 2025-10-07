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
const { saveConfig, getConfigPaths } = require('./lib/config-service');
const { writeSecureFile } = require('./lib/secure-storage');

const CLI_NAME = 'nimbus';

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
    const config = {
        projectName: answers.projectName,
        experienceLevel: answers.experience,
        cloudProvider: answers.cloudProvider,
        aiProvider: answers.aiProvider,
        setupDate: new Date().toISOString()
    };

    const { configDir, envPath } = getConfigPaths(process.cwd());
    await saveConfig(process.cwd(), config);

    // Create .env file
    const envContent = `# Intelligent Cloud Guardian Configuration
# Generated: ${new Date().toISOString()}

${answers.claudeApiKey ? `CLAUDE_API_KEY=${answers.claudeApiKey}` : '# CLAUDE_API_KEY=your-key-here'}
${answers.geminiApiKey ? `GEMINI_API_KEY=${answers.geminiApiKey}` : '# GEMINI_API_KEY=your-key-here'}

# Project Configuration
PROJECT_NAME=${answers.projectName}
EXPERIENCE_LEVEL=${answers.experience}
`;

    await writeSecureFile(envPath, envContent, { mode: 0o600 });

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
    const welcomeGuide = generateWelcomeGuide(answers, CLI_NAME);
    await fs.writeFile(path.join(configDir, 'WELCOME.md'), welcomeGuide);

    console.log('\n' + boxen(
        chalk.green.bold('✅ Setup Complete!\n\n') +
        chalk.white('Your Cloud Guardian is ready to help.\n\n') +
        chalk.cyan('Try these commands:\n') +
        chalk.gray(`  ${CLI_NAME} scan     - Check your project\n`) +
        chalk.gray(`  ${CLI_NAME} chat     - Talk to your AI assistant\n`) +
        chalk.gray(`  ${CLI_NAME} fix      - Auto-fix issues\n`) +
        chalk.gray(`  ${CLI_NAME} learn    - Get tutorials\n`),
        {
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'green'
        }
    ));

    if (answers.experience === 'beginner') {
        console.log(chalk.yellow('\n💡 First time? Try: ') + chalk.cyan.bold(`${CLI_NAME} learn basics\n`));
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

function generateWelcomeGuide(answers, cliName = CLI_NAME) {
    const command = (cmd) => `${cliName} ${cmd}`.trim();

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

1. **Check your project**: Run \`${command('scan')}\`
   - This looks at your code and tells you what needs attention

2. **Chat with your AI assistant**: Run \`${command('chat')}\`
   - Ask questions like "What does this error mean?"
   - Get explanations about anything confusing

3. **Learn the basics**: Run \`${command('learn')}\`
   - Interactive tutorials
   - Learn by doing

## Common Questions

**Q: What's an API key?**
A: It's like a password that lets Cloud Guardian talk to AI assistants

**Q: Will this change my code?**
A: Only if you tell it to! It always asks first.

**Q: What if I break something?**
A: Cloud Guardian checks for problems before they happen!

## Need Help?

Just ask! Type \`${command('chat')}\` and say:
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
${command('scan')}          # Audit your project
${command('fix')}           # Auto-fix safe issues
${command('chat')}          # AI-powered help
${command('deploy')}        # Guided deployment
\`\`\`

## Common Use Cases

**Before Deployment:**
\`\`\`bash
${command('pre-deploy')}    # Pre-flight checklist
\`\`\`

**Debugging:**
\`\`\`bash
${command('debug')}         # AI-powered debugging help
\`\`\`

**Learning:**
\`\`\`bash
${command('explain <topic>')}   # Deep dive explanations
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
${command('scan --deep')}             # Comprehensive audit
${command('analyze performance')}     # Performance profiling
${command('analyze security')}        # Security audit
${command('analyze costs')}           # Cost optimization
${command('explain <complex-topic>')} # AI-powered deep dives
\`\`\`

## Integration

Add to your CI/CD pipeline:
\`\`\`yaml
- name: Cloud Guardian Scan
  run: ${command('scan --ci --fail-on high')}
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
