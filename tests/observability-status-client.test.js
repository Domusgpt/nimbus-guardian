'use strict';

const { test, mock } = require('node:test');
const assert = require('node:assert/strict');

const ObservabilityStatusClient = require('../lib/observability-status-client');

test('ObservabilityStatusClient fetches and returns JSON snapshot', async () => {
    const fetchCalls = [];
    const mockFetch = mock.fn(async (url, options) => {
        fetchCalls.push({ url, options });
        return {
            ok: true,
            status: 200,
            json: async () => ({ ok: true, sinks: [] })
        };
    });

    const client = new ObservabilityStatusClient({
        url: 'http://localhost:3333/api/observability',
        fetchImpl: mockFetch
    });

    const result = await client.fetchStatus({ cookie: 'abc123' });

    assert.deepEqual(result, { ok: true, sinks: [] });
    assert.equal(fetchCalls.length, 1);
    assert.equal(fetchCalls[0].url, 'http://localhost:3333/api/observability');
    assert.equal(fetchCalls[0].options.headers.Cookie, 'guardian_session=abc123');
    assert.equal(fetchCalls[0].options.headers.Accept, 'application/json');
});

test('ObservabilityStatusClient normalizes existing cookie headers', async () => {
    const mockFetch = mock.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({})
    }));

    const client = new ObservabilityStatusClient({
        url: 'http://localhost:3333/api/observability',
        headers: { cookie: 'guardian_session=from-base' },
        fetchImpl: mockFetch
    });

    await client.fetchStatus({ headers: { Cookie: 'custom=value' } });

    const call = mockFetch.mock.calls[0];
    assert.equal(call.arguments[1].headers.Cookie, 'custom=value');
    assert.ok(!('cookie' in call.arguments[1].headers));
});

test('ObservabilityStatusClient surfaces HTTP errors', async () => {
    const client = new ObservabilityStatusClient({
        url: 'http://localhost:3333/api/observability',
        fetchImpl: async () => ({
            ok: false,
            status: 403,
            statusText: 'Forbidden',
            text: async () => 'nope'
        })
    });

    await assert.rejects(
        client.fetchStatus(),
        /403/,
        'Expected HTTP error to reject'
    );
});

test('ObservabilityStatusClient rejects invalid JSON responses', async () => {
    const client = new ObservabilityStatusClient({
        url: 'http://localhost:3333/api/observability',
        fetchImpl: async () => ({
            ok: true,
            status: 200,
            json: async () => { throw new Error('boom'); }
        })
    });

    await assert.rejects(
        client.fetchStatus(),
        /not valid JSON/
    );
});
