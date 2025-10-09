'use strict';

const crypto = require('crypto');

const isFiniteNumber = (value) => Number.isFinite(value);

class DashboardObservability {
    constructor(options = {}) {
        const { now = () => Date.now() } = options;
        this.now = typeof now === 'function' ? now : () => Date.now();
        this.reset();
    }

    reset() {
        this.sessionMetrics = {
            active: 0,
            created: 0,
            destroyed: 0,
            expired: 0,
            touches: 0,
            lastCreatedAt: null,
            lastDestroyedAt: null,
            lastExpiredAt: null,
            lastTouchedAt: null
        };

        this.rateLimitMetrics = new Map();
    }

    _timestamp(currentTime) {
        const timestamp = isFiniteNumber(currentTime) ? currentTime : this.now();
        try {
            return new Date(timestamp).toISOString();
        } catch {
            return null;
        }
    }

    _anonymizeKey(key) {
        if (!key) {
            return null;
        }

        try {
            return crypto.createHash('sha256').update(String(key)).digest('hex').slice(0, 16);
        } catch {
            return null;
        }
    }

    _cloneSessionPayload(session = {}) {
        return {
            id: session.id,
            createdAt: session.createdAt,
            lastSeen: session.lastSeen,
            metadata: session.metadata ? { ...session.metadata } : {}
        };
    }

    recordSessionCreated(session) {
        const payload = this._cloneSessionPayload(session);
        this.sessionMetrics.created += 1;
        this.sessionMetrics.active = Math.max(0, this.sessionMetrics.active + 1);
        this.sessionMetrics.lastCreatedAt = this._timestamp(payload.createdAt);
    }

    recordSessionTouched(session) {
        const payload = this._cloneSessionPayload(session);
        this.sessionMetrics.touches += 1;
        this.sessionMetrics.lastTouchedAt = this._timestamp(payload.lastSeen);
    }

    recordSessionDestroyed(session) {
        const payload = this._cloneSessionPayload(session);
        this.sessionMetrics.destroyed += 1;
        this.sessionMetrics.active = Math.max(0, this.sessionMetrics.active - 1);
        this.sessionMetrics.lastDestroyedAt = this._timestamp(payload.lastSeen ?? payload.createdAt);
    }

    recordSessionExpired(session) {
        const payload = this._cloneSessionPayload(session);
        this.sessionMetrics.expired += 1;
        this.sessionMetrics.active = Math.max(0, this.sessionMetrics.active - 1);
        this.sessionMetrics.lastExpiredAt = this._timestamp(payload.lastSeen ?? payload.createdAt);
    }

    recordRateLimitAttempt(profileName, details = {}) {
        if (!profileName) {
            return;
        }

        const entry = this.rateLimitMetrics.get(profileName) || {
            allowed: 0,
            blocked: 0,
            lastAllowedAt: null,
            lastBlockedAt: null,
            lastAttemptAt: null,
            lastRetryAfterMs: null,
            lastRemaining: null,
            lastKeyHash: null,
            windowMs: null,
            max: null
        };

        entry.windowMs = isFiniteNumber(details.windowMs) ? details.windowMs : entry.windowMs;
        entry.max = isFiniteNumber(details.max) ? details.max : entry.max;

        const timestamp = this._timestamp(details.currentTime);
        entry.lastAttemptAt = timestamp;

        const remaining = isFiniteNumber(details.remaining) ? details.remaining : entry.lastRemaining;
        entry.lastRemaining = remaining;
        entry.lastKeyHash = this._anonymizeKey(details.key) || entry.lastKeyHash;

        if (details.allowed) {
            entry.allowed += 1;
            entry.lastAllowedAt = timestamp;
            entry.lastRetryAfterMs = 0;
        } else {
            entry.blocked += 1;
            entry.lastBlockedAt = timestamp;
            entry.lastRetryAfterMs = isFiniteNumber(details.retryAfterMs) ? details.retryAfterMs : entry.lastRetryAfterMs;
        }

        this.rateLimitMetrics.set(profileName, entry);
    }

    getSnapshot() {
        const rateLimits = {};
        for (const [profile, metrics] of this.rateLimitMetrics.entries()) {
            rateLimits[profile] = { ...metrics };
        }

        return {
            sessions: { ...this.sessionMetrics },
            rateLimits
        };
    }
}

module.exports = DashboardObservability;
