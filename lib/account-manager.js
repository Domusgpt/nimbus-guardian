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

        if (!fs.existsSync(this.configDir)) {
            fs.mkdirSync(this.configDir, { recursive: true });
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
     * Register account (local only - for offline use)
     */
    register(email, projectName, useCase) {
        if (this.isLoggedIn()) {
            throw new Error('Already logged in. Use `nimbus logout` first.');
        }

        // Basic email validation
        if (!email || !email.includes('@')) {
            throw new Error('Invalid email address');
        }

        const account = {
            id: this.generateAccountId(),
            email: email,
            projectName: projectName || 'Unnamed Project',
            useCase: useCase || 'general',
            registeredAt: new Date().toISOString(),
            tier: 'FREE',
            machineId: this.getMachineId()
        };

        fs.writeFileSync(this.accountFile, JSON.stringify(account, null, 2));

        return account;
    }

    /**
     * Login (for future API integration)
     */
    async login(email, licenseKey) {
        if (this.isLoggedIn()) {
            throw new Error('Already logged in. Use `nimbus logout` first.');
        }

        // In production: validate with licensing server
        // For now: create local account with license

        const LicenseManager = require('./license-manager');
        const licenseManager = new LicenseManager();

        let tier = 'FREE';
        if (licenseKey) {
            const license = await licenseManager.activateKey(licenseKey);
            tier = license.tier;
        }

        const account = {
            id: this.generateAccountId(),
            email: email,
            tier: tier,
            loggedInAt: new Date().toISOString(),
            machineId: this.getMachineId()
        };

        fs.writeFileSync(this.accountFile, JSON.stringify(account, null, 2));

        return account;
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
     * Update account info
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

        // Only PRO and ENTERPRISE can use commercially
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
            machineId: account.machineId
        };
    }
}

module.exports = AccountManager;
