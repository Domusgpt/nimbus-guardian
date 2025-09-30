/**
 * Tool Detection & Recommendation Engine
 * A Paul Phillips Manifestation - Paul@clearseassolutions.com
 * "The Revolution Will Not be in a Structured Format" © 2025
 *
 * Automatically detects what cloud CLIs, testing tools, and protocols
 * your project needs and suggests installation/configuration
 */

const fs = require('fs-extra');
const path = require('path');
const { execSync } = require('child_process');

class ToolDetector {
    constructor(projectPath = process.cwd()) {
        this.projectPath = projectPath;
        this.detectedTools = [];
        this.missingTools = [];
        this.recommendations = [];
    }

    async analyze() {
        console.log('🔍 Analyzing project structure and dependencies...\n');

        await this.detectCloudProviders();
        await this.detectFrameworks();
        await this.detectTestingNeeds();
        await this.detectCICD();
        await this.detectContainerization();
        await this.detectDatabases();
        await this.detectMonitoring();
        await this.checkInstalledCLIs();

        return {
            detected: this.detectedTools,
            missing: this.missingTools,
            recommendations: this.recommendations
        };
    }

    async detectCloudProviders() {
        const indicators = {
            firebase: [
                'firebase.json',
                '.firebaserc',
                'firestore.rules',
                'firestore.indexes.json'
            ],
            aws: [
                'amplify.yml',
                'serverless.yml',
                'template.yaml',
                '.aws-sam'
            ],
            gcp: [
                'app.yaml',
                'cloudbuild.yaml',
                '.gcloudignore'
            ],
            azure: [
                'azure-pipelines.yml',
                'azuredeploy.json',
                '.azure'
            ],
            vercel: [
                'vercel.json',
                '.vercel'
            ],
            netlify: [
                'netlify.toml',
                '.netlify'
            ],
            heroku: [
                'Procfile',
                'app.json'
            ]
        };

        for (const [provider, files] of Object.entries(indicators)) {
            for (const file of files) {
                if (await fs.pathExists(path.join(this.projectPath, file))) {
                    this.detectedTools.push({
                        category: 'cloud',
                        provider,
                        file,
                        cliRequired: this.getRequiredCLI(provider)
                    });
                    break;
                }
            }
        }

        // Check package.json dependencies
        try {
            const pkg = await fs.readJson(path.join(this.projectPath, 'package.json'));
            const deps = { ...pkg.dependencies, ...pkg.devDependencies };

            const depIndicators = {
                firebase: ['firebase', 'firebase-admin', 'firebase-functions'],
                aws: ['aws-sdk', '@aws-sdk', 'aws-amplify'],
                gcp: ['@google-cloud'],
                azure: ['@azure'],
                supabase: ['@supabase/supabase-js'],
                planetscale: ['@planetscale/database']
            };

            for (const [provider, packages] of Object.entries(depIndicators)) {
                for (const pkg of packages) {
                    if (Object.keys(deps).some(d => d.includes(pkg))) {
                        this.detectedTools.push({
                            category: 'cloud',
                            provider,
                            detected: 'dependency',
                            cliRequired: this.getRequiredCLI(provider)
                        });
                        break;
                    }
                }
            }
        } catch {
            // No package.json
        }
    }

    getRequiredCLI(provider) {
        const clis = {
            firebase: {
                name: 'firebase-tools',
                command: 'firebase',
                install: 'npm install -g firebase-tools',
                docs: 'https://firebase.google.com/docs/cli'
            },
            aws: {
                name: 'aws-cli',
                command: 'aws',
                install: 'https://aws.amazon.com/cli/',
                docs: 'https://docs.aws.amazon.com/cli/'
            },
            gcp: {
                name: 'gcloud',
                command: 'gcloud',
                install: 'https://cloud.google.com/sdk/docs/install',
                docs: 'https://cloud.google.com/sdk/gcloud'
            },
            azure: {
                name: 'azure-cli',
                command: 'az',
                install: 'https://docs.microsoft.com/en-us/cli/azure/install-azure-cli',
                docs: 'https://docs.microsoft.com/en-us/cli/azure/'
            },
            vercel: {
                name: 'vercel',
                command: 'vercel',
                install: 'npm install -g vercel',
                docs: 'https://vercel.com/docs/cli'
            },
            netlify: {
                name: 'netlify-cli',
                command: 'netlify',
                install: 'npm install -g netlify-cli',
                docs: 'https://docs.netlify.com/cli/get-started/'
            },
            heroku: {
                name: 'heroku-cli',
                command: 'heroku',
                install: 'https://devcenter.heroku.com/articles/heroku-cli',
                docs: 'https://devcenter.heroku.com/articles/heroku-cli'
            },
            supabase: {
                name: 'supabase',
                command: 'supabase',
                install: 'npm install -g supabase',
                docs: 'https://supabase.com/docs/guides/cli'
            },
            planetscale: {
                name: 'pscale',
                command: 'pscale',
                install: 'https://planetscale.com/docs/concepts/planetscale-environment-setup',
                docs: 'https://planetscale.com/docs/concepts/planetscale-cli'
            }
        };

        return clis[provider];
    }

