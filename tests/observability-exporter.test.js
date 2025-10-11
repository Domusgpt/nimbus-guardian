'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const ObservabilityExporter = require('../lib/observability-exporter');

function createFakeStream(log = []) {
    return {
        writes: log,
        write(chunk) {
            this.writes.push(chunk);
        },
        on() {
            // no-op for tests
        },
        end() {
            // no-op for tests
        }
    };
}

function extractEvents(writes) {
    const frames = [];
    for (const chunk of writes) {
        const parts = chunk.split('\n\n');
        for (const part of parts) {
            if (!part.trim()) {
                continue;
            }
            const lines = part.split('\n');
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const payload = line.slice(6).trim();
                    frames.push(JSON.parse(payload));
                }
            }
        }
    }
    return frames;
}

test('ObservabilityExporter streams fingerprint payloads when summaries change', () => {
    const snapshots = [
        { fingerprints: { totalTracked: 0, recentFingerprints: [] } },
        { fingerprints: { totalTracked: 1, recentFingerprints: [
            {
                fingerprintHash: 'hash-1',
                sessionCount: 1,
                firstSeen: '2025-01-01T00:00:00.000Z',
                lastSeen: '2025-01-01T00:00:00.000Z'
            }
        ] } }
    ];

    let currentIndex = 0;
    const exporter = new ObservabilityExporter({
        getSnapshot: () => snapshots[currentIndex],
        now: () => Date.parse('2025-01-01T00:00:00.000Z'),
        debounceMs: 0
    });

    const writes = [];
    const stream = createFakeStream(writes);
    exporter.addStream(stream);

    let events = extractEvents(writes);
    assert.equal(events.length, 1);
    assert.equal(events[0].type, 'fingerprints');
    assert.equal(events[0].fingerprints.totalTracked, 0);

    currentIndex = 1;
    exporter.notifyFingerprintUpdate();

    events = extractEvents(writes);
    assert.equal(events.length, 2);
    assert.equal(events[1].fingerprints.totalTracked, 1);
    assert.equal(events[1].fingerprints.recentFingerprints[0].fingerprintHash, 'hash-1');

    exporter.notifyFingerprintUpdate();
    events = extractEvents(writes);
    assert.equal(events.length, 2, 'duplicate snapshots should be ignored');
});

