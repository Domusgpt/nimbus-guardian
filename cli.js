#!/usr/bin/env node

/**
 * Intelligent Cloud Guardian CLI
 * A Paul Phillips Manifestation - Paul@clearseassolutions.com
 * "The Revolution Will Not be in a Structured Format" © 2025
 */

const { program } = require('commander');
const inquirer = require('inquirer');
const chalk = require('chalk');
const ora = require('ora');
const boxen = require('boxen');
const path = require('path');
const fs = require('fs-extra');
require('dotenv').config({ path: path.join(process.cwd(), '.guardian', '.env') });

const GuardianEngine = require('./guardian-engine');
const AIAssistant = require('./ai-assistant');
const setup = require('./setup');

program
    .name('nimbus')
    .description('AI-Powered Cloud Deployment Guardian for Everyone')
    .version('1.0.0');

// Setup command
program
    .command('setup')
    .description('Interactive setup wizard')
    .action(async () => {
        await setup();
    });

// Scan command
program
    .command('scan')
    .description('Scan your project for issues')
    .option('-a, --ai', 'Include AI-powered explanations')
    .option('-d, --deep', 'Deep scan (slower, more thorough)')
    .option('-q, --quick', 'Quick scan (faster, essential checks only)')
    .option('--fail-on <severity>', 'Exit with error code if issues found (critical, high, medium)')
    .option('--json', 'Output results as JSON')
    .action(async (options) => {
        const config = await loadConfig();
        if (!config) {
            console.log(chalk.yellow('\n⚠️  Please run "nimbus setup" first!\n'));
            return;
        }

        const spinner = ora('Scanning your project...').start();

        try {
            const engine = new GuardianEngine(process.cwd(), config);
            const results = await engine.analyze({
                aiExplanations: options.ai,
                quick: options.quick
            });

            spinner.succeed('Scan complete!\n');

            // JSON output mode
            if (options.json) {
                console.log(JSON.stringify(results, null, 2));
                process.exit(0);
            }

            displayResults(results, config.experienceLevel);

            // Handle --fail-on flag for CI/CD
            if (options.failOn) {
                const severity = options.failOn.toUpperCase();
                const severityLevels = {
                    'CRITICAL': 1,
                    'HIGH': 2,
                    'MEDIUM': 3
                };

                const critical = results.issues.filter(i => i.severity === 'CRITICAL').length;
                const high = results.issues.filter(i => i.severity === 'HIGH').length;
                const medium = results.issues.filter(i => i.severity === 'MEDIUM').length;

                if (severity === 'CRITICAL' && critical > 0) {
                    process.exit(1);
                } else if (severity === 'HIGH' && (critical > 0 || high > 0)) {
                    process.exit(2);
                } else if (severity === 'MEDIUM' && (critical > 0 || high > 0 || medium > 0)) {
                    process.exit(3);
                }
            }

        } catch (error) {
            spinner.fail('Scan failed');
            console.error(chalk.red(error.message));
            process.exit(10);
        }
    });

// Chat command - interactive AI assistant
program
    .command('chat')
    .description('Chat with your AI assistant')
    .action(async () => {
        const config = await loadConfig();
        if (!config) {
            console.log(chalk.yellow('\n⚠️  Please run "nimbus setup" first!\n'));
            return;
        }

        console.clear();
        console.log(boxen(
            chalk.cyan.bold('💬 Nimbus AI Assistant\n\n') +
            chalk.white('Ask me anything about your project!\n') +
            chalk.gray('Type "exit" or "quit" to end the conversation'),
            {
                padding: 1,
                margin: 1,
                borderStyle: 'round',
                borderColor: 'cyan'
            }
        ));

        const ai = new AIAssistant({
            claudeApiKey: process.env.CLAUDE_API_KEY,
            geminiApiKey: process.env.GEMINI_API_KEY,
            experienceLevel: config.experienceLevel
        });

        await interactiveChat(ai, config);
    });