    async detectFrameworks() {
        try {
            const pkg = await fs.readJson(path.join(this.projectPath, 'package.json'));
            const deps = { ...pkg.dependencies, ...pkg.devDependencies };

            const frameworks = {
                'next.js': ['next'],
                'react': ['react', 'react-dom'],
                'vue': ['vue'],
                'angular': ['@angular/core'],
                'svelte': ['svelte'],
                'express': ['express'],
                'nestjs': ['@nestjs/core'],
                'nuxt': ['nuxt'],
                'gatsby': ['gatsby'],
                'remix': ['@remix-run/react']
            };

            for (const [framework, packages] of Object.entries(frameworks)) {
                for (const pkg of packages) {
                    if (deps[pkg]) {
                        this.detectedTools.push({
                            category: 'framework',
                            name: framework,
                            version: deps[pkg]
                        });

                        // Recommend testing tools based on framework
                        this.recommendTestingTools(framework, deps);
                        break;
                    }
                }
            }
        } catch {
            // No package.json
        }
    }

    recommendTestingTools(framework, existingDeps) {
        const testingRecommendations = {
            'next.js': {
                unit: { name: 'jest', package: 'jest' },
                e2e: { name: 'playwright', package: '@playwright/test' },
                component: { name: 'react-testing-library', package: '@testing-library/react' }
            },
            'react': {
                unit: { name: 'jest', package: 'jest' },
                component: { name: 'react-testing-library', package: '@testing-library/react' }
            },
            'vue': {
                unit: { name: 'vitest', package: 'vitest' },
                component: { name: '@vue/test-utils', package: '@vue/test-utils' }
            },
            'express': {
                unit: { name: 'jest', package: 'jest' },
                integration: { name: 'supertest', package: 'supertest' }
            }
        };

        const recommended = testingRecommendations[framework];
        if (!recommended) return;

        for (const [type, tool] of Object.entries(recommended)) {
            if (!existingDeps[tool.package]) {
                this.recommendations.push({
                    category: 'testing',
                    type,
                    tool: tool.name,
                    package: tool.package,
                    reason: `${framework} projects benefit from ${tool.name} for ${type} testing`,
                    install: `npm install --save-dev ${tool.package}`
                });
            }
        }
    }

    async detectTestingNeeds() {
        try {
            const pkg = await fs.readJson(path.join(this.projectPath, 'package.json'));
            const deps = { ...pkg.dependencies, ...pkg.devDependencies };

            const testingTools = {
                'jest': 'Unit testing framework',
                'mocha': 'Unit testing framework',
                'vitest': 'Unit testing framework (Vite)',
                '@playwright/test': 'E2E testing',
                'cypress': 'E2E testing',
                'puppeteer': 'E2E testing',
                '@testing-library/react': 'Component testing (React)',
                'supertest': 'API testing',
                'chai': 'Assertion library',
                'sinon': 'Mocking library'
            };

            let hasTestingFramework = false;

            for (const [tool, description] of Object.entries(testingTools)) {
                if (deps[tool]) {
                    this.detectedTools.push({
                        category: 'testing',
                        name: tool,
                        description
                    });
                    hasTestingFramework = true;
                }
            }

            // Check if tests directory exists
            const hasTestDir = await fs.pathExists(path.join(this.projectPath, 'test')) ||
                              await fs.pathExists(path.join(this.projectPath, 'tests')) ||
                              await fs.pathExists(path.join(this.projectPath, '__tests__'));

            if (!hasTestingFramework && hasTestDir) {
                this.recommendations.push({
                    category: 'testing',
                    type: 'framework',
                    reason: 'Found test directory but no testing framework',
                    suggestion: 'Install a testing framework',
                    options: [
                        { name: 'jest', install: 'npm install --save-dev jest' },
                        { name: 'vitest', install: 'npm install --save-dev vitest' },
                        { name: 'mocha', install: 'npm install --save-dev mocha chai' }
                    ]
                });
            }

            if (!hasTestingFramework && !hasTestDir) {
                this.recommendations.push({
                    category: 'testing',
                    type: 'setup',
                    priority: 'high',
                    reason: 'No testing setup detected',
                    suggestion: 'Add testing to ensure code quality',
                    autoSetup: true
                });
            }

        } catch {
            // No package.json
        }
    }

