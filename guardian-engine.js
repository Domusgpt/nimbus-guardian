/**
 * Guardian Engine - Core Analysis with AI Integration
 * A Paul Phillips Manifestation - Paul@clearseassolutions.com
 * "The Revolution Will Not be in a Structured Format" © 2025
 */

const fs = require('fs-extra');
const path = require('path');
const { execSync } = require('child_process');
const AIAssistant = require('./ai-assistant');
const DockerValidator = require('./validators/docker-validator');
const FirebaseValidator = require('./validators/firebase-validator');

class GuardianEngine {
    constructor(projectPath = process.cwd(), config = {}) {
        this.projectPath = projectPath;
        this.config = config;
        this.issues = [];
        this.fixes = [];
        this.warnings = [];
        this.insights = [];

        // Initialize AI Assistant
        this.ai = new AIAssistant({
            claudeApiKey: config.claudeApiKey,
            geminiApiKey: config.geminiApiKey,
            experienceLevel: config.experienceLevel || 'beginner',
            preferredProvider: config.preferredProvider
        });
    }

    async analyze(options = {}) {
        console.log('🔍 Starting comprehensive analysis...\n');

        // Skip some checks in quick mode
        if (!options.quick) {
            await this.checkGitignore();
            await this.scanForSecrets();
            await this.checkEnvironmentFiles();
            await this.analyzeDependencies();
            await this.checkSecurity();
            await this.checkPerformance();
            await this.validatePlatforms();
            await this.checkDeploymentReadiness();
        } else {
            // Quick mode - essential checks only
            await this.checkGitignore();
            await this.scanForSecrets();
            await this.checkEnvironmentFiles();
        }

        if (options.aiExplanations) {
            await this.generateAIInsights();
        }

        return {
            issues: this.issues,
            warnings: this.warnings,
            fixes: this.fixes,
            insights: this.insights
        };
    }

    async checkGitignore() {
        const gitignorePath = path.join(this.projectPath, '.gitignore');
        const criticalIgnores = [
            '.env', '.env.*', '*.env',
            'node_modules/', 'dist/', 'build/',
            '*.log', 'logs/',
            'serviceAccountKey.json', '*credentials*.json',
            '*.pem', '*.key'
        ];

        try {
            const content = await fs.readFile(gitignorePath, 'utf-8');
            const missing = criticalIgnores.filter(pattern => !content.includes(pattern));

            if (missing.length > 0) {
                this.issues.push({
                    id: 'gitignore-missing',
                    severity: 'HIGH',
                    category: 'Security',
                    message: `.gitignore missing critical patterns`,
                    details: missing,
                    autoFixable: true,
                    needsExplanation: this.config.experienceLevel === 'beginner'
                });
            }
        } catch (error) {
            this.issues.push({
                id: 'gitignore-missing',
                severity: 'CRITICAL',
                category: 'Security',
                message: 'No .gitignore file found',
                autoFixable: true,
                needsExplanation: true
            });
        }
    }

    async scanForSecrets() {
        const dangerousPatterns = [
            { pattern: /sk_live_[a-zA-Z0-9]+/, name: 'Stripe Live Key', severity: 'CRITICAL' },
            { pattern: /AIza[0-9A-Za-z\\-_]{35}/, name: 'Google API Key', severity: 'CRITICAL' },
            { pattern: /AKIA[0-9A-Z]{16}/, name: 'AWS Access Key', severity: 'CRITICAL' },
            { pattern: /ghp_[a-zA-Z0-9]{36}/, name: 'GitHub Token', severity: 'CRITICAL' },
            { pattern: /password\s*=\s*["'][^"']+["']/, name: 'Hardcoded Password', severity: 'HIGH' },
            { pattern: /api[_-]?key\s*=\s*["'][^"']+["']/i, name: 'API Key', severity: 'HIGH' }
        ];

        const filesToScan = await this.getAllCodeFiles();

        for (const file of filesToScan.slice(0, 100)) { // Limit for performance
            try {
                const content = await fs.readFile(file, 'utf-8');
                const relativePath = path.relative(this.projectPath, file);

                for (const { pattern, name, severity } of dangerousPatterns) {
                    if (pattern.test(content)) {
                        this.issues.push({
                            id: `secret-${name.toLowerCase().replace(/\s/g, '-')}`,
                            severity,
                            category: 'Security',
                            message: `Possible ${name} found in code`,
                            file: relativePath,
                            needsExplanation: true,
                            critical: true
                        });
                    }
                }
            } catch (error) {
                // Skip unreadable files
            }
        }
    }

