'use strict';

const DEFAULT_HEARTBEAT_MS = 30000;
const DEFAULT_DEBOUNCE_MS = 200;

const isFiniteNumber = (value) => Number.isFinite(value);
const noop = () => {};

class ObservabilityExporter {
    constructor(options = {}) {
        const {
            getSnapshot = () => ({}),
            heartbeatMs = DEFAULT_HEARTBEAT_MS,
            debounceMs = DEFAULT_DEBOUNCE_MS,
            now = () => Date.now(),
            logger = console
        } = options;

        this.getSnapshot = typeof getSnapshot === 'function' ? getSnapshot : () => ({});
        this.heartbeatMs = isFiniteNumber(heartbeatMs) && heartbeatMs > 0
            ? heartbeatMs
            : DEFAULT_HEARTBEAT_MS;
        this.debounceMs = isFiniteNumber(debounceMs) && debounceMs >= 0
            ? debounceMs
            : DEFAULT_DEBOUNCE_MS;
        this.now = typeof now === 'function' ? now : () => Date.now();
        this.logger = logger || console;

        this.clients = new Set();
        this.sinks = new Set();
        this.lastFingerprintSignature = null;
        this.pendingFlush = null;
        this.heartbeatTimer = null;
    }

    addStream(stream) {
        if (!stream || typeof stream.write !== 'function') {
            return () => {};
        }

        this.clients.add(stream);
        this._ensureHeartbeat();
        this._sendInitial(stream);

        const cleanup = () => {
            this.removeStream(stream);
        };

        stream.on?.('close', cleanup);
        stream.on?.('error', cleanup);

        return cleanup;
    }

    removeStream(stream) {
        if (!stream) {
            return;
        }

        if (this.clients.delete(stream)) {
            try {
                stream.end?.();
            } catch {
                // Ignore close errors.
            }
        }

        if (this.clients.size === 0) {
            this._stopHeartbeat();
        }
    }

    addSink(handler, options = {}) {
        if (typeof handler !== 'function') {
            return noop;
        }

        this.sinks.add(handler);

        const { initial = true } = options || {};
        if (initial) {
            queueMicrotask(() => {
                if (this.sinks.has(handler)) {
                    this._pushSnapshot({ force: true, sinks: [handler] });
                }
            });
        }

        return () => {
            this.removeSink(handler);
        };
    }

    removeSink(handler) {
        if (!handler) {
            return;
        }
        this.sinks.delete(handler);
    }

    shutdown() {
        for (const client of [...this.clients]) {
            this.removeStream(client);
        }
        this.sinks.clear();
        this._stopHeartbeat();
    }

    notifyFingerprintUpdate() {
        const hasStreams = this.clients.size > 0;
        const hasSinks = this.sinks.size > 0;

        if (!hasStreams && !hasSinks) {
            this.lastFingerprintSignature = null;
            return;
        }

        if (this.debounceMs === 0) {
            this._pushSnapshot();
            return;
        }

        if (this.pendingFlush) {
            return;
        }

        this.pendingFlush = setTimeout(() => {
            this.pendingFlush = null;
            this._pushSnapshot();
        }, this.debounceMs);
        this.pendingFlush.unref?.();
    }

    _sendInitial(stream) {
        try {
            stream.write(`: connected ${this._isoTimestamp()}\n\n`);
        } catch {
            // ignore connection errors
        }
        this._pushSnapshot({ force: true, target: stream, sinks: [] });
    }

    _pushSnapshot(options = {}) {
        const { force = false, target = null, sinks = null } = options;
        const recipients = target ? [target] : [...this.clients];
        const sinkRecipients = Array.isArray(sinks)
            ? sinks.filter((sink) => typeof sink === 'function')
            : [...this.sinks];

        if (recipients.length === 0 && sinkRecipients.length === 0) {
            return;
        }

        const snapshot = this._safeSnapshot();
        const fingerprintSignature = this._fingerprintSignature(snapshot?.fingerprints);

        if (!force && fingerprintSignature && fingerprintSignature === this.lastFingerprintSignature) {
            return;
        }

        this.lastFingerprintSignature = fingerprintSignature;

        const payload = {
            type: 'fingerprints',
            emittedAt: this._isoTimestamp(),
            fingerprints: snapshot?.fingerprints ?? null
        };

        const data = `data: ${JSON.stringify(payload)}\n\n`;

        for (const client of recipients) {
            try {
                client.write(data);
            } catch {
                this.removeStream(client);
            }
        }

        if (sinkRecipients.length > 0) {
            this._notifySinks(payload, sinkRecipients);
        }
    }

    _safeSnapshot() {
        try {
            const snapshot = this.getSnapshot();
            return snapshot && typeof snapshot === 'object' ? snapshot : {};
        } catch {
            return {};
        }
    }

    _fingerprintSignature(fingerprints) {
        try {
            return JSON.stringify(fingerprints ?? null);
        } catch {
            return null;
        }
    }

    _isoTimestamp() {
        try {
            return new Date(this.now()).toISOString();
        } catch {
            return null;
        }
    }

    _ensureHeartbeat() {
        if (this.heartbeatTimer || this.heartbeatMs <= 0) {
            return;
        }

        this.heartbeatTimer = setInterval(() => {
            const heartbeat = `: heartbeat ${this._isoTimestamp()}\n\n`;
            for (const client of this.clients) {
                try {
                    client.write(heartbeat);
                } catch {
                    this.removeStream(client);
                }
            }
        }, this.heartbeatMs);
        this.heartbeatTimer.unref?.();
    }

    _stopHeartbeat() {
        if (this.pendingFlush) {
            clearTimeout(this.pendingFlush);
            this.pendingFlush = null;
        }

        if (!this.heartbeatTimer) {
            return;
        }

        clearInterval(this.heartbeatTimer);
        this.heartbeatTimer = null;
    }

    _notifySinks(payload, sinks) {
        for (const sink of sinks) {
            if (typeof sink !== 'function') {
                continue;
            }

            try {
                const result = sink(payload);
                if (result && typeof result.then === 'function') {
                    result.catch((error) => {
                        this.logger?.warn?.('Observability sink rejected payload', error);
                    });
                }
            } catch (error) {
                this.logger?.warn?.('Observability sink failed', error);
            }
        }
    }
}

module.exports = ObservabilityExporter;
