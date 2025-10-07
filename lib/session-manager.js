'use strict';

const crypto = require('crypto');

class SessionManager {
    constructor(options = {}) {
        const {
            ttlMs = 1000 * 60 * 60 * 12, // 12 hours
            cleanupIntervalMs = 1000 * 60 * 10, // 10 minutes
            idGenerator = () => crypto.randomBytes(18).toString('hex'),
            tokenGenerator = () => crypto.randomBytes(32).toString('hex'),
            now = () => Date.now()
        } = options;

        this.ttlMs = ttlMs;
        this.cleanupIntervalMs = cleanupIntervalMs;
        this.idGenerator = idGenerator;
        this.tokenGenerator = tokenGenerator;
        this.now = now;

        this.sessions = new Map();
        this.lastCleanup = 0;
    }

    cleanupExpiredSessions(currentTime = this.now()) {
        if (this.cleanupIntervalMs <= 0) {
            return;
        }

        if (currentTime - this.lastCleanup < this.cleanupIntervalMs) {
            return;
        }

        for (const [id, session] of this.sessions.entries()) {
            if (session.lastSeen + this.ttlMs <= currentTime) {
                this.sessions.delete(id);
            }
        }

        this.lastCleanup = currentTime;
    }

    createSession() {
        const session = this._buildSession();
        this.sessions.set(session.id, session);
        this.cleanupExpiredSessions(session.createdAt);
        return session;
    }

    _buildSession() {
        const timestamp = this.now();
        return {
            id: this.idGenerator(),
            csrfToken: this.tokenGenerator(),
            createdAt: timestamp,
            lastSeen: timestamp
        };
    }

    getSession(sessionId) {
        if (!sessionId) {
            return null;
        }

        const session = this.sessions.get(sessionId);
        if (!session) {
            return null;
        }

        const currentTime = this.now();
        if (session.lastSeen + this.ttlMs <= currentTime) {
            this.sessions.delete(sessionId);
            return null;
        }

        return session;
    }

    touchSession(sessionId, options = {}) {
        const session = this.getSession(sessionId);
        if (!session) {
            return null;
        }

        const { rotateCsrf = false } = options;
        const currentTime = this.now();
        session.lastSeen = currentTime;

        if (rotateCsrf) {
            session.csrfToken = this.tokenGenerator();
        }

        this.sessions.set(sessionId, session);
        this.cleanupExpiredSessions(currentTime);
        return session;
    }
}

module.exports = SessionManager;