test('ObservabilityExporter annotates snapshots with fingerprint and sink deltas', () => {
    const snapshots = [
        {
            fingerprints: {
                totalTracked: 1,
                recentFingerprints: [
                    { fingerprintHash: 'hash-1', sessionCount: 1 }
                ]
            },
            sinks: [
                {
                    name: 'disk-log',
                    status: 'healthy',
                    metrics: {
                        delivery: {
                            deliveredEntries: 1,
                            failedEntries: 0
                        }
                    }
                }
            ]
        },
        {
            fingerprints: {
                totalTracked: 2,
                recentFingerprints: [
                    { fingerprintHash: 'hash-1', sessionCount: 2 },
                    { fingerprintHash: 'hash-2', sessionCount: 1 }
                ]
            },
            sinks: [
                {
                    name: 'disk-log',
                    status: 'degraded',
                    metrics: {
                        delivery: {
                            deliveredEntries: 1,
                            failedEntries: 1
                        }
                    }
                },
                {
                    name: 'webhook',
                    status: 'healthy',
                    metrics: {
                        queue: {
                            pendingEntries: 0
                        }
                    }
                }
            ]
        }
    ];

    let index = 0;
    const exporter = new ObservabilityExporter({
        getSnapshot: () => snapshots[index],
        debounceMs: 0,
        historyLimit: 5
    });

    const writes = [];
    exporter.addStream(createFakeStream(writes));

    let events = extractEvents(writes);
    assert.equal(events.length, 1);
    assert.equal(events[0].fingerprints.totalTracked, 1);
    assert.equal(events[0].delta, undefined);
    assert.ok(events[0].summary);
    assert.equal(events[0].summary.fingerprints.totalTracked, 1);
    assert.equal(events[0].summary.fingerprints.recentCount, 1);
    assert.equal(events[0].summary.fingerprints.activeRecent, 1);
    assert.equal(events[0].summary.fingerprints.sessionCountTotal, 1);
    assert.equal(events[0].summary.sinks.total, 1);
    assert.equal(events[0].summary.sinks.statusCounts.healthy, 1);
    assert.equal(events[0].summary.sinks.metricsAvailable, 1);

    index = 1;
    exporter.notifyFingerprintUpdate();

    events = extractEvents(writes);
    assert.equal(events.length, 2);

    const delta = events[1].delta;
    assert.ok(delta);
    assert.ok(delta.fingerprints);
    assert.ok(delta.sinks);

    assert.equal(delta.fingerprints.totalTracked.delta, 1);
    assert.equal(delta.fingerprints.totalTracked.previous, 1);
    assert.equal(delta.fingerprints.totalTracked.current, 2);

    const updates = delta.fingerprints.recentFingerprints.updated;
    assert.ok(Array.isArray(updates));
    assert.equal(updates[0].fingerprintHash, 'hash-1');
    assert.equal(updates[0].delta, 1);

    const additions = delta.fingerprints.recentFingerprints.added;
    assert.ok(Array.isArray(additions));
    assert.equal(additions[0].fingerprintHash, 'hash-2');

    assert.ok(Array.isArray(delta.sinks.added));
    assert.equal(delta.sinks.added[0].name, 'webhook');

    assert.ok(events[1].summary);
    assert.equal(events[1].summary.fingerprints.totalTracked, 2);
    assert.equal(events[1].summary.fingerprints.recentCount, 2);
    assert.equal(events[1].summary.fingerprints.activeRecent, 2);
    assert.equal(events[1].summary.fingerprints.sessionCountTotal, 3);
    assert.equal(events[1].summary.sinks.total, 2);
    assert.equal(events[1].summary.sinks.statusCounts.healthy, 1);
    assert.equal(events[1].summary.sinks.statusCounts.degraded, 1);
    assert.equal(events[1].summary.sinks.metricsAvailable, 2);
    assert.ok(events[1].summary.sinks.unhealthy);
    assert.equal(events[1].summary.sinks.unhealthy.degraded, 1);
    assert.equal(events[1].summary.sinks.unhealthy.failing, 0);

    const statusChange = delta.sinks.statusChanges[0];
    assert.equal(statusChange.name, 'disk-log');
    assert.equal(statusChange.previous, 'healthy');
    assert.equal(statusChange.current, 'degraded');

    const metricsChange = delta.sinks.metricsChanged[0];
    assert.equal(metricsChange.name, 'disk-log');
    assert.ok(metricsChange.metrics['delivery.failedEntries']);
    assert.equal(metricsChange.metrics['delivery.failedEntries'].delta, 1);

    const history = exporter.getSnapshotHistory();
    assert.equal(history.length, 1);
    assert.equal(history[0].delta.fingerprints.totalTracked.delta, 1);
    assert.ok(history[0].summary);
    assert.equal(history[0].summary.fingerprints.totalTracked, 2);
    assert.equal(history[0].summary.sinks.total, 2);
});

test('ObservabilityExporter stores summary metadata in history snapshots', () => {
    const snapshots = [
        {
            fingerprints: {
                totalTracked: 2,
                ttlMs: 3600000,
                lastUpdatedAt: '2025-01-01T00:00:00.000Z',
                recentFingerprints: [
                    { fingerprintHash: 'hash-a', sessionCount: 2 },
                    { fingerprintHash: 'hash-b', sessionCount: 0 }
                ]
            },
            sinks: [
                {
                    name: 'disk-log',
                    status: 'healthy',
                    metrics: { queue: { pendingEntries: 0 } }
                }
            ]
        },
        {
            fingerprints: {
                totalTracked: 3,
                ttlMs: 3600000,
                lastUpdatedAt: '2025-01-02T00:00:00.000Z',
                recentFingerprints: [
                    { fingerprintHash: 'hash-a', sessionCount: 1 },
                    { fingerprintHash: 'hash-c', sessionCount: 1 }
                ]
            },
            sinks: [
                {
                    name: 'disk-log',
                    status: 'degraded',
                    metrics: { queue: { pendingEntries: 2 } }
                },
                {
                    name: 'webhook',
                    status: 'failing',
                    metricsError: 'timeout'
                }
            ]
        }
    ];

    let index = 0;
    const exporter = new ObservabilityExporter({
        getSnapshot: () => snapshots[index],
        debounceMs: 0,
        historyLimit: 5
    });

    exporter.notifyFingerprintUpdate();
    index = 1;
    exporter.notifyFingerprintUpdate();

    const history = exporter.getSnapshotHistory();
    assert.equal(history.length, 2);

    const first = history[0];
    assert.ok(first.summary);
    assert.equal(first.summary.fingerprints.totalTracked, 2);
    assert.equal(first.summary.fingerprints.recentCount, 2);
    assert.equal(first.summary.fingerprints.activeRecent, 1);
    assert.equal(first.summary.fingerprints.sessionCountTotal, 2);
    assert.equal(first.summary.fingerprints.ttlMs, 3600000);
    assert.equal(first.summary.fingerprints.lastUpdatedAt, '2025-01-01T00:00:00.000Z');
    assert.equal(first.summary.sinks.total, 1);
    assert.equal(first.summary.sinks.statusCounts.healthy, 1);
    assert.equal(first.summary.sinks.metricsAvailable, 1);

    const second = history[1];
    assert.ok(second.summary);
    assert.equal(second.summary.fingerprints.totalTracked, 3);
    assert.equal(second.summary.fingerprints.recentCount, 2);
    assert.equal(second.summary.fingerprints.activeRecent, 2);
    assert.equal(second.summary.fingerprints.sessionCountTotal, 2);
    assert.equal(second.summary.fingerprints.lastUpdatedAt, '2025-01-02T00:00:00.000Z');
    assert.equal(second.summary.sinks.total, 2);
    assert.equal(second.summary.sinks.statusCounts.degraded, 1);
    assert.equal(second.summary.sinks.statusCounts.failing, 1);
    assert.equal(second.summary.sinks.metricsAvailable, 1);
    assert.equal(second.summary.sinks.metricsWithErrors, 1);
    assert.ok(second.summary.sinks.unhealthy);
    assert.equal(second.summary.sinks.unhealthy.degraded, 1);
    assert.equal(second.summary.sinks.unhealthy.failing, 1);

    first.summary.fingerprints.recentCount = 99;
    const refreshedHistory = exporter.getSnapshotHistory();
    assert.equal(refreshedHistory[0].summary.fingerprints.recentCount, 2);
});

