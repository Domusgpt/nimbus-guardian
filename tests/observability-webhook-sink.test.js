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