    async detectCICD() {
        const cicdFiles = {
            'github-actions': '.github/workflows',
            'gitlab-ci': '.gitlab-ci.yml',
            'circle-ci': '.circleci/config.yml',
            'jenkins': 'Jenkinsfile',
            'travis': '.travis.yml',
            'azure-pipelines': 'azure-pipelines.yml'
        };

        let hasCI = false;

        for (const [name, file] of Object.entries(cicdFiles)) {
            if (await fs.pathExists(path.join(this.projectPath, file))) {
                this.detectedTools.push({
                    category: 'cicd',
                    name,
                    file
                });
                hasCI = true;
            }
        }

        if (!hasCI) {
            this.recommendations.push({
                category: 'cicd',
                type: 'setup',
                priority: 'medium',
                reason: 'No CI/CD configuration detected',
                suggestion: 'Automate testing and deployment',
                options: [
                    { name: 'GitHub Actions', file: '.github/workflows/main.yml' },
                    { name: 'GitLab CI', file: '.gitlab-ci.yml' }
                ]
            });
        }
    }

    async detectContainerization() {
        const dockerFiles = ['Dockerfile', 'docker-compose.yml', '.dockerignore'];
        let hasDocker = false;

        for (const file of dockerFiles) {
            if (await fs.pathExists(path.join(this.projectPath, file))) {
                this.detectedTools.push({
                    category: 'containerization',
                    name: 'docker',
                    file
                });
                hasDocker = true;
            }
        }

        if (hasDocker) {
            // Check if Docker is installed
            const dockerInstalled = this.isCommandAvailable('docker');
            if (!dockerInstalled) {
                this.missingTools.push({
                    category: 'containerization',
                    name: 'docker',
                    reason: 'Docker files detected but Docker not installed',
                    install: 'https://docs.docker.com/get-docker/'
                });
            }
        }

        // Check for Kubernetes
        if (await fs.pathExists(path.join(this.projectPath, 'k8s')) ||
            await fs.pathExists(path.join(this.projectPath, 'kubernetes'))) {
            this.detectedTools.push({
                category: 'orchestration',
                name: 'kubernetes'
            });

            const kubectlInstalled = this.isCommandAvailable('kubectl');
            if (!kubectlInstalled) {
                this.missingTools.push({
                    category: 'orchestration',
                    name: 'kubectl',
                    reason: 'Kubernetes config detected but kubectl not installed',
                    install: 'https://kubernetes.io/docs/tasks/tools/'
                });
            }
        }
    }

    async detectDatabases() {
        try {
            const pkg = await fs.readJson(path.join(this.projectPath, 'package.json'));
            const deps = { ...pkg.dependencies, ...pkg.devDependencies };

            const databases = {
                'postgresql': ['pg', 'postgres', 'sequelize'],
                'mysql': ['mysql', 'mysql2'],
                'mongodb': ['mongodb', 'mongoose'],
                'redis': ['redis', 'ioredis'],
                'sqlite': ['sqlite3', 'better-sqlite3'],
                'firestore': ['@google-cloud/firestore', 'firebase-admin'],
                'dynamodb': ['@aws-sdk/client-dynamodb'],
                'supabase': ['@supabase/supabase-js'],
                'prisma': ['prisma', '@prisma/client']
            };

            for (const [db, packages] of Object.entries(databases)) {
                for (const pkg of packages) {
                    if (deps[pkg]) {
                        this.detectedTools.push({
                            category: 'database',
                            name: db,
                            package: pkg
                        });

                        // Recommend migration tools
                        if (!deps['db-migrate'] && !deps['knex'] && !deps['prisma']) {
                            this.recommendations.push({
                                category: 'database',
                                type: 'migrations',
                                reason: `Using ${db} but no migration tool detected`,
                                suggestion: 'Add database migrations for schema management',
                                options: [
                                    { name: 'prisma', install: 'npx prisma init' },
                                    { name: 'knex', install: 'npm install knex' },
                                    { name: 'db-migrate', install: 'npm install db-migrate' }
                                ]
                            });
                        }
                        break;
                    }
                }
            }
        } catch {
            // No package.json
        }
    }