    async checkEnvironmentFiles() {
        const env = path.join(this.projectPath, '.env');
        const envExample = path.join(this.projectPath, '.env.example');

        // Check if .env exists and is in git
        try {
            await fs.access(env);

            try {
                execSync('git ls-files .env', { cwd: this.projectPath, stdio: 'pipe' });
                this.issues.push({
                    id: 'env-in-git',
                    severity: 'CRITICAL',
                    category: 'Security',
                    message: '.env file is tracked in git (exposes secrets!)',
                    autoFixable: true,
                    needsExplanation: true,
                    critical: true
                });
            } catch {
                // Good - .env not tracked
            }
        } catch {
            this.warnings.push({
                severity: 'MEDIUM',
                category: 'Configuration',
                message: 'No .env file found - app may not work',
                needsExplanation: this.config.experienceLevel === 'beginner'
            });
        }

        // Check for .env.example
        try {
            await fs.access(envExample);
        } catch {
            this.issues.push({
                id: 'no-env-example',
                severity: 'MEDIUM',
                category: 'Documentation',
                message: 'Missing .env.example for team reference',
                autoFixable: true,
                needsExplanation: this.config.experienceLevel === 'beginner'
            });
        }
    }

    async analyzeDependencies() {
        const packagePath = path.join(this.projectPath, 'package.json');

        try {
            const pkg = await fs.readJson(packagePath);

            // Check for vulnerabilities
            try {
                const audit = execSync('npm audit --json', {
                    cwd: this.projectPath,
                    stdio: 'pipe',
                    encoding: 'utf-8'
                });

                const results = JSON.parse(audit);
                const vulns = results.metadata?.vulnerabilities || {};

                if (vulns.critical > 0 || vulns.high > 0) {
                    this.issues.push({
                        id: 'npm-vulnerabilities',
                        severity: 'HIGH',
                        category: 'Security',
                        message: `Found ${vulns.critical} critical, ${vulns.high} high severity vulnerabilities`,
                        autoFixable: true,
                        needsExplanation: true
                    });
                }
            } catch (error) {
                // npm audit failed or no vulnerabilities
            }

            // Check for outdated dependencies
            if (this.config.experienceLevel !== 'beginner') {
                try {
                    const outdated = execSync('npm outdated --json', {
                        cwd: this.projectPath,
                        stdio: 'pipe',
                        encoding: 'utf-8'
                    });

                    const outdatedPkgs = JSON.parse(outdated);
                    const majorUpdates = Object.keys(outdatedPkgs).length;

                    if (majorUpdates > 5) {
                        this.warnings.push({
                            severity: 'LOW',
                            category: 'Maintenance',
                            message: `${majorUpdates} outdated dependencies`,
                            needsExplanation: false
                        });
                    }
                } catch {
                    // No outdated packages or error
                }
            }

        } catch (error) {
            // No package.json
        }
    }

    async checkSecurity() {
        const packagePath = path.join(this.projectPath, 'package.json');

        try {
            const pkg = await fs.readJson(packagePath);
            const deps = { ...pkg.dependencies, ...pkg.devDependencies };

            // Check for security packages
            const hasHelmet = 'helmet' in deps;
            const hasExpress = 'express' in deps;

            if (hasExpress && !hasHelmet) {
                this.issues.push({
                    id: 'missing-helmet',
                    severity: 'HIGH',
                    category: 'Security',
                    message: 'Express server without security headers (helmet)',
                    autoFixable: true,
                    needsExplanation: true
                });
            }

            // Check for CORS
            const hasCors = 'cors' in deps;
            if (hasExpress && !hasCors) {
                this.warnings.push({
                    severity: 'MEDIUM',
                    category: 'Security',
                    message: 'No CORS configuration detected',
                    needsExplanation: this.config.experienceLevel === 'beginner'
                });
            }

        } catch {
            // Skip if no package.json
        }
    }

    async checkPerformance() {
        const packagePath = path.join(this.projectPath, 'package.json');

        try {
            const pkg = await fs.readJson(packagePath);
            const deps = { ...pkg.dependencies, ...pkg.devDependencies };

            // Check for compression
            if (deps.express && !deps.compression) {
                this.warnings.push({
                    severity: 'LOW',
                    category: 'Performance',
                    message: 'Missing compression middleware for Express',
                    needsExplanation: this.config.experienceLevel === 'beginner'
                });
            }

            // Check for caching
            const hasCaching = Object.keys(deps).some(dep =>
                dep.includes('cache') || dep.includes('redis')
            );

            if (!hasCaching && this.config.experienceLevel !== 'beginner') {
                this.warnings.push({
                    severity: 'LOW',
                    category: 'Performance',
                    message: 'No caching strategy detected',
                    needsExplanation: false
                });
            }

        } catch {
            // Skip
        }
    }

    async validatePlatforms() {
        // Docker validation
        const dockerValidator = new DockerValidator(this.projectPath);
        const dockerResults = await dockerValidator.validate();
        if (dockerResults.hasDocker) {
            this.issues.push(...dockerResults.issues);
        }

        // Firebase validation
        const firebaseValidator = new FirebaseValidator(this.projectPath);
        const firebaseResults = await firebaseValidator.validate();
        if (firebaseResults.hasFirebase) {
            this.issues.push(...firebaseResults.issues);
        }
    }

