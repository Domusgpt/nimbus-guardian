'use strict';

const DEFAULT_WINDOW_MS = 60 * 1000;
const DEFAULT_MAX = 60;

class RateLimiter {
    constructor(options = {}) {
        const {
            windowMs = DEFAULT_WINDOW_MS,
            max = DEFAULT_MAX,
            now = () => Date.now(),
            onConsume = null
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
        this.onConsume = typeof onConsume === 'function' ? onConsume : null;

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
        let bucket = this._getBucket(key, currentTime);
        if (!bucket) {
            bucket = {
                count: 0,
                expiresAt: currentTime + this.windowMs
            };
        }

        let outcome;

        if (normalizedWeight > this.max) {
            outcome = {
                allowed: false,
                remaining: 0,
                retryAfterMs: this.windowMs,
                resetMs: currentTime + this.windowMs
            };
        } else if (bucket.count + normalizedWeight > this.max) {
            const retryAfterMs = Math.max(0, bucket.expiresAt - currentTime);
            outcome = {
                allowed: false,
                remaining: Math.max(0, this.max - bucket.count),
                retryAfterMs,
                resetMs: bucket.expiresAt
            };
        } else {
            bucket.count += normalizedWeight;
            this.buckets.set(key, bucket);
            outcome = {
                allowed: true,
                remaining: Math.max(0, this.max - bucket.count),
                retryAfterMs: 0,
                resetMs: bucket.expiresAt
            };
        }

        this._emitConsume({
            key,
            weight: normalizedWeight,
            currentTime,
            windowMs: this.windowMs,
            max: this.max,
            ...outcome
        });

        return outcome;
    }

    reset(key) {
        if (key) {
            this.buckets.delete(key);
        }
    }

    resetAll() {
        this.buckets.clear();
    }

    _emitConsume(payload) {
        if (!this.onConsume) {
            return;
        }

        try {
            this.onConsume(payload);
        } catch {
            // Observability hooks should never break rate limiting.
        }
    }
}

module.exports = RateLimiter;
