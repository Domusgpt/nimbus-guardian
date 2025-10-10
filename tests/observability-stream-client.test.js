'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { PassThrough } = require('node:stream');

const ObservabilityStreamClient = require('../lib/observability-stream-client');

function createResponseStream() {
    const stream = new PassThrough();
    stream.setEncoding('utf8');
    return stream;
}

test('ObservabilityStreamClient normalizes cookies and delivers fingerprint payloads', async () => {
    const stream = createResponseStream();
    let receivedHeaders = null;

    const fetchStub = async (_url, options) => {
        receivedHeaders = options.headers;
        queueMicrotask(() => {
            stream.write(': connected 2025-01-01T00:00:00.000Z\n\n');
            stream.write('data: {"type":"fingerprints","fingerprints":{"totalTracked":2}}\n\n');
            stream.end();
        });
        return { ok: true, status: 200, body: stream };
    };

    const events = [];
    const client = new ObservabilityStreamClient({
        fetchImpl: fetchStub,
        logger: { warn: () => {} }
    });

    await client.start({
        cookie: 'abc123',
        onHeartbeat: () => {},
        onData: (payload) => events.push(payload)
    });

    assert.equal(receivedHeaders.Cookie, 'guardian_session=abc123');
    assert.equal(events.length, 1);
    assert.equal(events[0].type, 'fingerprints');
    assert.equal(events[0].fingerprints.totalTracked, 2);
});

test('ObservabilityStreamClient gracefully stops on abort', async () => {
    const stream = createResponseStream();
    const fetchStub = async () => {
        return { ok: true, status: 200, body: stream };
    };

    const client = new ObservabilityStreamClient({ fetchImpl: fetchStub });

    const startPromise = client.start({
        onData: () => {}
    });

    await new Promise((resolve) => setImmediate(resolve));

    client.stop();
    stream.emit('close');

    await startPromise;
});

test('ObservabilityStreamClient ignores malformed payloads and continues streaming', async () => {
    const stream = createResponseStream();
    const warnings = [];

    const fetchStub = async () => {
        queueMicrotask(() => {
            stream.write('data: not-json\n\n');
            stream.write('data: {"type":"fingerprints","fingerprints":{"totalTracked":5}}\n\n');
            stream.end();
        });
        return { ok: true, status: 200, body: stream };
    };

    const events = [];
    const client = new ObservabilityStreamClient({
        fetchImpl: fetchStub,
        logger: { warn: (message) => warnings.push(message) }
    });

    await client.start({
        onData: (payload) => events.push(payload)
    });

    assert.equal(events.length, 1);
    assert.equal(events[0].fingerprints.totalTracked, 5);
    assert.equal(warnings.length, 1);
});