test('ObservabilityExporter summarizes history overview metrics', () => {
    const snapshots = [
        {
            fingerprints: {
                totalTracked: 2,
                ttlMs: 3600000,
                lastUpdatedAt: '2025-01-01T00:00:00.000Z',
                recentFingerprints: [
                    { fingerprintHash: 'hash-a', sessionCount: 1 },
                    { fingerprintHash: 'hash-b', sessionCount: 0 }
                ]
            },
            sinks: [
                { name: 'disk-log', status: 'healthy', metrics: { queue: { pendingEntries: 0 } } },
                { name: 'webhook', status: 'pending', metrics: { attempts: 0 } }
            ]
        },
        {
            fingerprints: {
                totalTracked: 3,
                ttlMs: 3600000,
                lastUpdatedAt: '2025-01-01T00:05:00.000Z',
                recentFingerprints: [
                    { fingerprintHash: 'hash-a', sessionCount: 2 },
                    { fingerprintHash: 'hash-c', sessionCount: 1 }
                ]
            },
            sinks: [
                { name: 'disk-log', status: 'degraded', metrics: { queue: { pendingEntries: 2 } } },
                { name: 'webhook', status: 'failing', metricsError: 'timeout' }
            ]
        },
        {
            fingerprints: {
                totalTracked: 4,
                ttlMs: 3600000,
                lastUpdatedAt: '2025-01-01T00:10:00.000Z',
                recentFingerprints: [
                    { fingerprintHash: 'hash-a', sessionCount: 1 },
                    { fingerprintHash: 'hash-d', sessionCount: 1 }
                ]
            },
            sinks: [
                { name: 'disk-log', status: 'healthy', metrics: { queue: { pendingEntries: 1 } } },
                { name: 'webhook', status: 'healthy', metricsError: 'stale metrics' }
            ]
        }
    ];

    const timestamps = [
        Date.parse('2025-01-01T00:00:00.000Z'),
        Date.parse('2025-01-01T00:05:00.000Z'),
        Date.parse('2025-01-01T00:10:00.000Z')
    ];

    let index = 0;
    const exporter = new ObservabilityExporter({
        getSnapshot: () => snapshots[index],
        now: () => timestamps[index],
        debounceMs: 0,
        historyLimit: 10
    });

    for (let i = 0; i < snapshots.length; i += 1) {
        index = i;
        exporter.notifyFingerprintUpdate();
    }

    const { history, overview } = exporter.getSnapshotHistory({ includeOverview: true });

    assert.equal(history.length, 3);
    assert.ok(overview);
    assert.equal(overview.totalSnapshots, 3);
    assert.equal(overview.firstEmittedAt, new Date(timestamps[0]).toISOString());
    assert.equal(overview.lastEmittedAt, new Date(timestamps[2]).toISOString());
    assert.equal(overview.rangeMs, timestamps[2] - timestamps[0]);

    assert.ok(overview.fingerprints);
    assert.equal(overview.fingerprints.minTotalTracked, 2);
    assert.equal(overview.fingerprints.maxTotalTracked, 4);
    assert.equal(overview.fingerprints.averageTotalTracked, 3);
    assert.equal(overview.fingerprints.latestTotalTracked, 4);
    assert.equal(overview.fingerprints.averageRecentCount, 2);
    assert.equal(overview.fingerprints.maxRecentCount, 2);
    assert.equal(overview.fingerprints.maxActiveRecent, 2);
    assert.equal(overview.fingerprints.uniqueRecentFingerprints, 4);
    assert.equal(overview.fingerprints.averageSessionCountTotal, 2);
    assert.equal(overview.fingerprints.latest.totalTracked, 4);

    assert.ok(overview.sinks);
    assert.equal(overview.sinks.uniqueSinks, 2);
    assert.equal(overview.sinks.statusCounts.healthy, 3);
    assert.equal(overview.sinks.statusCounts.degraded, 1);
    assert.equal(overview.sinks.statusCounts.failing, 1);
    assert.equal(overview.sinks.statusCounts.pending, 1);
    assert.equal(overview.sinks.totalStatusTransitions, 4);
    assert.equal(overview.sinks.statusTransitions['healthy->degraded'], 1);
    assert.equal(overview.sinks.statusTransitions['degraded->healthy'], 1);
    assert.equal(overview.sinks.statusTransitions['pending->failing'], 1);
    assert.equal(overview.sinks.statusTransitions['failing->healthy'], 1);
    assert.equal(overview.sinks.unhealthySnapshots, 1);
    assert.equal(overview.sinks.metricsWithErrorsSnapshots, 2);
    assert.equal(overview.sinks.lastUnhealthyAt, new Date(timestamps[1]).toISOString());
    assert.ok(overview.sinks.latest);
    assert.equal(overview.sinks.latest.statusCounts.healthy, 2);

    const limited = exporter.getSnapshotHistory({ limit: 2, includeOverview: true });
    assert.equal(limited.history.length, 2);
    assert.equal(limited.overview.totalSnapshots, 2);
    assert.equal(limited.overview.firstEmittedAt, new Date(timestamps[1]).toISOString());
    assert.equal(limited.overview.fingerprints.minTotalTracked, 3);
    assert.equal(limited.overview.sinks.totalStatusTransitions, 2);
});