    async checkDeploymentReadiness() {
        // Check for CI/CD
        const ciConfigs = [
            '.github/workflows',
            '.gitlab-ci.yml',
            'vercel.json',
            'netlify.toml'
        ];

        let hasCI = false;
        for (const config of ciConfigs) {
            if (await fs.pathExists(path.join(this.projectPath, config))) {
                hasCI = true;
                break;
            }
        }

        if (!hasCI && this.config.experienceLevel !== 'beginner') {
            this.warnings.push({
                severity: 'MEDIUM',
                category: 'DevOps',
                message: 'No CI/CD configuration found',
                needsExplanation: false
            });
        }
    }

    async generateAIInsights() {
        console.log('🤖 Generating AI-powered insights...\n');

        // Group issues by severity
        const critical = this.issues.filter(i => i.severity === 'CRITICAL');
        const high = this.issues.filter(i => i.severity === 'HIGH');

        // Get explanations for critical and high severity issues
        const issuesNeedingExplanation = [...critical, ...high].filter(i => i.needsExplanation);

        for (const issue of issuesNeedingExplanation.slice(0, 3)) { // Limit AI calls
            try {
                const explanation = await this.ai.explainIssue(issue, {
                    name: this.config.projectName,
                    experienceLevel: this.config.experienceLevel
                });

                this.insights.push({
                    issueId: issue.id,
                    explanation: explanation.response,
                    provider: explanation.provider
                });

            } catch (error) {
                console.error(`Failed to get AI explanation for ${issue.id}:`, error.message);
            }
        }

        // Get overall assessment if there are issues
        if (this.issues.length > 0) {
            try {
                const assessment = await this.ai.ask(
                    `I just scanned my project and found ${this.issues.length} issues.
                    ${critical.length} are critical, ${high.length} are high priority.

                    The main categories are: ${[...new Set(this.issues.map(i => i.category))].join(', ')}

                    What should I prioritize fixing first, and why?`,
                    { projectInfo: { name: this.config.projectName } }
                );

                this.insights.push({
                    type: 'priority-guidance',
                    explanation: assessment.response,
                    provider: assessment.provider
                });

            } catch (error) {
                console.error('Failed to get priority guidance:', error.message);
            }
        }
    }

    async autoFix(issueId) {
        const issue = this.issues.find(i => i.id === issueId);
        if (!issue || !issue.autoFixable) {
            return { success: false, message: 'Issue not auto-fixable' };
        }

        try {
            switch (issue.id) {
                case 'gitignore-missing':
                    await this.fixGitignore(issue.details);
                    return { success: true, message: 'Updated .gitignore' };

                case 'env-in-git':
                    await this.removeEnvFromGit();
                    return { success: true, message: 'Removed .env from git' };

                case 'no-env-example':
                    await this.createEnvExample();
                    return { success: true, message: 'Created .env.example' };

                case 'npm-vulnerabilities':
                    await this.fixVulnerabilities();
                    return { success: true, message: 'Fixed npm vulnerabilities' };

                case 'missing-helmet':
                    await this.addHelmet();
                    return { success: true, message: 'Added helmet security' };

                default:
                    return { success: false, message: 'No auto-fix available' };
            }
        } catch (error) {
            return { success: false, message: error.message };
        }
    }

    // Fix implementations
    async fixGitignore(missing) {
        const gitignorePath = path.join(this.projectPath, '.gitignore');
        let content = '';

        if (await fs.pathExists(gitignorePath)) {
            content = await fs.readFile(gitignorePath, 'utf-8');
        }

        content += '\n# Added by Cloud Guardian\n' + missing.join('\n') + '\n';
        await fs.writeFile(gitignorePath, content);
    }

    async removeEnvFromGit() {
        execSync('git rm --cached .env', { cwd: this.projectPath });
    }

    async createEnvExample() {
        const envPath = path.join(this.projectPath, '.env');
        const examplePath = path.join(this.projectPath, '.env.example');

        if (await fs.pathExists(envPath)) {
            const content = await fs.readFile(envPath, 'utf-8');
            const example = content.replace(/=.+$/gm, '=');
            await fs.writeFile(examplePath, example);
        } else {
            await fs.writeFile(examplePath, '# Environment variables\nNODE_ENV=development\n');
        }
    }

    async fixVulnerabilities() {
        execSync('npm audit fix', { cwd: this.projectPath, stdio: 'inherit' });
    }

    async addHelmet() {
        execSync('npm install helmet', { cwd: this.projectPath, stdio: 'inherit' });
        // Note: User still needs to add to their code
    }

    async getAllCodeFiles() {
        const files = [];

        async function scan(dir) {
            try {
                const entries = await fs.readdir(dir, { withFileTypes: true });

                for (const entry of entries) {
                    if (entry.name === 'node_modules' || entry.name === '.git') continue;

                    const fullPath = path.join(dir, entry.name);

                    if (entry.isDirectory()) {
                        await scan(fullPath);
                    } else if (['.js', '.ts', '.jsx', '.tsx', '.json'].includes(path.extname(entry.name))) {
                        files.push(fullPath);
                    }
                }
            } catch {
                // Skip inaccessible
            }
        }

        await scan(this.projectPath);
        return files;
    }

    getAI() {
        return this.ai;
    }
}

module.exports = GuardianEngine;