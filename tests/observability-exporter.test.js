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
    assert.equal(metricCalls, 1);
    assert.equal(telemetry[1].name, 'observability-sink');
    assert.equal(telemetry[1].metrics, null);
    assert.match(telemetry[1].metricsError, /metric failure/i);

    cleanup();
    const remaining = exporter.getSinkTelemetry();
    assert.equal(remaining.length, 1);
});
