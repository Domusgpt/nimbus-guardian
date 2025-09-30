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

class LicenseManager {
    constructor() {
        this.configDir = path.join(os.homedir(), '.nimbus');
        this.licenseFile = path.join(this.configDir, 'license.json');
        this.usageFile = path.join(this.configDir, 'usage.json');

        // Ensure config directory exists
        if (!fs.existsSync(this.configDir)) {
            fs.mkdirSync(this.configDir, { recursive: true });
        }
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
    async activateKey(key) {
        if (!this.validateKeyFormat(key)) {
            throw new Error('Invalid license key format');
        }

        // In production, this would call your licensing server
        // For now, we'll do offline validation
        const keyData = this.decodeKey(key);

        if (!keyData.valid) {
            throw new Error('Invalid or expired license key');
        }

        const license = {
            tier: keyData.tier,
            key: key,
            activated: new Date().toISOString(),
            machineId: this.getMachineId(),
            valid: true,
            expiresAt: keyData.expiresAt || null
        };

        fs.writeFileSync(this.licenseFile, JSON.stringify(license, null, 2));

        return license;
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
     * Track usage
     */
    trackUsage(action, metadata = {}) {
        let usage = { scans: 0, aiQueries: 0, fixes: 0 };

        if (fs.existsSync(this.usageFile)) {
            try {
                const data = fs.readFileSync(this.usageFile, 'utf-8');
                usage = JSON.parse(data);
            } catch (err) {
                // Reset if corrupted
            }
        }

        // Increment counter
        if (action === 'scan') usage.scans = (usage.scans || 0) + 1;
        if (action === 'ai') usage.aiQueries = (usage.aiQueries || 0) + 1;
        if (action === 'fix') usage.fixes = (usage.fixes || 0) + 1;

        // Add timestamp
        usage.lastUsed = new Date().toISOString();

        fs.writeFileSync(this.usageFile, JSON.stringify(usage, null, 2));

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
            const data = fs.readFileSync(this.usageFile, 'utf-8');
            return JSON.parse(data);
        } catch (err) {
            return { scans: 0, aiQueries: 0, fixes: 0 };
        }
    }

    /**
     * Check rate limits
     */
    checkRateLimit(action) {
        const license = this.getLicense();
        const tier = this.TIERS[license.tier];
        const usage = this.getUsage();

        // FREE tier: No AI queries allowed
        if (license.tier === 'FREE' && action === 'ai') {
            return {
                allowed: false,
                reason: 'AI features require a commercial license',
                upgrade: 'https://nimbus-guardian.web.app/#pricing'
            };
        }

        // All other actions unlimited for now
        return { allowed: true };
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