test('ObservabilityExporter sends fresh snapshots for new subscribers', () => {
    const snapshots = [
        { fingerprints: { totalTracked: 1, recentFingerprints: [] } },
        { fingerprints: { totalTracked: 3, recentFingerprints: [
            {
                fingerprintHash: 'hash-2',
                sessionCount: 2,
                firstSeen: '2025-01-02T00:00:00.000Z',
                lastSeen: '2025-01-02T00:00:00.000Z'
            }
        ] } }
    ];

    let currentIndex = 0;
    const exporter = new ObservabilityExporter({
        getSnapshot: () => snapshots[currentIndex],
        now: () => Date.parse('2025-01-02T00:00:00.000Z'),
        debounceMs: 0
    });

    const firstWrites = [];
    exporter.addStream(createFakeStream(firstWrites));

    currentIndex = 1;
    exporter.shutdown();

    const secondWrites = [];
    exporter.addStream(createFakeStream(secondWrites));

    const events = extractEvents(secondWrites);
    assert.equal(events.length, 1);
    assert.equal(events[0].fingerprints.totalTracked, 3);
    assert.equal(events[0].fingerprints.recentFingerprints[0].fingerprintHash, 'hash-2');
});

test('ObservabilityExporter notifies sinks for new snapshots and supports removal', async () => {
    const snapshots = [
        { fingerprints: { totalTracked: 1 } },
        { fingerprints: { totalTracked: 2 } }
    ];

    let currentIndex = 0;
    const exporter = new ObservabilityExporter({
        getSnapshot: () => snapshots[currentIndex],
        debounceMs: 0,
        logger: { warn: () => {} }
    });

    const received = [];
    const cleanup = exporter.addSink((payload) => {
        received.push(payload);
    });

    await Promise.resolve();
    assert.equal(received.length, 1);
    assert.equal(received[0].fingerprints.totalTracked, 1);

    currentIndex = 1;
    exporter.notifyFingerprintUpdate();

    assert.equal(received.length, 2);
    assert.equal(received[1].fingerprints.totalTracked, 2);

    exporter.notifyFingerprintUpdate();
    assert.equal(received.length, 2, 'duplicate snapshots should be ignored for sinks');

    cleanup();

    currentIndex = 0;
    exporter.notifyFingerprintUpdate();
    assert.equal(received.length, 2, 'removed sinks should not receive further updates');
});

