/**
 * Firebase Configuration Validator
 * A Paul Phillips Manifestation - Paul@clearseassolutions.com
 * "The Revolution Will Not be in a Structured Format" © 2025
 */

const fs = require('fs-extra');
const path = require('path');

class FirebaseValidator {
    constructor(projectPath) {
        this.projectPath = projectPath;
        this.issues = [];
    }

    async validate() {
        const firebaseJsonPath = path.join(this.projectPath, 'firebase.json');

        try {
            const config = await fs.readJson(firebaseJsonPath);

            await this.checkHostingConfig(config);
            await this.checkSecurityRules(config);
            await this.checkFunctionsConfig(config);
            await this.checkFirebaserc();

        } catch (error) {
            return { hasFirebase: false, issues: [] };
        }

        return { hasFirebase: true, issues: this.issues };
    }

    async checkHostingConfig(config) {
        if (!config.hosting) {
            return;
        }

        const hosting = config.hosting;

        // Check for security headers
        if (!hosting.headers || hosting.headers.length === 0) {
            this.issues.push({
                id: 'firebase-no-headers',
                severity: 'HIGH',
                category: 'Firebase Security',
                message: 'No security headers configured in firebase.json',
                file: 'firebase.json',
                autoFixable: false,
                explanation: 'Add security headers like X-Content-Type-Options, X-Frame-Options for better security.'
            });
        }

        // Check for rewrites (SPA)
        if (hosting.rewrites && hosting.rewrites.some(r => r.destination === '/index.html')) {
            // Good - SPA setup
        } else if (!hosting.rewrites) {
            this.issues.push({
                id: 'firebase-no-rewrites',
                severity: 'LOW',
                category: 'Firebase Config',
                message: 'No rewrites configured (may need for SPA routing)',
                file: 'firebase.json'
            });
        }

        // Check ignore patterns
        if (!hosting.ignore) {
            this.issues.push({
                id: 'firebase-no-ignore',
                severity: 'MEDIUM',
                category: 'Firebase Config',
                message: 'No ignore patterns in firebase.json hosting config',
                file: 'firebase.json',
                autoFixable: true
            });
        }
    }

    async checkSecurityRules(config) {
        // Check for Firestore rules
        if (config.firestore) {
            const rulesPath = path.join(this.projectPath, config.firestore.rules || 'firestore.rules');

            try {
                const rules = await fs.readFile(rulesPath, 'utf-8');

                // Check for open rules (dangerous!)
                if (rules.includes('allow read, write: if true')) {
                    this.issues.push({
                        id: 'firestore-open-rules',
                        severity: 'CRITICAL',
                        category: 'Firebase Security',
                        message: 'Firestore rules are completely open (allow if true)',
                        file: config.firestore.rules,
                        autoFixable: false,
                        explanation: 'Open database rules let anyone read/write your data. Add authentication checks!'
                    });
                }

                // Check for test mode
                if (rules.includes('allow read, write: if request.time <')) {
                    this.issues.push({
                        id: 'firestore-test-mode',
                        severity: 'CRITICAL',
                        category: 'Firebase Security',
                        message: 'Firestore still in test mode (time-limited open access)',
                        file: config.firestore.rules,
                        autoFixable: false,
                        explanation: 'Test mode expires but is still insecure. Add proper auth rules before production.'
                    });
                }

            } catch {
                this.issues.push({
                    id: 'firestore-missing-rules',
                    severity: 'CRITICAL',
                    category: 'Firebase Security',
                    message: 'Firestore rules file not found',
                    file: 'firestore.rules',
                    autoFixable: false
                });
            }
        }

        // Check for Storage rules
        if (config.storage) {
            const rulesPath = path.join(this.projectPath, config.storage.rules || 'storage.rules');

            try {
                const rules = await fs.readFile(rulesPath, 'utf-8');

                if (rules.includes('allow read, write: if true')) {
                    this.issues.push({
                        id: 'storage-open-rules',
                        severity: 'CRITICAL',
                        category: 'Firebase Security',
                        message: 'Storage rules are completely open',
                        file: config.storage.rules,
                        autoFixable: false,
                        explanation: 'Open storage lets anyone upload/download files. Add authentication!'
                    });
                }

            } catch {
                this.issues.push({
                    id: 'storage-missing-rules',
                    severity: 'HIGH',
                    category: 'Firebase Security',
                    message: 'Storage rules file not found',
                    file: 'storage.rules',
                    autoFixable: false
                });
            }
        }
    }

    async checkFunctionsConfig(config) {
        if (!config.functions) {
            return;
        }

        const functionsPath = path.join(this.projectPath, config.functions.source || 'functions');
        const packagePath = path.join(functionsPath, 'package.json');

        try {
            const pkg = await fs.readJson(packagePath);

            // Check Node version
            if (pkg.engines && pkg.engines.node) {
                const version = parseInt(pkg.engines.node.replace(/[^\d]/g, ''));
                if (version < 18) {
                    this.issues.push({
                        id: 'firebase-old-node',
                        severity: 'MEDIUM',
                        category: 'Firebase Functions',
                        message: `Functions using Node ${version} (upgrade to 18+ recommended)`,
                        file: 'functions/package.json',
                        autoFixable: false
                    });
                }
            }

        } catch {
            // No functions package.json
        }
    }

    async checkFirebaserc() {
        const frcPath = path.join(this.projectPath, '.firebaserc');

        try {
            const frc = await fs.readJson(frcPath);

            if (!frc.projects || !frc.projects.default) {
                this.issues.push({
                    id: 'firebase-no-project',
                    severity: 'HIGH',
                    category: 'Firebase Config',
                    message: 'No default project set in .firebaserc',
                    file: '.firebaserc',
                    autoFixable: false,
                    explanation: 'Run "firebase use --add" to link a Firebase project.'
                });
            }

        } catch {
            this.issues.push({
                id: 'firebase-no-rc',
                severity: 'HIGH',
                category: 'Firebase Config',
                message: 'No .firebaserc file found',
                file: '.firebaserc',
                autoFixable: false,
                explanation: 'Run "firebase init" to set up Firebase project configuration.'
            });
        }
    }
}

module.exports = FirebaseValidator;
