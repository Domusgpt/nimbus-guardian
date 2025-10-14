'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { evaluateSinkHealth } = require('../lib/observability-sink-health');

test('evaluateSinkHealth classifies disk log sink metrics', () => {
    const pending = evaluateSinkHealth('disk-log', {
        delivery: { writtenEntries: 0, failedEntries: 0 }
    });
    assert.equal(pending.status, 'pending');
    assert.match(pending.reason, /written/i);

    const failing = evaluateSinkHealth('disk-log', {
        delivery: { writtenEntries: 0, failedEntries: 2, lastErrorMessage: 'disk full' }
    });
    assert.equal(failing.status, 'failing');
    assert.match(failing.reason, /disk full/);

    const degraded = evaluateSinkHealth('disk-log', {
        delivery: {
            writtenEntries: 2,
            failedEntries: 1,
            lastWriteAt: '2025-10-10T00:00:00Z',
            lastFailureAt: '2025-10-10T00:01:00Z',
            lastErrorMessage: 'permission denied'
        }
    });
    assert.equal(degraded.status, 'degraded');
    assert.match(degraded.reason, /permission denied/);

    const healthy = evaluateSinkHealth('disk-log', {
        delivery: {
            writtenEntries: 3,
            failedEntries: 1,
            lastWriteAt: '2025-10-10T00:02:00Z',
            lastFailureAt: '2025-10-10T00:01:00Z'
        }
    });
    assert.equal(healthy.status, 'healthy');
    assert.match(healthy.reason, /written/);
});

test('evaluateSinkHealth classifies webhook sink metrics', () => {
    const pending = evaluateSinkHealth('webhook', {
        queue: { pendingEntries: 0, flushInFlight: false },
        delivery: { deliveredBatches: 0, failedBatches: 0 }
    });
    assert.equal(pending.status, 'pending');

    const failing = evaluateSinkHealth('webhook', {
        queue: { pendingEntries: 0, flushInFlight: false },
        delivery: {
            deliveredBatches: 0,
            failedBatches: 2,
            lastErrorMessage: '500 from downstream'
        }
    });
    assert.equal(failing.status, 'failing');
    assert.match(failing.reason, /downstream/);

    const queued = evaluateSinkHealth('webhook', {
        queue: { pendingEntries: 3, flushInFlight: false },
        delivery: { deliveredBatches: 1, failedBatches: 0 }
    });
    assert.equal(queued.status, 'degraded');
    assert.match(queued.reason, /3 queued/);

    const degraded = evaluateSinkHealth('webhook', {
        queue: { pendingEntries: 0, flushInFlight: false },
        delivery: {
            deliveredBatches: 2,
            failedBatches: 1,
            lastSuccessAt: '2025-10-10T00:00:00Z',
            lastFailureAt: '2025-10-10T00:01:00Z',
            lastErrorMessage: 'timeout'
        }
    });
    assert.equal(degraded.status, 'degraded');
    assert.match(degraded.reason, /timeout/);

    const healthy = evaluateSinkHealth('webhook', {
        queue: { pendingEntries: 0, flushInFlight: true },
        delivery: {
            deliveredBatches: 3,
            failedBatches: 1,
            lastSuccessAt: '2025-10-10T00:02:00Z',
            lastFailureAt: '2025-10-10T00:01:00Z'
        }
    });
    assert.equal(healthy.status, 'healthy');
    assert.match(healthy.reason, /succeeding/);
});

test('evaluateSinkHealth falls back to unknown for unclassified sinks', () => {
    const result = evaluateSinkHealth('custom', { pending: 1 });
    assert.equal(result.status, 'unknown');
    assert.match(result.reason, /not defined/i);
});
