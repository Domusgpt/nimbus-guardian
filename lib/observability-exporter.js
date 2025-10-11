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
        this.lastSnapshotPayload = null;
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

        const previous = this.lastSnapshotPayload
            ? this._clonePayload(this.lastSnapshotPayload)
            : null;

        const payload = {
            type: 'fingerprints',
            emittedAt: this._isoTimestamp(),
            fingerprints: snapshot?.fingerprints ?? null,
            sinks: snapshot?.sinks ?? null
        };

        const delta = this._computeDelta(previous, payload);
        if (delta) {
            payload.delta = delta;
        }

        const summary = this._computeSummary(payload);
        if (summary) {
            payload.summary = summary;
        }

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

        const stored = this._clonePayload(payload) || payload;
        this.lastSnapshotPayload = stored;
    }

    getSnapshotHistory(options = {}) {
        const { limit = null, includeOverview = false, since = null } = options || {};

        const normalizedLimit = Number.isFinite(limit) && limit > 0
            ? Math.min(Math.floor(limit), this.historyLimit || Infinity)
            : null;

        const sinceTimestamp = this._coerceTimestamp(since);

        let history = this.history;
        if (sinceTimestamp !== null) {
            history = history.filter((entry) => {
                const entryTimestamp = this._entryTimestamp(entry);
                if (entryTimestamp === null) {
                    return true;
                }
                return entryTimestamp >= sinceTimestamp;
            });
        }

        const start = normalizedLimit
            ? Math.max(history.length - normalizedLimit, 0)
            : 0;

        const snapshots = history
            .slice(start)
            .map((entry) => this._clonePayload(entry))
            .filter(Boolean);

        if (!includeOverview) {
            return snapshots;
        }

        const overview = this._summarizeHistory(snapshots);

        return {
            history: snapshots,
            overview
        };
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

    _computeSummary(payload) {
        if (!payload || typeof payload !== 'object') {
            return null;
        }

        const summary = {};

        const fingerprintSummary = this._summarizeFingerprints(payload.fingerprints);
        if (fingerprintSummary) {
            summary.fingerprints = fingerprintSummary;
        }

        const sinkSummary = this._summarizeSinks(payload.sinks);
        if (sinkSummary) {
            summary.sinks = sinkSummary;
        }

        return Object.keys(summary).length > 0 ? summary : null;
    }

    _summarizeHistory(entries) {
        if (!Array.isArray(entries) || entries.length === 0) {
            return null;
        }

        let firstTimestamp = null;
        let lastTimestamp = null;

        const fingerprintTotals = [];
        const fingerprintRecentCounts = [];
        const fingerprintActiveCounts = [];
        const fingerprintSessionTotals = [];
        const fingerprintHashes = new Set();

        const sinkStatusCounts = {};
        const sinkNames = new Set();
        const sinkTransitionCounts = {};
        let totalTransitions = 0;
        let unhealthySnapshots = 0;
        let metricsErrorSnapshots = 0;
        let lastUnhealthyTimestamp = null;

        let previousSinkStatuses = new Map();

        for (const entry of entries) {
            const emittedTs = this._safeTimestamp(
                entry?.emittedAt
                || entry?.fingerprints?.generatedAt
                || null
            );

            if (emittedTs !== null) {
                if (firstTimestamp === null || emittedTs < firstTimestamp) {
                    firstTimestamp = emittedTs;
                }
                if (lastTimestamp === null || emittedTs > lastTimestamp) {
                    lastTimestamp = emittedTs;
                }
            }

            const fingerprintSummary = entry?.summary?.fingerprints
                || this._summarizeFingerprints(entry?.fingerprints);

            if (fingerprintSummary) {
                const total = this._normalizeNumber(fingerprintSummary.totalTracked);
                if (total !== null) {
                    fingerprintTotals.push(total);
                }

                const recentCount = this._normalizeNumber(fingerprintSummary.recentCount);
                if (recentCount !== null) {
                    fingerprintRecentCounts.push(recentCount);
                }

                const activeRecent = this._normalizeNumber(fingerprintSummary.activeRecent);
                if (activeRecent !== null) {
                    fingerprintActiveCounts.push(activeRecent);
                }

                const sessionTotal = this._normalizeNumber(fingerprintSummary.sessionCountTotal);
                if (sessionTotal !== null) {
                    fingerprintSessionTotals.push(sessionTotal);
                }
            }

            const recentFingerprints = Array.isArray(entry?.fingerprints?.recentFingerprints)
                ? entry.fingerprints.recentFingerprints
                : [];

            for (const recent of recentFingerprints) {
                const hash = typeof recent?.fingerprintHash === 'string'
                    ? recent.fingerprintHash
                    : null;
                if (hash) {
                    fingerprintHashes.add(hash);
                }
            }

            const sinkSummary = entry?.summary?.sinks
                || this._summarizeSinks(entry?.sinks);

        if (sinkSummary?.unhealthy && Object.keys(sinkSummary.unhealthy).length > 0) {
            unhealthySnapshots += 1;
            if (emittedTs !== null) {
                lastUnhealthyTimestamp = emittedTs;
            }
        }

            if (this._normalizeNumber(sinkSummary?.metricsWithErrors) > 0) {
                metricsErrorSnapshots += 1;
            } else if (Array.isArray(entry?.sinks)) {
                const hasMetricsError = entry.sinks.some((sink) => Boolean(sink?.metricsError));
                if (hasMetricsError) {
                    metricsErrorSnapshots += 1;
                }
            }

            const currentSinkStatuses = new Map();
            const sinkList = Array.isArray(entry?.sinks) ? entry.sinks : [];

            for (const sink of sinkList) {
                const name = this._normalizeSinkName(sink?.name);
                sinkNames.add(name);

                const status = typeof sink?.status === 'string' && sink.status.trim().length > 0
                    ? sink.status.trim().toLowerCase()
                    : 'unknown';

                sinkStatusCounts[status] = (sinkStatusCounts[status] || 0) + 1;
                currentSinkStatuses.set(name, status);

                const previousStatus = previousSinkStatuses.get(name);
                if (previousStatus && previousStatus !== status) {
                    const key = `${previousStatus}->${status}`;
                    sinkTransitionCounts[key] = (sinkTransitionCounts[key] || 0) + 1;
                    totalTransitions += 1;
                }
            }

            previousSinkStatuses = currentSinkStatuses;
        }

        const overview = {
            totalSnapshots: entries.length
        };

        if (firstTimestamp !== null) {
            overview.firstEmittedAt = new Date(firstTimestamp).toISOString();
        }
        if (lastTimestamp !== null) {
            overview.lastEmittedAt = new Date(lastTimestamp).toISOString();
        }
        if (firstTimestamp !== null && lastTimestamp !== null && lastTimestamp >= firstTimestamp) {
            overview.rangeMs = lastTimestamp - firstTimestamp;
        }

        const fingerprintOverview = {};

        if (fingerprintTotals.length > 0) {
            fingerprintOverview.minTotalTracked = Math.min(...fingerprintTotals);
            fingerprintOverview.maxTotalTracked = Math.max(...fingerprintTotals);
            const averageTotalTracked = this._mean(fingerprintTotals);
            if (averageTotalTracked !== null) {
                fingerprintOverview.averageTotalTracked = averageTotalTracked;
            }
        }

        if (fingerprintRecentCounts.length > 0) {
            const averageRecentCount = this._mean(fingerprintRecentCounts);
            if (averageRecentCount !== null) {
                fingerprintOverview.averageRecentCount = averageRecentCount;
            }
            fingerprintOverview.maxRecentCount = Math.max(...fingerprintRecentCounts);
        }

        if (fingerprintActiveCounts.length > 0) {
            fingerprintOverview.maxActiveRecent = Math.max(...fingerprintActiveCounts);
        }

        if (fingerprintSessionTotals.length > 0) {
            const averageSessionCountTotal = this._mean(fingerprintSessionTotals);
            if (averageSessionCountTotal !== null) {
                fingerprintOverview.averageSessionCountTotal = averageSessionCountTotal;
            }
        }

        if (fingerprintHashes.size > 0) {
            fingerprintOverview.uniqueRecentFingerprints = fingerprintHashes.size;
        }

        const latestEntry = entries[entries.length - 1];
        const latestFingerprintSummary = latestEntry?.summary?.fingerprints
            || this._summarizeFingerprints(latestEntry?.fingerprints);
        if (latestFingerprintSummary) {
            const latestClone = this._clonePayload(latestFingerprintSummary) || latestFingerprintSummary;
            fingerprintOverview.latest = latestClone;
            const latestTotal = this._normalizeNumber(latestClone.totalTracked);
            if (latestTotal !== null) {
                fingerprintOverview.latestTotalTracked = latestTotal;
            }
        }

        if (Object.keys(fingerprintOverview).length > 0) {
            overview.fingerprints = fingerprintOverview;
        }

        const sinkOverview = {};

        if (sinkNames.size > 0) {
            sinkOverview.uniqueSinks = sinkNames.size;
        }

        if (Object.keys(sinkStatusCounts).length > 0) {
            sinkOverview.statusCounts = sinkStatusCounts;
        }

        if (totalTransitions > 0) {
            sinkOverview.totalStatusTransitions = totalTransitions;
            sinkOverview.statusTransitions = sinkTransitionCounts;
        }

        if (unhealthySnapshots > 0) {
            sinkOverview.unhealthySnapshots = unhealthySnapshots;
        }

        if (metricsErrorSnapshots > 0) {
            sinkOverview.metricsWithErrorsSnapshots = metricsErrorSnapshots;
        }

        if (lastUnhealthyTimestamp !== null) {
            sinkOverview.lastUnhealthyAt = new Date(lastUnhealthyTimestamp).toISOString();
        }

        const latestSinkSummary = latestEntry?.summary?.sinks
            || this._summarizeSinks(latestEntry?.sinks);
        if (latestSinkSummary) {
            sinkOverview.latest = this._clonePayload(latestSinkSummary) || latestSinkSummary;
        }

        if (Object.keys(sinkOverview).length > 0) {
            overview.sinks = sinkOverview;
        }

        return overview;
    }

    _safeTimestamp(value) {
        if (value === null || value === undefined) {
            return null;
        }

        if (typeof value === 'number' && Number.isFinite(value)) {
            return value;
        }

        if (typeof value === 'string') {
            const parsed = Date.parse(value);
            return Number.isFinite(parsed) ? parsed : null;
        }

        return null;
    }

    _mean(values) {
        if (!Array.isArray(values) || values.length === 0) {
            return null;
        }

        const total = values.reduce((acc, value) => acc + value, 0);
        const average = total / values.length;
        return Number.isFinite(average)
            ? Math.round(average * 100) / 100
            : null;
    }

    _summarizeFingerprints(fingerprints) {
        if (!fingerprints || typeof fingerprints !== 'object') {
            return null;
        }

        const recent = Array.isArray(fingerprints.recentFingerprints)
            ? fingerprints.recentFingerprints
            : [];

        const summary = {
            recentCount: recent.length
        };

        const totalTracked = this._normalizeNumber(fingerprints.totalTracked);
        if (totalTracked !== null) {
            summary.totalTracked = totalTracked;
        }

        let activeRecent = 0;
        let sessionCountTotal = 0;

        for (const entry of recent) {
            const sessionCount = this._normalizeNumber(entry?.sessionCount);
            if (sessionCount === null) {
                continue;
            }

            sessionCountTotal += sessionCount;
            if (sessionCount > 0) {
                activeRecent += 1;
            }
        }

        summary.activeRecent = activeRecent;

        if (sessionCountTotal > 0) {
            summary.sessionCountTotal = sessionCountTotal;
        }

        const ttlMs = this._normalizeNumber(fingerprints.ttlMs);
        if (ttlMs !== null && ttlMs >= 0) {
            summary.ttlMs = Math.floor(ttlMs);
        }

        if (typeof fingerprints.lastUpdatedAt === 'string' && fingerprints.lastUpdatedAt.trim()) {
            summary.lastUpdatedAt = fingerprints.lastUpdatedAt;
        }

        return summary;
    }

    _summarizeSinks(sinks) {
        const list = Array.isArray(sinks) ? sinks : [];

        const summary = {
            total: list.length
        };

        const statusCounts = {};
        let metricsAvailable = 0;
        let metricsWithErrors = 0;

        for (const sink of list) {
            const status = typeof sink?.status === 'string' && sink.status.trim().length > 0
                ? sink.status.trim().toLowerCase()
                : 'unknown';
            statusCounts[status] = (statusCounts[status] || 0) + 1;

            if (sink?.metrics && typeof sink.metrics === 'object') {
                metricsAvailable += 1;
            }

            if (sink?.metricsError) {
                metricsWithErrors += 1;
            }
        }

        summary.statusCounts = statusCounts;

        if (metricsAvailable > 0) {
            summary.metricsAvailable = metricsAvailable;
        }

        if (metricsWithErrors > 0) {
            summary.metricsWithErrors = metricsWithErrors;
        }

        const failing = statusCounts.failing ?? 0;
        const degraded = statusCounts.degraded ?? 0;

        if (failing > 0 || degraded > 0) {
            summary.unhealthy = {
                failing,
                degraded
            };
        }

        return summary;
    }

    _computeDelta(previous, current) {
        if (!previous || !current) {
            return null;
        }

        const delta = {};

        const fingerprintDelta = this._diffFingerprints(previous.fingerprints, current.fingerprints);
        if (fingerprintDelta) {
            delta.fingerprints = fingerprintDelta;
        }

        const sinkDelta = this._diffSinks(previous.sinks, current.sinks);
        if (sinkDelta) {
            delta.sinks = sinkDelta;
        }

        return Object.keys(delta).length > 0 ? delta : null;
    }

    _diffFingerprints(previous, current) {
        const prev = previous && typeof previous === 'object' ? previous : {};
        const next = current && typeof current === 'object' ? current : {};

        const summary = {};

        const prevTotal = this._normalizeNumber(prev.totalTracked);
        const nextTotal = this._normalizeNumber(next.totalTracked);
        if (prevTotal !== null || nextTotal !== null) {
            const normalizedPrev = prevTotal ?? 0;
            const normalizedNext = nextTotal ?? 0;
            const change = normalizedNext - normalizedPrev;
            if (change !== 0) {
                summary.totalTracked = {
                    previous: prevTotal,
                    current: nextTotal,
                    delta: change
                };
            }
        }

        const recentDelta = this._diffRecentFingerprints(prev.recentFingerprints, next.recentFingerprints);
        if (recentDelta) {
            summary.recentFingerprints = recentDelta;
        }

        return Object.keys(summary).length > 0 ? summary : null;
    }

    _diffRecentFingerprints(previous = [], current = []) {
        const prevList = Array.isArray(previous) ? previous : [];
        const nextList = Array.isArray(current) ? current : [];

        const prevMap = new Map();
        for (const entry of prevList) {
            const hash = entry?.fingerprintHash;
            if (typeof hash === 'string' && hash.length > 0) {
                prevMap.set(hash, entry);
            }
        }

        const nextMap = new Map();
        for (const entry of nextList) {
            const hash = entry?.fingerprintHash;
            if (typeof hash === 'string' && hash.length > 0) {
                nextMap.set(hash, entry);
            }
        }

        const added = [];
        const removed = [];
        const updated = [];

        for (const [hash, entry] of nextMap.entries()) {
            const previousEntry = prevMap.get(hash);
            if (!previousEntry) {
                const sessionCount = this._normalizeNumber(entry?.sessionCount);
                added.push({
                    fingerprintHash: hash,
                    sessionCount: sessionCount ?? null
                });
                continue;
            }

            const prevCount = this._normalizeNumber(previousEntry?.sessionCount);
            const nextCount = this._normalizeNumber(entry?.sessionCount);
            if (prevCount === null && nextCount === null) {
                continue;
            }
            const normalizedPrev = prevCount ?? 0;
            const normalizedNext = nextCount ?? 0;
            const change = normalizedNext - normalizedPrev;
            if (change !== 0) {
                updated.push({
                    fingerprintHash: hash,
                    previousSessionCount: prevCount,
                    currentSessionCount: nextCount,
                    delta: change
                });
            }
        }

        for (const [hash, entry] of prevMap.entries()) {
            if (!nextMap.has(hash)) {
                const sessionCount = this._normalizeNumber(entry?.sessionCount);
                removed.push({
                    fingerprintHash: hash,
                    sessionCount: sessionCount ?? null
                });
            }
        }

        const summary = {};
        if (added.length > 0) {
            summary.added = added;
        }
        if (removed.length > 0) {
            summary.removed = removed;
        }
        if (updated.length > 0) {
            summary.updated = updated;
        }

        return Object.keys(summary).length > 0 ? summary : null;
    }

    _diffSinks(previous = [], current = []) {
        const prevList = Array.isArray(previous) ? previous : [];
        const nextList = Array.isArray(current) ? current : [];

        const prevMap = new Map();
        for (const sink of prevList) {
            const name = this._normalizeSinkName(sink?.name);
            prevMap.set(name, sink || {});
        }

        const nextMap = new Map();
        for (const sink of nextList) {
            const name = this._normalizeSinkName(sink?.name);
            nextMap.set(name, sink || {});
        }

        const added = [];
        const removed = [];
        const statusChanges = [];
        const metricsChanged = [];

        for (const [name, sink] of nextMap.entries()) {
            const previousSink = prevMap.get(name);
            if (!previousSink) {
                added.push({
                    name,
                    status: sink?.status ?? 'unknown'
                });
                continue;
            }

            if (previousSink?.status !== sink?.status) {
                statusChanges.push({
                    name,
                    previous: previousSink?.status ?? 'unknown',
                    current: sink?.status ?? 'unknown'
                });
            }

            const metricDelta = this._diffNumericMetrics(previousSink?.metrics, sink?.metrics);
            if (metricDelta) {
                metricsChanged.push({
                    name,
                    metrics: metricDelta
                });
            }
        }

        for (const [name, sink] of prevMap.entries()) {
            if (!nextMap.has(name)) {
                removed.push({
                    name,
                    status: sink?.status ?? 'unknown'
                });
            }
        }

        const summary = {};
        if (added.length > 0) {
            summary.added = added;
        }
        if (removed.length > 0) {
            summary.removed = removed;
        }
        if (statusChanges.length > 0) {
            summary.statusChanges = statusChanges;
        }
        if (metricsChanged.length > 0) {
            summary.metricsChanged = metricsChanged;
        }

        return Object.keys(summary).length > 0 ? summary : null;
    }

    _diffNumericMetrics(previous, current) {
        const prevMap = this._flattenNumericMetrics(previous);
        const nextMap = this._flattenNumericMetrics(current);

        const keys = new Set([...prevMap.keys(), ...nextMap.keys()]);
        const changes = {};

        for (const key of keys) {
            const prevValue = prevMap.get(key);
            const nextValue = nextMap.get(key);

            if (prevValue === undefined && nextValue === undefined) {
                continue;
            }

            const prevNumber = this._normalizeNumber(prevValue);
            const nextNumber = this._normalizeNumber(nextValue);

            if (prevNumber === nextNumber) {
                continue;
            }

            const entry = {
                previous: prevNumber,
                current: nextNumber
            };

            if (prevNumber !== null && nextNumber !== null) {
                entry.delta = nextNumber - prevNumber;
            } else if (nextNumber !== null) {
                entry.delta = nextNumber;
            } else if (prevNumber !== null) {
                entry.delta = -prevNumber;
            }

            changes[key] = entry;
        }

        return Object.keys(changes).length > 0 ? changes : null;
    }

    _flattenNumericMetrics(value, prefix = '', result = new Map()) {
        if (Number.isFinite(value)) {
            if (prefix) {
                result.set(prefix, value);
            }
            return result;
        }

        if (!value || typeof value !== 'object') {
            return result;
        }

        if (Array.isArray(value)) {
            value.forEach((item, index) => {
                const path = prefix ? `${prefix}[${index}]` : `[${index}]`;
                this._flattenNumericMetrics(item, path, result);
            });
            return result;
        }

        for (const [key, child] of Object.entries(value)) {
            const path = prefix ? `${prefix}.${key}` : key;
            this._flattenNumericMetrics(child, path, result);
        }

        return result;
    }

    _entryTimestamp(entry) {
        if (!entry || typeof entry !== 'object') {
            return null;
        }

        const emittedAt = this._coerceTimestamp(entry.emittedAt);
        if (emittedAt !== null) {
            return emittedAt;
        }

        if (entry.fingerprints && typeof entry.fingerprints === 'object') {
            const generatedAt = this._coerceTimestamp(entry.fingerprints.generatedAt);
            if (generatedAt !== null) {
                return generatedAt;
            }
        }

        return null;
    }

    _coerceTimestamp(value) {
        if (value === null || value === undefined) {
            return null;
        }

        if (value instanceof Date) {
            const time = value.getTime();
            return Number.isFinite(time) ? time : null;
        }

        if (typeof value === 'number') {
            return Number.isFinite(value) ? value : null;
        }

        if (typeof value === 'string') {
            const trimmed = value.trim();
            if (trimmed.length === 0) {
                return null;
            }

            const numeric = Number(trimmed);
            if (Number.isFinite(numeric)) {
                return numeric;
            }

            const parsed = Date.parse(trimmed);
            return Number.isNaN(parsed) ? null : parsed;
        }

        return null;
    }

    _normalizeNumber(value) {
        if (typeof value === 'number' && Number.isFinite(value)) {
            return value;
        }

        if (typeof value === 'string' && value.trim().length > 0) {
            const parsed = Number(value);
            return Number.isFinite(parsed) ? parsed : null;
        }

        return null;
    }

    _normalizeSinkName(name) {
        if (typeof name === 'string' && name.trim().length > 0) {
            return name.trim();
        }
        return 'observability-sink';
    }
}

module.exports = ObservabilityExporter;