// Fix command
program
    .command('fix')
    .description('Auto-fix issues in your project')
    .option('-a, --all', 'Fix all auto-fixable issues')
    .action(async (options) => {
        const config = await loadConfig();
        if (!config) {
            console.log(chalk.yellow('\n⚠️  Please run "nimbus setup" first!\n'));
            return;
        }

        const spinner = ora('Analyzing issues...').start();

        const engine = new GuardianEngine(process.cwd(), config);
        const results = await engine.analyze();

        spinner.stop();

        const fixable = results.issues.filter(i => i.autoFixable);

        if (fixable.length === 0) {
            console.log(chalk.green('\n✅ No auto-fixable issues found!\n'));
            return;
        }

        console.log(chalk.cyan(`\n🔧 Found ${fixable.length} fixable issues:\n`));

        for (const issue of fixable) {
            console.log(`  ${getSeverityIcon(issue.severity)} ${issue.message}`);
        }

        const { confirm } = await inquirer.prompt([{
            type: 'confirm',
            name: 'confirm',
            message: 'Fix these issues?',
            default: true
        }]);

        if (!confirm) {
            console.log(chalk.yellow('\nNo changes made.\n'));
            return;
        }

        const fixSpinner = ora('Applying fixes...').start();

        for (const issue of fixable) {
            const result = await engine.autoFix(issue.id);
            if (result.success) {
                fixSpinner.text = result.message;
            }
        }

        fixSpinner.succeed('All fixes applied!\n');
    });

// Explain command
program
    .command('explain <topic>')
    .description('Get AI explanation of a concept')
    .option('-d, --depth <level>', 'Explanation depth: beginner, intermediate, advanced')
    .action(async (topic, options) => {
        const config = await loadConfig();
        if (!config) {
            console.log(chalk.yellow('\n⚠️  Please run "nimbus setup" first!\n'));
            return;
        }

        const spinner = ora(`Asking AI about ${topic}...`).start();

        try {
            const ai = new AIAssistant({
                claudeApiKey: process.env.CLAUDE_API_KEY,
                geminiApiKey: process.env.GEMINI_API_KEY,
                experienceLevel: options.depth || config.experienceLevel
            });

            const response = await ai.teachConcept(topic, options.depth || config.experienceLevel);

            spinner.succeed('Got it!\n');

            console.log(boxen(
                chalk.white(response.response),
                {
                    padding: 1,
                    margin: 1,
                    borderStyle: 'round',
                    borderColor: 'cyan'
                }
            ));

            console.log(chalk.gray(`\nPowered by ${response.provider}\n`));

        } catch (error) {
            spinner.fail('Failed to get explanation');
            console.error(chalk.red(error.message));
        }
    });

// Debug command
program
    .command('debug <error>')
    .description('Get help debugging an error')
    .action(async (error) => {
        const config = await loadConfig();
        if (!config) {
            console.log(chalk.yellow('\n⚠️  Please run "nimbus setup" first!\n'));
            return;
        }

        const spinner = ora('Analyzing error...').start();

        try {
            const ai = new AIAssistant({
                claudeApiKey: process.env.CLAUDE_API_KEY,
                geminiApiKey: process.env.GEMINI_API_KEY,
                experienceLevel: config.experienceLevel
            });

            const response = await ai.debugError(error);

            spinner.succeed('Analysis complete!\n');

            console.log(boxen(
                chalk.white(response.response),
                {
                    padding: 1,
                    margin: 1,
                    borderStyle: 'round',
                    borderColor: 'red'
                }
            ));

            console.log(chalk.gray(`\nPowered by ${response.provider}\n`));

        } catch (error) {
            spinner.fail('Failed to debug');
            console.error(chalk.red(error.message));
        }
    });

// Learn command
program
    .command('learn [topic]')
    .description('Interactive learning tutorials')
    .action(async (topic) => {
        const config = await loadConfig();
        if (!config) {
            console.log(chalk.yellow('\n⚠️  Please run "nimbus setup" first!\n'));
            return;
        }

        if (!topic) {
            // Show learning menu
            const { selectedTopic } = await inquirer.prompt([{
                type: 'list',
                name: 'selectedTopic',
                message: 'What would you like to learn?',
                choices: [
                    '🌱 Git & Version Control Basics',
                    '🌍 Environment Variables',
                    '🔐 Security Best Practices',
                    '🚀 Deploying Your First App',
                    '🐛 Debugging Like a Pro',
                    '📦 Understanding Dependencies',
                    '🐳 Docker Containers',
                    '⚙️  CI/CD Pipelines'
                ]
            }]);

            topic = selectedTopic.split(' ').slice(1).join(' ');
        }

        const spinner = ora(`Preparing lesson on ${topic}...`).start();

        try {
            const ai = new AIAssistant({
                claudeApiKey: process.env.CLAUDE_API_KEY,
                geminiApiKey: process.env.GEMINI_API_KEY,
                experienceLevel: config.experienceLevel
            });

            const response = await ai.teachConcept(topic, config.experienceLevel);

            spinner.succeed('Lesson ready!\n');

            console.log(boxen(
                chalk.white(response.response),
                {
                    padding: 1,
                    margin: 1,
                    borderStyle: 'round',
                    borderColor: 'green'
                }
            ));

        } catch (error) {
            spinner.fail('Failed to load lesson');
            console.error(chalk.red(error.message));
        }
    });

