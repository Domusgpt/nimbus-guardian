/**
 * Docker Security Validator
 * A Paul Phillips Manifestation - Paul@clearseassolutions.com
 * "The Revolution Will Not be in a Structured Format" © 2025
 */

const fs = require('fs-extra');
const path = require('path');

class DockerValidator {
    constructor(projectPath) {
        this.projectPath = projectPath;
        this.issues = [];
    }

    async validate() {
        const dockerfilePath = path.join(this.projectPath, 'Dockerfile');

        try {
            const content = await fs.readFile(dockerfilePath, 'utf-8');
            const lines = content.split('\n');

            await this.checkUserPrivileges(lines);
            await this.checkBaseImage(lines);
            await this.checkSecrets(lines);
            await this.checkMultiStage(lines);
            await this.checkDockerignore();

        } catch (error) {
            // No Dockerfile
            return { hasDocker: false, issues: [] };
        }

        return { hasDocker: true, issues: this.issues };
    }

    async checkUserPrivileges(lines) {
        let hasUserCommand = false;
        let lineNum = 0;

        for (const line of lines) {
            lineNum++;
            if (line.trim().startsWith('USER ')) {
                hasUserCommand = true;
                const user = line.split('USER ')[1].trim();
                if (user === 'root' || user === '0') {
                    this.issues.push({
                        id: 'docker-root-user',
                        severity: 'CRITICAL',
                        category: 'Docker Security',
                        message: `Running container as root user (line ${lineNum})`,
                        file: 'Dockerfile',
                        line: lineNum,
                        autoFixable: false,
                        explanation: 'Running containers as root is a major security risk. Create and use a non-privileged user.'
                    });
                }
            }
        }

        if (!hasUserCommand) {
            this.issues.push({
                id: 'docker-no-user',
                severity: 'HIGH',
                category: 'Docker Security',
                message: 'Dockerfile doesn\'t specify USER (runs as root by default)',
                file: 'Dockerfile',
                autoFixable: false,
                explanation: 'Add "USER node" or create a custom user to avoid running as root.'
            });
        }
    }

    async checkBaseImage(lines) {
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line.startsWith('FROM ')) {
                const image = line.split('FROM ')[1].trim();

                // Check for :latest tag
                if (image.includes(':latest') || !image.includes(':')) {
                    this.issues.push({
                        id: 'docker-latest-tag',
                        severity: 'MEDIUM',
                        category: 'Docker Security',
                        message: `Base image uses :latest tag (line ${i + 1})`,
                        file: 'Dockerfile',
                        line: i + 1,
                        autoFixable: false,
                        explanation: 'Pin specific versions for reproducible builds. Use "node:18-alpine" not "node:latest"'
                    });
                }

                // Check for minimal images
                if (image.includes('node') && !image.includes('alpine') && !image.includes('slim')) {
                    this.issues.push({
                        id: 'docker-large-image',
                        severity: 'LOW',
                        category: 'Docker Performance',
                        message: `Consider using alpine or slim base images (line ${i + 1})`,
                        file: 'Dockerfile',
                        line: i + 1,
                        autoFixable: false
                    });
                }
            }
        }
    }

    async checkSecrets(lines) {
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();

            // Check for hardcoded secrets
            if (line.includes('PASSWORD=') || line.includes('API_KEY=') || line.includes('SECRET=')) {
                this.issues.push({
                    id: 'docker-hardcoded-secret',
                    severity: 'CRITICAL',
                    category: 'Docker Security',
                    message: `Hardcoded secret detected (line ${i + 1})`,
                    file: 'Dockerfile',
                    line: i + 1,
                    autoFixable: false,
                    explanation: 'Use build arguments (ARG) or runtime environment variables. Never hardcode secrets.'
                });
            }

            // Check for COPY of sensitive files
            if (line.startsWith('COPY ') || line.startsWith('ADD ')) {
                const patterns = ['.env', '*.pem', '*.key', '*credentials*', 'serviceAccountKey'];
                for (const pattern of patterns) {
                    if (line.includes(pattern)) {
                        this.issues.push({
                            id: 'docker-copy-secrets',
                            severity: 'CRITICAL',
                            category: 'Docker Security',
                            message: `Copying sensitive files into image (line ${i + 1})`,
                            file: 'Dockerfile',
                            line: i + 1,
                            autoFixable: false,
                            explanation: 'Sensitive files end up in Docker layers permanently. Use .dockerignore and build args.'
                        });
                    }
                }
            }
        }
    }

    async checkMultiStage(lines) {
        const fromCount = lines.filter(l => l.trim().startsWith('FROM ')).length;
        const hasNodeModules = lines.some(l => l.includes('node_modules'));

        if (fromCount === 1 && hasNodeModules) {
            this.issues.push({
                id: 'docker-no-multistage',
                severity: 'LOW',
                category: 'Docker Performance',
                message: 'Consider multi-stage builds to reduce image size',
                file: 'Dockerfile',
                autoFixable: false,
                explanation: 'Multi-stage builds keep build dependencies out of final image, reducing size by 50%+.'
            });
        }
    }

    async checkDockerignore() {
        const dockerignorePath = path.join(this.projectPath, '.dockerignore');

        try {
            const content = await fs.readFile(dockerignorePath, 'utf-8');

            const critical = ['node_modules', '.git', '.env', '*.md', '*.log'];
            const missing = critical.filter(pattern => !content.includes(pattern));

            if (missing.length > 0) {
                this.issues.push({
                    id: 'dockerignore-incomplete',
                    severity: 'MEDIUM',
                    category: 'Docker Performance',
                    message: `.dockerignore missing patterns: ${missing.join(', ')}`,
                    file: '.dockerignore',
                    autoFixable: true
                });
            }

        } catch {
            this.issues.push({
                id: 'no-dockerignore',
                severity: 'HIGH',
                category: 'Docker Security',
                message: 'No .dockerignore file found',
                autoFixable: true,
                explanation: '.dockerignore prevents sensitive files and bloat from being copied into Docker images.'
            });
        }
    }
}

module.exports = DockerValidator;
