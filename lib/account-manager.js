#!/usr/bin/env node

/**
 * Account Manager
 * Handles user accounts, registration, and authentication
 *
 * © 2025 Paul Phillips - Clear Seas Solutions LLC
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

class AccountManager {
    constructor() {
        this.configDir = path.join(os.homedir(), '.nimbus');
        this.accountFile = path.join(this.configDir, 'account.json');
        this.usageFile = path.join(this.configDir, 'usage.json');
        this.FUNCTION_BASE_URL = process.env.NIMBUS_FUNCTION_BASE_URL || 'https://us-central1-nimbus-guardian.cloudfunctions.net';

        if (!fs.existsSync(this.configDir)) {
            fs.mkdirSync(this.configDir, {recursive: true});
        }
    }

    /**
     * Check if user is logged in
     */
    isLoggedIn() {
        return fs.existsSync(this.accountFile);
    }

    /**
     * Get current account
     */
    getAccount() {
        if (!this.isLoggedIn()) {
            return null;
        }

        try {
            const data = fs.readFileSync(this.accountFile, 'utf-8');
            return JSON.parse(data);
        } catch (err) {
            return null;
        }
    }

    /**
     * Register account and sync to Firebase if available
     */
    async register(email, projectName, useCase) {
        if (this.isLoggedIn()) {
            throw new Error('Already logged in. Use `nimbus logout` first.');
        }

        if (!email || !email.includes('@')) {
            throw new Error('Invalid email address');
        }

        const account = {
            id: this.generateAccountId(),
            email,
            projectName: projectName || 'Unnamed Project',
            useCase: useCase || 'general',
            registeredAt: new Date().toISOString(),
            tier: 'FREE',
            machineId: this.getMachineId()
        };

        await this.persistWithCloudSync(account, {
            email: account.email,
            projectName: account.projectName,
            useCase: account.useCase,
            machineId: account.machineId
        });

        return this.getAccount();
    }

    /**
     * Login (with optional license activation)
     */
    async login(email, licenseKey) {
        if (this.isLoggedIn()) {
            throw new Error('Already logged in. Use `nimbus logout` first.');
        }

        const LicenseManager = require('./license-manager');
        const licenseManager = new LicenseManager();

        let tier = 'FREE';
        let license = null;

        if (licenseKey) {
            license = await licenseManager.activateKey(licenseKey, email);
            tier = license.tier;
        }

        const account = {
            id: this.generateAccountId(),
            email,
            tier,
            loggedInAt: new Date().toISOString(),
            machineId: this.getMachineId(),
            projectName: null,
            useCase: null
        };

        await this.persistWithCloudSync(account, {
            email: account.email,
            machineId: account.machineId,
            licenseKey: licenseKey || null,
            userId: license?.userId,
            tier: account.tier
        });

        return this.getAccount();
    }

    /**
     * Logout
     */
    logout() {
        if (fs.existsSync(this.accountFile)) {
            fs.unlinkSync(this.accountFile);
        }
        return true;
    }

    /**
     * Update account info locally
     */
    update(updates) {
        const account = this.getAccount();
        if (!account) {
            throw new Error('No account found. Register first.');
        }

        const updated = {
            ...account,
            ...updates,
            updatedAt: new Date().toISOString()
        };

        fs.writeFileSync(this.accountFile, JSON.stringify(updated, null, 2));

        return updated;
    }

    /**
     * Generate unique account ID
     */
    generateAccountId() {
        return 'NA-' + crypto.randomBytes(8).toString('hex').toUpperCase();
    }

    /**
     * Get machine ID
     */
    getMachineId() {
        const hostname = os.hostname();
        const platform = os.platform();
        const arch = os.arch();

        const hash = crypto
            .createHash('sha256')
            .update(`${hostname}-${platform}-${arch}`)
            .digest('hex');

        return hash.substring(0, 16);
    }

    /**
     * Check if commercial use is allowed
     */
    canUseCommercially() {
        const account = this.getAccount();
        if (!account) return false;

        return ['PRO', 'ENTERPRISE'].includes(account.tier);
    }

    /**
     * Prompt for commercial use confirmation
     */
    checkCommercialUse() {
        const account = this.getAccount();

        if (!account) {
            console.log('\n⚠️  No account found. Please register first: nimbus register\n');
            return false;
        }

        if (account.tier === 'FREE') {
            console.log('\n⚠️  COMMERCIAL USE DETECTED\n');
            console.log('This appears to be a commercial project.');
            console.log('Personal/Free tier is for evaluation and non-commercial use only.\n');
            console.log('To use Nimbus commercially, you need a commercial license.');
            console.log('Contact: chairman@parserator.com\n');
            console.log('Or visit: https://nimbus-guardian.web.app/#pricing\n');
            return false;
        }

        return true;
    }

    /**
     * Get account info for display
     */
    getAccountInfo() {
        const account = this.getAccount();

        if (!account) {
            return {
                loggedIn: false,
                message: 'Not registered. Run `nimbus register` to get started.'
            };
        }

        return {
            loggedIn: true,
            id: account.id,
            email: account.email,
            tier: account.tier,
            projectName: account.projectName,
            registeredAt: account.registeredAt,
            machineId: account.machineId,
            cloud: account.cloud || null
        };
    }

    /**
     * Persist account locally and attempt cloud sync
     */
    async persistWithCloudSync(account, payload) {
        const accountCopy = {...account};
        try {
            const cloudResult = await this.syncAccountToCloud(payload);

            if (cloudResult?.userId) {
                accountCopy.id = cloudResult.userId;
            }

            if (cloudResult?.tier) {
                accountCopy.tier = cloudResult.tier;
            }

            accountCopy.cloud = {
                synced: true,
                lastSyncedAt: new Date().toISOString(),
                licenseLinked: Boolean(cloudResult?.licenseLinked)
            };
        } catch (error) {
            accountCopy.cloud = {
                synced: false,
                lastSyncedAt: null,
                lastError: error.message
            };
        }

        fs.writeFileSync(this.accountFile, JSON.stringify(accountCopy, null, 2));
        return accountCopy;
    }

    /**
     * Call Firebase function to sync account metadata
     */
    async syncAccountToCloud({email, projectName, useCase, machineId, licenseKey, userId, tier}) {
        if (!email) {
            throw new Error('Email required for cloud sync');
        }

        const body = {
            data: {
                email,
                projectName: projectName || undefined,
                useCase: useCase || undefined,
                machineId: machineId || undefined,
                licenseKey: licenseKey || undefined,
                userId: userId || undefined,
                tier: tier || undefined
            }
        };

        const response = await fetch(`${this.FUNCTION_BASE_URL}/registerAccount`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(body)
        });

        const json = await response.json();

        if (json.error) {
            throw new Error(json.error.message || 'Cloud registration failed');
        }

        return json.result || null;
    }
}

module.exports = AccountManager;
