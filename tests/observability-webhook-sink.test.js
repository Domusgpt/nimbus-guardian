'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const ObservabilityWebhookSink = require('../lib/observability-webhook-sink');

test('observability webhook sink posts JSON payloads with timestamps and headers', async () => {
    let captured = null;
    const sink = new ObservabilityWebhookSink({
        url: 'https://example.test/hooks/ingest?token=abc',
        now: () => new Date('2025-10-10T12:00:00Z'),
        request: async (options) => {
            captured = options;
            return { statusCode: 204 };
        },
        headers: {
            Authorization: 'Bearer token-value',
            'X-Custom': 'value'
        }
    });

    await sink.deliver({ type: 'fingerprints', emittedAt: '2025-10-10T11:59:59Z' });

    assert.ok(captured);
    assert.equal(captured.method, 'POST');
    assert.equal(captured.url.toString(), 'https://example.test/hooks/ingest?token=abc');
    assert.equal(captured.headers['content-type'], 'application/json');
    assert.equal(captured.headers['authorization'], 'Bearer token-value');
    assert.equal(captured.headers['x-custom'], 'value');

    const body = JSON.parse(captured.body);
    assert.equal(body.type, 'fingerprints');
    assert.equal(body.emittedAt, '2025-10-10T11:59:59Z');
    assert.equal(body.sentAt, '2025-10-10T12:00:00.000Z');
});

test('observability webhook sink retries retryable responses', async () => {
    const calls = [];
    const responses = [
        { statusCode: 503 },
        { statusCode: 504 },
        { statusCode: 200 }
    ];

    const sink = new ObservabilityWebhookSink({
        url: 'https://example.test/webhook',
        request: async (options) => {
            calls.push(options);
            return responses.shift();
        },
        backoffMs: 0,
        maxRetries: 5
    });

    await sink.deliver({});

    assert.equal(calls.length, 3);
    assert.equal(responses.length, 0);
});

test('observability webhook sink surfaces persistent delivery failures', async () => {
    const warnings = [];
    const sink = new ObservabilityWebhookSink({
        url: 'https://example.test/fail',
        request: async () => {
            throw new Error('network-unreachable');
        },
        maxRetries: 1,
        backoffMs: 0,
        logger: {
            warn: (...args) => {
                warnings.push(args);
            }
        }
    });

    await assert.rejects(() => sink.deliver({}));
    assert.ok(warnings.length >= 1);
});

test('observability webhook sink batches payloads when limits are provided', async () => {
    const requests = [];
    const sink = new ObservabilityWebhookSink({
        url: 'https://example.test/batch',
        request: async (options) => {
            requests.push(options);
            return { statusCode: 202 };
        },
        batchMaxItems: 3,
        batchMaxWaitMs: 1000
    });

    const payloads = [
        { type: 'fingerprints', fingerprints: { totalTracked: 1 } },
        { type: 'fingerprints', fingerprints: { totalTracked: 2 } },
        { type: 'fingerprints', fingerprints: { totalTracked: 3 } }
    ];

    await Promise.all(payloads.map((payload) => sink.deliver(payload)));

    assert.equal(requests.length, 1);
    const delivered = JSON.parse(requests[0].body);
    assert.equal(delivered.type, 'fingerprints-batch');
    assert.equal(delivered.count, 3);
    assert.equal(delivered.entries.length, 3);
    for (const entry of delivered.entries) {
        assert.equal(entry.type, 'fingerprints');
        assert.ok(entry.sentAt);
    }
});

test('observability webhook sink flushes queued payloads on demand', async () => {
    const requests = [];
    const sink = new ObservabilityWebhookSink({
        url: 'https://example.test/flush',
        request: async (options) => {
            requests.push(options);
            return { statusCode: 204 };
        },
        batchMaxItems: 5,
        batchMaxWaitMs: 60000
    });

    const promise = sink.deliver({ type: 'fingerprints', fingerprints: { totalTracked: 10 } });
    assert.equal(requests.length, 0);

    await sink.flush();
    await promise;

    assert.equal(requests.length, 1);
    const delivered = JSON.parse(requests[0].body);
    assert.equal(delivered.type, 'fingerprints');
    assert.equal(delivered.fingerprints.totalTracked, 10);
});

test('observability webhook sink flushes automatically after wait interval', async () => {
    const requests = [];
    const sink = new ObservabilityWebhookSink({
        url: 'https://example.test/wait',
        request: async (options) => {
            requests.push({ ...options, receivedAt: Date.now() });
            return { statusCode: 200 };
        },
        now: () => new Date('2025-10-10T12:00:00Z'),
        batchMaxItems: 10,
        batchMaxWaitMs: 20
    });

    const start = Date.now();
    const pending = sink.deliver({ type: 'fingerprints', fingerprints: { totalTracked: 5 } });
    assert.equal(requests.length, 0);

    for (let attempt = 0; attempt < 10 && requests.length === 0; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 10));
    }

    await pending;

    assert.equal(requests.length, 1);
    assert.ok(requests[0].receivedAt - start >= 0);
    const delivered = JSON.parse(requests[0].body);
    assert.equal(delivered.type, 'fingerprints');
    assert.equal(delivered.sentAt, '2025-10-10T12:00:00.000Z');
});