    async detectMonitoring() {
        try {
            const pkg = await fs.readJson(path.join(this.projectPath, 'package.json'));
            const deps = { ...pkg.dependencies, ...pkg.devDependencies };

            const monitoring = {
                'sentry': ['@sentry/node', '@sentry/react', 'sentry'],
                'datadog': ['dd-trace', 'datadog-metrics'],
                'new-relic': ['newrelic'],
                'winston': ['winston'],
                'pino': ['pino'],
                'prometheus': ['prom-client']
            };

            let hasMonitoring = false;

            for (const [tool, packages] of Object.entries(monitoring)) {
                for (const pkg of packages) {
                    if (deps[pkg]) {
                        this.detectedTools.push({
                            category: 'monitoring',
                            name: tool,
                            package: pkg
                        });
                        hasMonitoring = true;
                        break;
                    }
                }
            }

            if (!hasMonitoring) {
                this.recommendations.push({
                    category: 'monitoring',
                    type: 'error-tracking',
                    priority: 'high',
                    reason: 'No error monitoring or logging detected',
                    suggestion: 'Add monitoring to catch production issues',
                    options: [
                        { name: 'Sentry', install: 'npm install @sentry/node', free: true },
                        { name: 'Winston', install: 'npm install winston', free: true }
                    ]
                });
            }
        } catch {
            // No package.json
        }
    }

    async checkInstalledCLIs() {
        const detectedProviders = this.detectedTools
            .filter(t => t.category === 'cloud')
            .map(t => t.provider);

        for (const provider of [...new Set(detectedProviders)]) {
            const cliInfo = this.getRequiredCLI(provider);
            if (!cliInfo) continue;

            const isInstalled = this.isCommandAvailable(cliInfo.command);

            if (!isInstalled) {
                this.missingTools.push({
                    category: 'cli',
                    provider,
                    cli: cliInfo.name,
                    command: cliInfo.command,
                    install: cliInfo.install,
                    docs: cliInfo.docs,
                    reason: `${provider} detected but CLI not installed`
                });
            } else {
                this.detectedTools.push({
                    category: 'cli',
                    provider,
                    name: cliInfo.name,
                    installed: true
                });
            }
        }

        // Check for common development tools
        const commonTools = [
            { name: 'git', category: 'vcs' },
            { name: 'node', category: 'runtime' },
            { name: 'npm', category: 'package-manager' },
            { name: 'docker', category: 'containerization' },
            { name: 'gh', category: 'github-cli', optional: true }
        ];

        for (const tool of commonTools) {
            const isInstalled = this.isCommandAvailable(tool.name);
            if (isInstalled) {
                this.detectedTools.push({
                    category: tool.category,
                    name: tool.name,
                    installed: true
                });
            } else if (!tool.optional) {
                this.missingTools.push({
                    category: tool.category,
                    name: tool.name,
                    reason: `${tool.name} is required but not installed`
                });
            }
        }
    }

    isCommandAvailable(command) {
        try {
            execSync(`which ${command}`, { stdio: 'pipe' });
            return true;
        } catch {
            return false;
        }
    }

    generateInstallScript() {
        const script = ['#!/bin/bash', '', '# Auto-generated installation script', ''];

        for (const missing of this.missingTools) {
            if (missing.install && !missing.install.startsWith('http')) {
                script.push(`# Install ${missing.name}`);
                script.push(missing.install);
                script.push('');
            }
        }

        return script.join('\n');
    }
}

module.exports = ToolDetector;