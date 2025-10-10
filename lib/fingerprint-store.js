'use strict';

const crypto = require('crypto');
const path = require('path');
const fs = require('fs-extra');

const DEFAULT_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
const DEFAULT_MAX_ENTRIES = 5000;

const isFiniteNumber = (value) => Number.isFinite(value);

class FingerprintStore {
    constructor(options = {}) {
        const {
            basePath = process.cwd(),
            filePath = path.join(basePath, '.guardian', 'state', 'fingerprints.json'),
            fsModule = fs,
            now = () => Date.now(),
            ttlMs = DEFAULT_TTL_MS,
            maxEntries = DEFAULT_MAX_ENTRIES,
            writeDebounceMs = 200,
            secret = null
        } = options;

        this.fs = fsModule;
        this.filePath = filePath;
        this.now = typeof now === 'function' ? now : () => Date.now();
        this.ttlMs = isFiniteNumber(ttlMs) && ttlMs > 0 ? ttlMs : DEFAULT_TTL_MS;
        this.maxEntries = isFiniteNumber(maxEntries) && maxEntries > 0
            ? Math.floor(maxEntries)
            : DEFAULT_MAX_ENTRIES;
        this.writeDebounceMs = isFiniteNumber(writeDebounceMs) && writeDebounceMs >= 0
            ? writeDebounceMs
            : 200;

        this.secret = typeof secret === 'string' && secret.length >= 16 ? secret : null;
        this.entries = new Map();
        this.loaded = false;
        this.dirty = false;
        this._pendingSave = null;
        this._debounceTimer = null;
    }

    async ensureLoaded() {
        if (this.loaded) {
            return;
        }

        await this.load();
    }

    async load() {
        if (this.loaded) {
            return;
        }

        try {
            if (!(await this.fs.pathExists(this.filePath))) {
                this.loaded = true;
                this.dirty = true; // ensure file is created with new salt on first persist
                this._ensureSecret();
                await this._scheduleSave();
                return;
            }

            const data = await this.fs.readJson(this.filePath);
            if (data && typeof data === 'object') {
                if (typeof data.salt === 'string' && data.salt.length >= 16) {
                    this.secret = data.salt;
                }

                const entries = Array.isArray(data.entries) ? data.entries : [];
                const currentTime = this.now();
                for (const entry of entries) {
                    const normalized = this._normalizeEntry(entry, currentTime);
                    if (normalized) {
                        this.entries.set(normalized.hash, normalized);
                    }
                }
            }
        } catch {
            // Corrupted stores should not break the dashboard; start fresh.
            this.entries.clear();
        } finally {
            this.loaded = true;
            this._ensureSecret();
            const currentTime = this.now();
            if (this._prune(currentTime)) {
                this.dirty = true;
            }
            await this._scheduleSave();
        }
    }

    _ensureSecret() {
        if (this.secret) {
            return;
        }

        this.secret = crypto.randomBytes(24).toString('hex');
        this.dirty = true;
    }

    _normalizeEntry(entry, currentTime) {
        if (!entry || typeof entry !== 'object') {
            return null;
        }

        const hash = typeof entry.fingerprintHash === 'string' && entry.fingerprintHash.length > 0
            ? entry.fingerprintHash
            : null;
        if (!hash) {
            return null;
        }

        const firstSeen = isFiniteNumber(entry.firstSeen) ? entry.firstSeen : null;
        const lastSeen = isFiniteNumber(entry.lastSeen) ? entry.lastSeen : firstSeen;
        if (!isFiniteNumber(lastSeen)) {
            return null;
        }

        if (currentTime - lastSeen > this.ttlMs) {
            return null;
        }

        return {
            hash,
            firstSeen: firstSeen ?? lastSeen,
            lastSeen,
            sessionCount: isFiniteNumber(entry.sessionCount) && entry.sessionCount >= 0
                ? Math.floor(entry.sessionCount)
                : 0,
            lastSessionId: typeof entry.lastSessionId === 'string' && entry.lastSessionId.length > 0
                ? entry.lastSessionId
                : null
        };
    }

    async recordSessionCreated(fingerprint, session = {}) {
        await this._recordEvent('created', fingerprint, session);
    }

    async recordSessionTouched(fingerprint, session = {}) {
        await this._recordEvent('touched', fingerprint, session);
    }

    async recordSessionEnded(fingerprint, session = {}) {
        await this._recordEvent('ended', fingerprint, session);
    }

    async recordSessionMetadata(fingerprint, session = {}) {
        await this._recordEvent('metadata', fingerprint, session);
    }