// Dashboard command
program
    .command('dashboard')
    .description('Launch interactive web dashboard')
    .option('-p, --port <port>', 'Port number', '3333')
    .action(async (options) => {
        const DashboardServer = require('./dashboard-server');
        const server = new DashboardServer(options.port);
        await server.start();
    });

// Tools detection command
program
    .command('tools')
    .description('Detect and recommend tools for your project')
    .action(async () => {
        const config = await loadConfig();
        if (!config) {
            console.log(chalk.yellow('\n⚠️  Please run "nimbus setup" first!\n'));
            return;
        }

        const spinner = ora('Analyzing project tools...').start();

        const ToolDetector = require('./tool-detector');
        const detector = new ToolDetector(process.cwd());
        const results = await detector.analyze();

        spinner.succeed('Analysis complete!\n');

        // Display detected tools
        if (results.detected.length > 0) {
            console.log(chalk.green.bold('✅ Detected Tools:\n'));

            const byCategory = results.detected.reduce((acc, tool) => {
                if (!acc[tool.category]) acc[tool.category] = [];
                acc[tool.category].push(tool);
                return acc;
            }, {});

            for (const [category, tools] of Object.entries(byCategory)) {
                console.log(chalk.cyan(`\n${category.toUpperCase()}:`));
                tools.forEach(tool => {
                    console.log(`  ✓ ${tool.name || tool.provider}`);
                });
            }
        }

        // Display missing tools
        if (results.missing.length > 0) {
            console.log(chalk.yellow.bold('\n\n⚠️  Missing Tools:\n'));

            for (const tool of results.missing) {
                console.log(chalk.white(`\n❌ ${tool.name}`));
                console.log(chalk.gray(`   ${tool.reason}`));
                console.log(chalk.cyan(`   Install: ${tool.install}`));
            }
        }

        // Display recommendations
        if (results.recommendations.length > 0) {
            console.log(chalk.blue.bold('\n\n💡 Recommendations:\n'));

            for (const rec of results.recommendations) {
                console.log(chalk.white(`\n${rec.category}: ${rec.type}`));
                console.log(chalk.gray(`   ${rec.reason}`));
                if (rec.options) {
                    console.log(chalk.cyan('   Options:'));
                    rec.options.forEach(opt => {
                        console.log(chalk.gray(`   • ${opt.name}: ${opt.install}`));
                    });
                }
            }
        }

        console.log(chalk.cyan.bold('\n\n🚀 Quick Actions:\n'));
        console.log(chalk.white('  nimbus dashboard  - View all tools in web UI'));
        console.log(chalk.white('  nimbus chat       - Ask AI about specific tools\n'));
    });

// Deploy check command
program
    .command('pre-deploy')
    .description('Pre-deployment checklist and validation')
    .action(async () => {
        const config = await loadConfig();
        if (!config) {
            console.log(chalk.yellow('\n⚠️  Please run "nimbus setup" first!\n'));
            return;
        }

        console.log(chalk.cyan.bold('\n🚀 Pre-Deployment Checklist\n'));

        const spinner = ora('Running comprehensive checks...').start();

        const engine = new GuardianEngine(process.cwd(), config);
        const results = await engine.analyze({ aiExplanations: true });

        spinner.stop();

        const critical = results.issues.filter(i => i.severity === 'CRITICAL').length;
        const high = results.issues.filter(i => i.severity === 'HIGH').length;

        console.log('\n' + boxen(
            chalk.white('Deployment Readiness Report\n\n') +
            (critical === 0 && high === 0
                ? chalk.green.bold('✅ Ready to Deploy!')
                : chalk.red.bold('⚠️  Issues Must Be Fixed First')),
            {
                padding: 1,
                margin: 1,
                borderStyle: 'round',
                borderColor: critical === 0 && high === 0 ? 'green' : 'red'
            }
        ));

        displayResults(results, config.experienceLevel);

        if (critical > 0 || high > 0) {
            console.log(chalk.yellow('\n💡 Run "nimbus fix" to auto-fix issues\n'));
            console.log(chalk.yellow('💬 Run "nimbus chat" to get help with manual fixes\n'));
        }
    });

// Helper functions

async function loadConfig() {
    const configPath = path.join(process.cwd(), '.guardian', 'config.json');

    try {
        return await fs.readJson(configPath);
    } catch {
        return null;
    }
}

