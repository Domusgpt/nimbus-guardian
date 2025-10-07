'use strict';

const DEFAULT_WINDOW_MS = 60 * 1000;
const DEFAULT_MAX = 60;

class RateLimiter {
    constructor(options = {}) {
        const {
            windowMs = DEFAULT_WINDOW_MS,
            max = DEFAULT_MAX,
            now = () => Date.now()
        } = options;

        if (!Number.isFinite(windowMs) || windowMs <= 0) {
            throw new Error('windowMs must be a positive number');
        }

        if (!Number.isFinite(max) || max <= 0) {
            throw new Error('max must be a positive number');
        }

        this.windowMs = windowMs;
        this.max = Math.floor(max);
        this.now = typeof now === 'function' ? now : () => Date.now();

        this.buckets = new Map();
    }

    _getBucket(key, currentTime) {
        const existing = this.buckets.get(key);
        if (!existing) {
            return null;
        }

        if (existing.expiresAt <= currentTime) {
            this.buckets.delete(key);
            return null;
        }

        return existing;
    }

    consume(key, weight = 1, currentTime = this.now()) {
        if (!key) {
            throw new Error('A key is required for rate limiting');
        }

        if (!Number.isFinite(weight) || weight <= 0) {
            throw new Error('weight must be a positive number');
        }

        const normalizedWeight = Math.ceil(weight);
        if (normalizedWeight > this.max) {
            return {
                allowed: false,
                remaining: 0,
                retryAfterMs: this.windowMs,
                resetMs: currentTime + this.windowMs
            };
        }

        const bucket = this._getBucket(key, currentTime) || {
            count: 0,
            expiresAt: currentTime + this.windowMs
        };

        if (bucket.count + normalizedWeight > this.max) {
            const retryAfterMs = Math.max(0, bucket.expiresAt - currentTime);
            return {
                allowed: false,
                remaining: Math.max(0, this.max - bucket.count),
                retryAfterMs,
                resetMs: bucket.expiresAt
            };
        }

        bucket.count += normalizedWeight;
        this.buckets.set(key, bucket);

        return {
            allowed: true,
            remaining: Math.max(0, this.max - bucket.count),
            retryAfterMs: 0,
            resetMs: bucket.expiresAt
        };
    }

    reset(key) {
        if (key) {
            this.buckets.delete(key);
        }
    }

    resetAll() {
        this.buckets.clear();
    }
}

module.exports = RateLimiter;