    async _recordEvent(type, fingerprint, session) {
        if (!fingerprint || typeof fingerprint !== 'string') {
            return;
        }

        await this.ensureLoaded();
        const hash = this._hashFingerprint(fingerprint);
        if (!hash) {
            return;
        }

        const timestamp = this._extractTimestamp(session);
        const sessionId = this._extractSessionId(session);

        let entry = this.entries.get(hash);
        const isNewEntry = !entry;
        if (!entry) {
            entry = {
                hash,
                firstSeen: timestamp,
                lastSeen: timestamp,
                sessionCount: 0,
                lastSessionId: null
            };
            this.entries.set(hash, entry);
        }

        if (!isFiniteNumber(entry.firstSeen) || entry.firstSeen > timestamp) {
            entry.firstSeen = timestamp;
        }

        if (timestamp > entry.lastSeen) {
            entry.lastSeen = timestamp;
        }

        if (type === 'created') {
            if (sessionId && entry.lastSessionId !== sessionId) {
                entry.sessionCount = Math.min(Number.MAX_SAFE_INTEGER, entry.sessionCount + 1);
            }
            if (sessionId) {
                entry.lastSessionId = sessionId;
            }
        } else if (type === 'metadata') {
            if (sessionId && !entry.lastSessionId) {
                entry.lastSessionId = sessionId;
            }
        } else if (type === 'ended') {
            if (sessionId && entry.lastSessionId !== sessionId) {
                entry.lastSessionId = sessionId;
            }
            if (sessionId) {
                entry.sessionCount = Math.max(1, entry.sessionCount);
            }
        } else if (type === 'touched') {
            if (sessionId && entry.lastSessionId !== sessionId) {
                entry.lastSessionId = sessionId;
            }
            if (sessionId) {
                entry.sessionCount = Math.max(1, entry.sessionCount);
            }
        }

        if (isNewEntry && sessionId && type !== 'metadata') {
            entry.sessionCount = Math.max(1, entry.sessionCount);
        }

        const currentTime = this.now();
        if (this._prune(currentTime)) {
            this.dirty = true;
        }

        this.dirty = true;
        await this._scheduleSave();
    }

    _hashFingerprint(fingerprint) {
        this._ensureSecret();
        try {
            return crypto.createHash('sha256')
                .update(`${this.secret}:${fingerprint}`)
                .digest('hex');
        } catch {
            return null;
        }
    }

    _extractTimestamp(session) {
        if (session && isFiniteNumber(session.lastSeen)) {
            return session.lastSeen;
        }
        if (session && isFiniteNumber(session.createdAt)) {
            return session.createdAt;
        }
        return this.now();
    }

    _extractSessionId(session) {
        return session && typeof session.id === 'string' && session.id.length > 0
            ? session.id
            : null;
    }

    _prune(currentTime) {
        let mutated = false;
        for (const [hash, entry] of this.entries.entries()) {
            if (!isFiniteNumber(entry.lastSeen) || currentTime - entry.lastSeen > this.ttlMs) {
                this.entries.delete(hash);
                mutated = true;
            }
        }

        if (this.entries.size > this.maxEntries) {
            const ordered = [...this.entries.entries()].sort((a, b) => b[1].lastSeen - a[1].lastSeen);
            for (let i = this.maxEntries; i < ordered.length; i += 1) {
                this.entries.delete(ordered[i][0]);
                mutated = true;
            }
        }

        return mutated;
    }

    async _scheduleSave() {
        if (!this.dirty) {
            return;
        }

        if (this.writeDebounceMs === 0) {
            await this._persist();
            return;
        }

        if (this._pendingSave) {
            return this._pendingSave;
        }

        this._pendingSave = new Promise((resolve) => {
            this._debounceTimer = setTimeout(async () => {
                this._debounceTimer = null;
                try {
                    await this._persist();
                } finally {
                    this._pendingSave = null;
                    resolve();
                }
            }, this.writeDebounceMs).unref?.();
        });

        return this._pendingSave;
    }

    async _persist() {
        if (!this.dirty) {
            return;
        }

        this.dirty = false;
        this._ensureSecret();

        const ordered = [...this.entries.values()].sort((a, b) => b.lastSeen - a.lastSeen);
        const payload = {
            version: 1,
            updatedAt: this.now(),
            ttlMs: this.ttlMs,
            salt: this.secret,
            entries: ordered.map((entry) => ({
                fingerprintHash: entry.hash,
                firstSeen: entry.firstSeen,
                lastSeen: entry.lastSeen,
                sessionCount: entry.sessionCount,
                lastSessionId: entry.lastSessionId
            }))
        };

        await this.fs.outputJson(this.filePath, payload, { spaces: 2 });
    }

    getSummary(limit = 25) {
        const ordered = [...this.entries.values()].sort((a, b) => b.lastSeen - a.lastSeen);
        const recent = ordered.slice(0, Math.max(0, Math.min(limit, ordered.length)));
        const toIso = (value) => {
            if (!isFiniteNumber(value)) {
                return null;
            }
            try {
                return new Date(value).toISOString();
            } catch {
                return null;
            }
        };

        return {
            ttlMs: this.ttlMs,
            totalTracked: ordered.length,
            recentFingerprints: recent.map((entry) => ({
                fingerprintHash: entry.hash,
                sessionCount: entry.sessionCount,
                firstSeen: toIso(entry.firstSeen),
                lastSeen: toIso(entry.lastSeen)
            })),
            lastUpdatedAt: toIso(ordered[0]?.lastSeen ?? null)
        };
    }
}

module.exports = FingerprintStore;
