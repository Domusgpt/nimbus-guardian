#!/usr/bin/env node

/**
 * Rate Limiter
 * Enforces usage limits based on license tier
 *
 * © 2025 Paul Phillips - Clear Seas Solutions LLC
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

class RateLimiter {
    constructor() {
        this.configDir = path.join(os.homedir(), '.nimbus');
        this.limitsFile = path.join(this.configDir, 'rate-limits.json');

        if (!fs.existsSync(this.configDir)) {
            fs.mkdirSync(this.configDir, { recursive: true });
        }
    }

    /**
     * Rate limit windows (in milliseconds)
     */
    WINDOWS = {
        MINUTE: 60 * 1000,
        HOUR: 60 * 60 * 1000,
        DAY: 24 * 60 * 60 * 1000,
        MONTH: 30 * 24 * 60 * 60 * 1000
    };

    /**
     * Tier limits
     */
    LIMITS = {
        FREE: {
            scans: { perDay: 50, perHour: 10 },
            ai: { perMonth: 0 }, // No AI on free tier
            fixes: { perDay: 20 }
        },
        PRO: {
            scans: { perDay: Infinity, perHour: Infinity },
            ai: { perMonth: Infinity },
            fixes: { perDay: Infinity }
        },
        ENTERPRISE: {
            scans: { perDay: Infinity, perHour: Infinity },
            ai: { perMonth: Infinity },
            fixes: { perDay: Infinity }
        }
    };

    /**
     * Get current limits data
     */
    getLimitsData() {
        if (!fs.existsSync(this.limitsFile)) {
            return this.createEmptyLimits();
        }

        try {
            const data = fs.readFileSync(this.limitsFile, 'utf-8');
            return JSON.parse(data);
        } catch (err) {
            return this.createEmptyLimits();
        }
    }

    /**
     * Create empty limits structure
     */
    createEmptyLimits() {
        return {
            scans: { timestamps: [] },
            ai: { timestamps: [] },
            fixes: { timestamps: [] }
        };
    }

    /**
     * Clean old timestamps outside the window
     */
    cleanTimestamps(timestamps, window) {
        const now = Date.now();
        return timestamps.filter(ts => now - ts < window);
    }

    /**
     * Check if action is allowed
     */
    checkLimit(action, tier) {
        const limits = this.LIMITS[tier] || this.LIMITS.FREE;
        const data = this.getLimitsData();

        if (!data[action]) {
            data[action] = { timestamps: [] };
        }

        const actionLimits = limits[action];
        if (!actionLimits) return { allowed: true };

        // Check each limit type
        for (const [period, limit] of Object.entries(actionLimits)) {
            if (limit === Infinity) continue;

            const window = this.WINDOWS[period.replace('per', '').toUpperCase()];
            const recentTimestamps = this.cleanTimestamps(data[action].timestamps, window);

            if (recentTimestamps.length >= limit) {
                return {
                    allowed: false,
                    reason: `Rate limit exceeded: ${limit} ${action}s ${period}`,
                    resetAt: new Date(Math.min(...recentTimestamps) + window).toISOString(),
                    upgrade: 'https://nimbus-guardian.web.app/#pricing'
                };
            }
        }

        return { allowed: true };
    }

    /**
     * Record action
     */
    recordAction(action) {
        const data = this.getLimitsData();

        if (!data[action]) {
            data[action] = { timestamps: [] };
        }

        data[action].timestamps.push(Date.now());

        // Clean old timestamps to keep file size manageable
        const oneMonthAgo = Date.now() - this.WINDOWS.MONTH;
        data[action].timestamps = data[action].timestamps.filter(ts => ts > oneMonthAgo);

        fs.writeFileSync(this.limitsFile, JSON.stringify(data, null, 2));
    }

    /**
     * Get usage in current period
     */
    getUsage(action, period, tier) {
        const data = this.getLimitsData();

        if (!data[action]) return { used: 0, limit: 0 };

        const window = this.WINDOWS[period.toUpperCase()];
        const recentTimestamps = this.cleanTimestamps(data[action].timestamps, window);

        const limits = this.LIMITS[tier] || this.LIMITS.FREE;
        const limit = limits[action]?.[`per${period.charAt(0).toUpperCase() + period.slice(1)}`] || Infinity;

        return {
            used: recentTimestamps.length,
            limit: limit === Infinity ? '∞' : limit,
            resetAt: recentTimestamps.length > 0
                ? new Date(Math.min(...recentTimestamps) + window).toISOString()
                : null
        };
    }

    /**
     * Reset all limits (admin function)
     */
    reset() {
        if (fs.existsSync(this.limitsFile)) {
            fs.unlinkSync(this.limitsFile);
        }
    }
}

module.exports = RateLimiter;