test('ObservabilityExporter surfaces sink telemetry with metadata and error isolation', () => {
    const exporter = new ObservabilityExporter({
        getSnapshot: () => ({ fingerprints: { totalTracked: 1 } }),
        debounceMs: 0,
        logger: { warn: () => {} }
    });

    let metricCalls = 0;
    const cleanup = exporter.addSink(() => {}, {
        name: 'custom-sink',
        metrics: () => {
            metricCalls += 1;
            return { pending: 0 };
        }
    });

    exporter.addSink(() => {
        throw new Error('boom');
    }, {
        metrics: () => {
            throw new Error('metric failure');
        }
    });

    const telemetry = exporter.getSinkTelemetry();
    assert.equal(telemetry.length, 2);
    assert.equal(telemetry[0].name, 'custom-sink');
    assert.deepEqual(telemetry[0].metrics, { pending: 0 });
    assert.equal(telemetry[0].status, 'unknown');
    assert.ok(telemetry[0].statusReason);
    assert.equal(metricCalls, 1);
    assert.equal(telemetry[1].name, 'observability-sink');
    assert.equal(telemetry[1].metrics, null);
    assert.match(telemetry[1].metricsError, /metric failure/i);
    assert.equal(telemetry[1].status, 'unknown');
    assert.ok(telemetry[1].statusReason);

    cleanup();
    const remaining = exporter.getSinkTelemetry();
    assert.equal(remaining.length, 1);
});

test('ObservabilityExporter emits sink telemetry updates without duplicating sink payloads', async () => {
    const snapshot = {
        fingerprints: { totalTracked: 1 },
        sinks: [
            {
                name: 'webhook',
                metrics: { queue: { pendingEntries: 0 } }
            }
        ]
    };

    const exporter = new ObservabilityExporter({
        getSnapshot: () => snapshot,
        debounceMs: 0,
        logger: { warn: () => {} }
    });

    const writes = [];
    exporter.addStream(createFakeStream(writes));

    const sinkPayloads = [];
    const cleanup = exporter.addSink((payload) => {
        sinkPayloads.push(payload);
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    let events = extractEvents(writes);
    assert.equal(events.length, 2);
    assert.equal(sinkPayloads.length, 1);

    snapshot.sinks[0].metrics.queue.pendingEntries = 5;
    exporter.notifySinkUpdate();

    await new Promise((resolve) => setTimeout(resolve, 0));

    events = extractEvents(writes);
    assert.equal(events.length, 3);
    assert.equal(events[2].sinks[0].metrics.queue.pendingEntries, 5);
    assert.equal(sinkPayloads.length, 1, 'sink should not receive duplicate payloads');

    const delta = events[2].delta;
    assert.ok(delta);
    assert.ok(Array.isArray(delta.sinks.metricsChanged));
    const metricDelta = delta.sinks.metricsChanged[0].metrics['queue.pendingEntries'];
    assert.ok(metricDelta);
    assert.equal(metricDelta.delta, 5);

    cleanup();
});

test('ObservabilityExporter records bounded history even without active streams', () => {
    const snapshots = [
        { fingerprints: { totalTracked: 0 } },
        { fingerprints: { totalTracked: 1 } },
        { fingerprints: { totalTracked: 2 } }
    ];

    let index = 0;
    const exporter = new ObservabilityExporter({
        getSnapshot: () => snapshots[index],
        debounceMs: 0,
        historyLimit: 2
    });

    exporter.notifyFingerprintUpdate();
    let history = exporter.getSnapshotHistory();
    assert.equal(history.length, 1);
    assert.equal(history[0].fingerprints.totalTracked, 0);

    index = 1;
    exporter.notifyFingerprintUpdate();
    history = exporter.getSnapshotHistory();
    assert.equal(history.length, 2);
    assert.equal(history[0].fingerprints.totalTracked, 0);
    assert.equal(history[1].fingerprints.totalTracked, 1);

    index = 2;
    exporter.notifyFingerprintUpdate();
    history = exporter.getSnapshotHistory();
    assert.equal(history.length, 2, 'history should be capped to the configured limit');
    assert.equal(history[0].fingerprints.totalTracked, 1);
    assert.equal(history[1].fingerprints.totalTracked, 2);
    assert.equal(history[1].delta.fingerprints.totalTracked.delta, 1);

    history[1].fingerprints.totalTracked = 99;
    const latest = exporter.getSnapshotHistory();
    assert.equal(latest[1].fingerprints.totalTracked, 2, 'history reads should be immutable clones');
    assert.equal(latest[1].delta.fingerprints.totalTracked.delta, 1);
});
