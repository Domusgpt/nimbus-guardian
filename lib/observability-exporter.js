'use strict';

const { evaluateSinkHealth } = require('./observability-sink-health');

const DEFAULT_HEARTBEAT_MS = 30000;
const DEFAULT_DEBOUNCE_MS = 200;
const DEFAULT_HISTORY_LIMIT = 50;

const isFiniteNumber = (value) => Number.isFinite(value);
const noop = () => {};
const scheduleMicrotask = typeof queueMicrotask === 'function'
    ? queueMicrotask
    : (fn) => Promise.resolve().then(fn);

class ObservabilityExporter {
    constructor(options = {}) {
        const {
            getSnapshot = () => ({}),
            heartbeatMs = DEFAULT_HEARTBEAT_MS,
            debounceMs = DEFAULT_DEBOUNCE_MS,
            now = () => Date.now(),
            logger = console,
            historyLimit = DEFAULT_HISTORY_LIMIT
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
        this.historyLimit = Number.isFinite(historyLimit) && historyLimit >= 0
            ? Math.floor(historyLimit)
            : DEFAULT_HISTORY_LIMIT;

        this.clients = new Set();
        this.sinks = new Map();
        this.lastSnapshotSignature = null;
        this.pendingFlush = null;
        this.heartbeatTimer = null;
        this.history = [];
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

        const {
            initial = true,
            name = null,
            metrics = null
        } = options || {};

        const record = {
            handler,
            name: this._sinkName(name, handler),
            metrics: typeof metrics === 'function' ? metrics : null
        };

        this.sinks.set(handler, record);

        if (initial) {
            scheduleMicrotask(() => {
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
        this.history.length = 0;
    }

    notifyFingerprintUpdate() {
        const hasStreams = this.clients.size > 0;
        const hasSinks = this.sinks.size > 0;
        const wantsHistory = this.historyLimit > 0;

        if (!hasStreams && !hasSinks && !wantsHistory) {
            this.lastSnapshotSignature = null;
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

    notifySinkUpdate() {
        this._pushSnapshot({ sinks: [] });
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
            ? sinks.map((sink) => this.sinks.get(sink)).filter(Boolean)
            : [...this.sinks.values()];

        const recordHistory = !target && this.historyLimit > 0;

        if (recipients.length === 0 && sinkRecipients.length === 0 && !recordHistory) {
            return;
        }

        const snapshot = this._safeSnapshot();
        const snapshotSignature = this._snapshotSignature(snapshot);

        if (!force && snapshotSignature && snapshotSignature === this.lastSnapshotSignature) {
            return;
        }

        this.lastSnapshotSignature = snapshotSignature;

        const payload = {
            type: 'fingerprints',
            emittedAt: this._isoTimestamp(),
            fingerprints: snapshot?.fingerprints ?? null,
            sinks: snapshot?.sinks ?? null
        };

        if (recordHistory) {
            this._recordHistory(payload);
        }

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

    getSnapshotHistory(options = {}) {
        const { limit = null } = options || {};

        const normalizedLimit = Number.isFinite(limit) && limit > 0
            ? Math.min(Math.floor(limit), this.historyLimit || Infinity)
            : null;

        const start = normalizedLimit
            ? Math.max(this.history.length - normalizedLimit, 0)
            : 0;

        return this.history
            .slice(start)
            .map((entry) => this._clonePayload(entry))
            .filter(Boolean);
    }

    _safeSnapshot() {
        try {
            const snapshot = this.getSnapshot();
            return snapshot && typeof snapshot === 'object' ? snapshot : {};
        } catch {
            return {};
        }
    }

    _snapshotSignature(snapshot) {
        try {
            if (!snapshot || typeof snapshot !== 'object') {
                return JSON.stringify(null);
            }
            const { fingerprints = null, sinks = null } = snapshot;
            return JSON.stringify({ fingerprints, sinks });
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

    getSinkTelemetry() {
        const telemetry = [];

        for (const record of this.sinks.values()) {
            const info = {
                name: record.name,
                metrics: null,
                status: 'unknown'
            };

            if (record.metrics) {
                try {
                    info.metrics = record.metrics();
                } catch (error) {
                    info.metrics = null;
                    info.metricsError = error?.message || 'Failed to collect metrics';
                    this.logger?.warn?.('Observability sink metrics failed', error);
                }
            }

            const { status, reason } = evaluateSinkHealth(info.name, info.metrics);
            info.status = status;
            if (reason) {
                info.statusReason = reason;
            }

            telemetry.push(info);
        }

        return telemetry;
    }

    _notifySinks(payload, sinks) {
        for (const record of sinks) {
            const sink = record?.handler ?? record;
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

    _sinkName(name, handler) {
        if (typeof name === 'string' && name.trim().length > 0) {
            return name.trim();
        }

        if (handler && typeof handler === 'function') {
            const inferred = handler.name || null;
            if (inferred && inferred.trim().length > 0) {
                return inferred.trim();
            }
        }

        return 'observability-sink';
    }

    _recordHistory(payload) {
        const normalized = this._clonePayload(payload);
        if (!normalized) {
            return;
        }

        this.history.push(normalized);

        if (this.historyLimit > 0 && this.history.length > this.historyLimit) {
            const excess = this.history.length - this.historyLimit;
            this.history.splice(0, excess);
        }
    }

    _clonePayload(payload) {
        if (!payload || typeof payload !== 'object') {
            return null;
        }

        try {
            return JSON.parse(JSON.stringify(payload));
        } catch {
            return null;
        }
    }
}

module.exports = ObservabilityExporter;
