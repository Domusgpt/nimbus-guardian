#!/usr/bin/env node

/**
 * License Manager
 * Handles license key validation, tier checking, and usage tracking
 *
 * © 2025 Paul Phillips - Clear Seas Solutions LLC
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const {
    ensureSecureDirSync,
    ensureSecureFileSync,
    writeSecureFileSync
} = require('./secure-storage');

class LicenseManager {
    constructor() {
        this.configDir = path.join(os.homedir(), '.nimbus');
        this.licenseFile = path.join(this.configDir, 'license.json');
        this.usageFile = path.join(this.configDir, 'usage.json');
        this.FUNCTION_BASE_URL = 'https://us-central1-nimbus-guardian.cloudfunctions.net';

        // Ensure config directory exists
        ensureSecureDirSync(this.configDir);
        ensureSecureFileSync(this.licenseFile);
        ensureSecureFileSync(this.usageFile);
    }

    /**
     * License Tiers
     */
    TIERS = {
        FREE: {
            name: 'Personal Use',
            price: 0,
            features: {
                scans: Infinity,
                aiQuestions: 0,
                platforms: ['docker', 'firebase'],
                commercialUse: false,
                support: false
            }
        },
        PRO: {
            name: 'Commercial',
            price: 299, // one-time
            features: {
                scans: Infinity,
                aiQuestions: Infinity,
                platforms: ['docker', 'firebase', 'aws', 'gcp', 'azure'],
                commercialUse: true,
                support: true
            }
        },
        ENTERPRISE: {
            name: 'Enterprise',
            price: 'contact',
            features: {
                scans: Infinity,
                aiQuestions: Infinity,
                platforms: 'all',
                commercialUse: true,
                support: true,
                customIntegrations: true,
                sourceAccess: true
            }
        }
    };

    /**
     * Get current license
     */
    getLicense() {
        if (!fs.existsSync(this.licenseFile)) {
            return {
                tier: 'FREE',
                key: null,
                activated: null,
                valid: true
            };
        }

        try {
            ensureSecureFileSync(this.licenseFile);
            const data = fs.readFileSync(this.licenseFile, 'utf-8');
            return JSON.parse(data);
        } catch (err) {
            return {
                tier: 'FREE',
                key: null,
                activated: null,
                valid: true
            };
        }
    }

    /**
     * Validate license key format
     */
    validateKeyFormat(key) {
        // Format: NIMBUS-XXXX-XXXX-XXXX-XXXX
        const pattern = /^NIMBUS-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
        return pattern.test(key);
    }

    /**
     * Activate license key
     */
    async activateKey(key, email) {
        if (!this.validateKeyFormat(key)) {
            throw new Error('Invalid license key format');
        }

        // Call Cloud Function to validate and activate license
        try {
            const response = await fetch(`${this.FUNCTION_BASE_URL}/validateLicense`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    data: {
                        licenseKey: key,
                        machineId: this.getMachineId(),
                        email: email
                    }
                })
            });

            const result = await response.json();

            if (result.error) {
                throw new Error(result.error.message || 'License validation failed');
            }

            if (!result.result || !result.result.success) {
                throw new Error('Invalid license response');
            }

            // Save license to local file
            const license = {
                tier: result.result.tier,
                key: key,
                userId: result.result.userId,
                activated: new Date().toISOString(),
                machineId: this.getMachineId(),
                valid: true,
                email: email
            };

            writeSecureFileSync(this.licenseFile, JSON.stringify(license, null, 2) + '\n');

            return license;

        } catch (error) {
            if (error.message.includes('fetch')) {
                throw new Error('Network error: Unable to connect to license server. Check your internet connection.');
            }
            throw error;
        }
    }

    /**
     * Decode and validate license key
     */
    decodeKey(key) {
        // Remove NIMBUS- prefix
        const parts = key.replace('NIMBUS-', '').split('-');

        // First part encodes tier: PRO or ENT
        const tierCode = parts[0].substring(0, 3);
        let tier = 'FREE';

        if (tierCode === 'PRO') {
            tier = 'PRO';
        } else if (tierCode === 'ENT') {
            tier = 'ENTERPRISE';
        }

        // In production: verify signature with your licensing server
        // For now: accept valid format as valid
        return {
            valid: true,
            tier: tier,
            expiresAt: null // or check expiry in production
        };
    }

    /**
     * Get unique machine ID
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
     * Check if feature is available for current tier
     */
    canUseFeature(feature) {
        const license = this.getLicense();
        const tier = this.TIERS[license.tier];

        if (!tier) return false;

        // Check specific features
        if (feature === 'commercial' && !tier.features.commercialUse) {
            return false;
        }

        if (feature === 'ai' && tier.features.aiQuestions === 0) {
            return false;
        }

        return true;
    }

    /**
     * Check if platform is supported in current tier
     */
    canUsePlatform(platform) {
        const license = this.getLicense();
        const tier = this.TIERS[license.tier];

        if (!tier) return false;

        const platforms = tier.features.platforms;

        if (platforms === 'all') return true;
        if (Array.isArray(platforms)) {
            return platforms.includes(platform.toLowerCase());
        }

        return false;
    }

    /**
     * Track usage (sync to Cloud Function)
     */
    async trackUsage(action, metadata = {}) {
        // Track locally first
        let usage = { scans: 0, aiQueries: 0, fixes: 0 };

        if (fs.existsSync(this.usageFile)) {
            try {
                ensureSecureFileSync(this.usageFile);
                const data = fs.readFileSync(this.usageFile, 'utf-8');
                usage = JSON.parse(data);
            } catch (err) {
                // Reset if corrupted
            }
        }

        // Increment counter
        if (action === 'scans') usage.scans = (usage.scans || 0) + 1;
        if (action === 'ai') usage.aiQueries = (usage.aiQueries || 0) + 1;
        if (action === 'fixes') usage.fixes = (usage.fixes || 0) + 1;

        // Add timestamp
        usage.lastUsed = new Date().toISOString();

        writeSecureFileSync(this.usageFile, JSON.stringify(usage, null, 2) + '\n');

        // Sync to Cloud Function if licensed
        const license = this.getLicense();
        if (license.userId) {
            try {
                await fetch(`${this.FUNCTION_BASE_URL}/syncUsage`, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        data: {
                            userId: license.userId,
                            action: action,
                            metadata: metadata
                        }
                    })
                });
            } catch (error) {
                // Fail silently - usage tracking shouldn't block user
                console.debug('Usage sync failed:', error.message);
            }
        }

        return usage;
    }

    /**
     * Get usage stats
     */
    getUsage() {
        if (!fs.existsSync(this.usageFile)) {
            return { scans: 0, aiQueries: 0, fixes: 0 };
        }

        try {
            ensureSecureFileSync(this.usageFile);
            const data = fs.readFileSync(this.usageFile, 'utf-8');
            return JSON.parse(data);
        } catch (err) {
            return { scans: 0, aiQueries: 0, fixes: 0 };
        }
    }

    /**
     * Check rate limits (calls Cloud Function)
     */
    async checkRateLimit(action) {
        const license = this.getLicense();

        // If no userId, user hasn't activated a license
        if (!license.userId) {
            // Allow limited usage for evaluation
            const usage = this.getUsage();
            const evalLimit = 10; // 10 free scans for evaluation

            if (action === 'scans' && usage.scans >= evalLimit) {
                return {
                    allowed: false,
                    reason: `Evaluation limit reached (${evalLimit} scans). Activate a license to continue.`,
                    upgrade: 'https://nimbus-guardian.web.app/#pricing'
                };
            }

            return { allowed: true, remaining: evalLimit - (usage.scans || 0) };
        }

        // Call Cloud Function to check rate limits
        try {
            const response = await fetch(`${this.FUNCTION_BASE_URL}/checkRateLimit`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    data: {
                        userId: license.userId,
                        action: action
                    }
                })
            });

            const result = await response.json();

            if (result.error) {
                console.warn('Rate limit check failed:', result.error.message);
                // Fail open for better UX
                return { allowed: true };
            }

            return result.result;

        } catch (error) {
            console.warn('Network error checking rate limits:', error.message);
            // Fail open - allow action if network is down
            return { allowed: true };
        }
    }

    /**
     * Deactivate license
     */
    deactivate() {
        if (fs.existsSync(this.licenseFile)) {
            fs.unlinkSync(this.licenseFile);
        }
        return true;
    }

    /**
     * Get license info for display
     */
    getLicenseInfo() {
        const license = this.getLicense();
        const tier = this.TIERS[license.tier];
        const usage = this.getUsage();

        return {
            tier: license.tier,
            tierName: tier.name,
            activated: license.activated,
            valid: license.valid,
            features: tier.features,
            usage: usage,
            upgradeUrl: 'https://nimbus-guardian.web.app/#pricing',
            contactEmail: 'chairman@parserator.com'
        };
    }
}

module.exports = LicenseManager;
