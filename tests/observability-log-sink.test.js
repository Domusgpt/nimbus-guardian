'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs/promises');

const ObservabilityLogSink = require('../lib/observability-log-sink');

test('ObservabilityLogSink writes snapshots as JSON lines', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'obs-log-'));
    const logPath = path.join(tmpDir, 'observability.log');

    try {
        const sink = new ObservabilityLogSink({
            filePath: logPath,
            now: () => '2025-10-10T00:00:00.000Z'
        });

        await sink.writeSnapshot({
            type: 'fingerprints',
            emittedAt: '2025-10-10T00:00:00.000Z',
            fingerprints: { totalTracked: 3 }
        });

        const contents = await fs.readFile(logPath, 'utf8');
        const lines = contents.trim().split('\n');
        assert.equal(lines.length, 1);

        const parsed = JSON.parse(lines[0]);
        assert.equal(parsed.type, 'fingerprints');
        assert.equal(parsed.fingerprints.totalTracked, 3);
        assert.equal(parsed.receivedAt, '2025-10-10T00:00:00.000Z');
    } finally {
        await fs.rm(tmpDir, { recursive: true, force: true });
    }
});

test('ObservabilityLogSink rotates files when exceeding maxBytes', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'obs-log-'));
    const logPath = path.join(tmpDir, 'observability.log');

    try {
        const sink = new ObservabilityLogSink({
            filePath: logPath,
            maxBytes: 120,
            maxFiles: 2,
            now: (() => {
                let counter = 0;
                return () => new Date(1700000000000 + counter++ * 1000);
            })()
        });

        await sink.writeSnapshot({ type: 'fingerprints', fingerprints: { totalTracked: 1 } });
        await sink.writeSnapshot({ type: 'fingerprints', fingerprints: { totalTracked: 2 } });
        await sink.writeSnapshot({ type: 'fingerprints', fingerprints: { totalTracked: 3 } });

        const current = await fs.readFile(logPath, 'utf8');
        const rotated = await fs.readFile(`${logPath}.1`, 'utf8');

        const currentLines = current.trim().split('\n');
        const rotatedLines = rotated.trim().split('\n');

        assert.equal(currentLines.length, 1);
        assert.equal(rotatedLines.length >= 1, true);

        const latest = JSON.parse(currentLines.pop());
        assert.equal(latest.fingerprints.totalTracked, 3);

        const previous = JSON.parse(rotatedLines.shift());
        assert.ok(previous.fingerprints.totalTracked === 1 || previous.fingerprints.totalTracked === 2);
    } finally {
        await fs.rm(tmpDir, { recursive: true, force: true });
    }
});

test('ObservabilityLogSink exposes telemetry metadata', () => {
    const logPath = path.join(os.tmpdir(), 'obs-log-metadata.log');
    const sink = new ObservabilityLogSink({
        filePath: logPath,
        maxBytes: 2048,
        maxFiles: 4
    });

    const telemetry = sink.getTelemetry();
    assert.equal(telemetry.filePath, path.resolve(logPath));
    assert.equal(telemetry.directory, path.dirname(path.resolve(logPath)));
    assert.equal(telemetry.maxBytes, 2048);
    assert.equal(telemetry.maxFiles, 4);
    assert.ok(telemetry.delivery);
    assert.equal(telemetry.delivery.writtenEntries, 0);
    assert.equal(telemetry.delivery.failedEntries, 0);
});

test('ObservabilityLogSink tracks delivery metrics for successes and failures', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'obs-log-metrics-'));
    const logPath = path.join(tmpDir, 'observability.log');

    try {
        const sink = new ObservabilityLogSink({
            filePath: logPath,
            now: (() => {
                let counter = 0;
                return () => new Date(1700000000000 + counter++ * 1000);
            })()
        });

        await sink.writeSnapshot({ type: 'fingerprints', fingerprints: { totalTracked: 42 } });

        let telemetry = sink.getTelemetry();
        assert.equal(telemetry.delivery.writtenEntries, 1);
        assert.equal(telemetry.delivery.failedEntries, 0);
        assert.ok(telemetry.delivery.lastWriteAt);

        sink._ensureDirectory = async () => { throw new Error('permission-denied'); };

        await assert.rejects(() => sink.writeSnapshot({ type: 'fingerprints' }));

        telemetry = sink.getTelemetry();
        assert.equal(telemetry.delivery.writtenEntries, 1);
        assert.equal(telemetry.delivery.failedEntries, 1);
        assert.ok(telemetry.delivery.lastFailureAt);
        assert.equal(telemetry.delivery.lastErrorMessage, 'permission-denied');
    } finally {
        await fs.rm(tmpDir, { recursive: true, force: true });
    }
});

test('ObservabilityLogSink notifies telemetry callback on write outcomes', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'obs-log-telemetry-'));
    const logPath = path.join(tmpDir, 'observability.log');

    try {
        const calls = [];
        const sink = new ObservabilityLogSink({
            filePath: logPath,
            onTelemetry: () => calls.push('notified')
        });

        await sink.writeSnapshot({ type: 'fingerprints' });
        await new Promise((resolve) => setImmediate(resolve));
        assert.equal(calls.length >= 1, true);

        sink._ensureDirectory = async () => { throw new Error('denied'); };
        await assert.rejects(() => sink.writeSnapshot({ type: 'fingerprints' }));
        await new Promise((resolve) => setImmediate(resolve));

        assert.equal(calls.length >= 2, true);
    } finally {
        await fs.rm(tmpDir, { recursive: true, force: true });
    }
});
