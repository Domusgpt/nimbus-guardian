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

test('ObservabilityStatusClient fetches history with derived URL and limit', async () => {
    const calls = [];
    const client = new ObservabilityStatusClient({
        url: 'http://localhost:3333/api/observability',
        fetchImpl: async (url, options) => {
            calls.push({ url, options });
            return {
                ok: true,
                status: 200,
                json: async () => ({
                    history: [{ emittedAt: '2025-01-01T00:00:00.000Z' }],
                    overview: { totalSnapshots: 1 }
                })
            };
        }
    });

    const result = await client.fetchHistory({ cookie: 'abc', limit: 5 });

    assert.equal(calls.length, 1);
    assert.ok(calls[0].url.includes('/api/observability/history'));
    assert.ok(calls[0].url.includes('limit=5'));
    assert.equal(calls[0].options.headers.Cookie, 'guardian_session=abc');
    assert.equal(result.history.length, 1);
    assert.equal(result.history[0].emittedAt, '2025-01-01T00:00:00.000Z');
    assert.equal(result.overview.totalSnapshots, 1);
});

test('ObservabilityStatusClient rejects invalid history responses', async () => {
    const client = new ObservabilityStatusClient({
        url: 'http://localhost:3333/api/observability',
        fetchImpl: async () => ({
            ok: true,
            status: 200,
            json: async () => ({ foo: 'bar' })
        })
    });

    await assert.rejects(
        client.fetchHistory(),
        /did not contain an array/
    );
});

test('ObservabilityStatusClient normalizes legacy array history responses', async () => {
    const client = new ObservabilityStatusClient({
        url: 'http://localhost:3333/api/observability',
        fetchImpl: async () => ({
            ok: true,
            status: 200,
            json: async () => ([{ emittedAt: '2025-01-01T01:00:00.000Z' }])
        })
    });

    const result = await client.fetchHistory();
    assert.ok(Array.isArray(result.history));
    assert.equal(result.history.length, 1);
    assert.equal(result.history[0].emittedAt, '2025-01-01T01:00:00.000Z');
    assert.equal(result.overview, null);
});

test('ObservabilityStatusClient fetches incidents with filters and headers', async () => {
    const calls = [];
    const client = new ObservabilityStatusClient({
        url: 'http://localhost:3333/api/observability',
        incidentsUrl: 'http://localhost:3333/api/observability/incidents',
        fetchImpl: async (url, options) => {
            calls.push({ url, options });
            return {
                ok: true,
                status: 200,
                json: async () => ({
                    generatedAt: '2025-01-01T00:30:00.000Z',
                    matched: { total: 1 },
                    records: []
                })
            };
        }
    });

    const result = await client.fetchIncidents({
        cookie: 'abc123',
        statuses: ['failing', 'degraded'],
        sinks: ['webhook'],
        open: true,
        limit: 2
    });

    assert.equal(calls.length, 1);
    const { url, options } = calls[0];
    assert.ok(url.includes('limit=2'));
    assert.ok(url.includes('status=failing'));
    assert.ok(url.includes('status=degraded'));
    assert.ok(url.includes('sink=webhook'));
    assert.ok(url.includes('open=true'));
    assert.equal(options.headers.Cookie, 'guardian_session=abc123');
    assert.equal(options.headers.Accept, 'application/json');
    assert.deepEqual(result.matched, { total: 1 });
    assert.ok(Array.isArray(result.records));
});

test('ObservabilityStatusClient surfaces incidents JSON parsing errors', async () => {
    const client = new ObservabilityStatusClient({
        url: 'http://localhost:3333/api/observability',
        incidentsUrl: 'http://localhost:3333/api/observability/incidents',
        fetchImpl: async () => ({
            ok: true,
            status: 200,
            json: async () => { throw new Error('boom'); }
        })
    });

    await assert.rejects(
        client.fetchIncidents(),
        /not valid JSON/
    );
});