function displayResults(results, experienceLevel) {
    const { issues, warnings, insights } = results;

    const critical = issues.filter(i => i.severity === 'CRITICAL').length;
    const high = issues.filter(i => i.severity === 'HIGH').length;
    const medium = issues.filter(i => i.severity === 'MEDIUM').length;

    console.log(boxen(
        chalk.white.bold('📊 Scan Results\n\n') +
        `${critical > 0 ? chalk.red('🔴') : chalk.green('✅')} Critical: ${critical}\n` +
        `${high > 0 ? chalk.yellow('🟠') : chalk.green('✅')} High: ${high}\n` +
        `${medium > 0 ? chalk.yellow('🟡') : chalk.green('✅')} Medium: ${medium}\n` +
        chalk.gray(`⚪ Warnings: ${warnings.length}`),
        {
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: critical > 0 ? 'red' : high > 0 ? 'yellow' : 'green'
        }
    ));

    if (issues.length > 0) {
        console.log(chalk.red.bold('\n❌ Issues Found:\n'));

        for (const issue of issues.slice(0, 10)) {
            console.log(`${getSeverityIcon(issue.severity)} ${chalk.white(issue.message)}`);
            if (issue.file) {
                console.log(chalk.gray(`   📄 ${issue.file}`));
            }
            if (issue.autoFixable) {
                console.log(chalk.green('   ✅ Auto-fixable'));
            }

            // Show AI insight if available
            const insight = insights.find(i => i.issueId === issue.id);
            if (insight && experienceLevel === 'beginner') {
                console.log(chalk.cyan('\n   🤖 AI Explanation:'));
                console.log(chalk.white('   ' + insight.explanation.split('\n')[0].substring(0, 100) + '...'));
                console.log(chalk.gray(`   (Run "nimbus explain ${issue.id}" for full explanation)\n`));
            }

            console.log();
        }
    }

    if (warnings.length > 0 && experienceLevel !== 'beginner') {
        console.log(chalk.yellow.bold('⚠️  Warnings:\n'));

        for (const warning of warnings.slice(0, 5)) {
            console.log(`⚪ ${chalk.white(warning.message)}\n`);
        }
    }

    // Show priority guidance
    const priorityInsight = insights.find(i => i.type === 'priority-guidance');
    if (priorityInsight) {
        console.log(boxen(
            chalk.cyan.bold('🎯 AI Recommendations\n\n') +
            chalk.white(priorityInsight.explanation),
            {
                padding: 1,
                margin: 1,
                borderStyle: 'round',
                borderColor: 'cyan'
            }
        ));
    }
}

function getSeverityIcon(severity) {
    const icons = {
        'CRITICAL': '🔴',
        'HIGH': '🟠',
        'MEDIUM': '🟡',
        'LOW': '⚪'
    };
    return icons[severity] || '⚪';
}

async function interactiveChat(ai, config) {
    while (true) {
        const { question } = await inquirer.prompt([{
            type: 'input',
            name: 'question',
            message: chalk.cyan('You:'),
            prefix: ''
        }]);

        if (['exit', 'quit', 'bye'].includes(question.toLowerCase())) {
            console.log(chalk.cyan('\n👋 Goodbye! Run "nimbus chat" anytime.\n'));
            break;
        }

        if (!question.trim()) continue;

        const spinner = ora('Thinking...').start();

        try {
            const response = await ai.ask(question);

            spinner.stop();

            console.log(chalk.white(`\n🤖 ${response.provider}:\n`));
            console.log(chalk.white(response.response));
            console.log();

        } catch (error) {
            spinner.fail('Error');
            console.error(chalk.red(error.message + '\n'));
        }
    }
}

// Parse command line
program.parse();

// Show help if no command
if (!process.argv.slice(2).length) {
    console.log(boxen(
        chalk.cyan.bold('☁️  Nimbus Guardian\n\n') +
        chalk.white('AI-Powered Deployment Safety for Everyone\n\n') +
        chalk.gray('Quick Start:\n') +
        chalk.white('  nimbus setup       Get started\n') +
        chalk.white('  nimbus dashboard   🔥 Launch web dashboard\n') +
        chalk.white('  nimbus scan        Check your project\n') +
        chalk.white('  nimbus tools       Detect needed CLIs\n') +
        chalk.white('  nimbus chat        Ask for help\n') +
        chalk.white('  nimbus fix         Fix issues\n') +
        chalk.white('  nimbus learn       Interactive tutorials\n\n') +
        chalk.gray('Run "nimbus --help" for all commands'),
        {
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'cyan'
        }
    ));
}