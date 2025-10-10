'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs/promises');

const DashboardServer = require('../dashboard-server');

async function createTestServer(t) {
    const fingerprintState = {
        total: 0,
        lastFingerprint: null,
        lastSeen: null,
        touches: 0
    };

    const fingerprintStore = {
        ensureLoaded: async () => {},
        getSummary: () => ({
            ttlMs: 1000,
            totalTracked: fingerprintState.total,
            recentFingerprints: fingerprintState.lastFingerprint
                ? [{
                    fingerprintHash: fingerprintState.lastFingerprint,
                    sessionCount: fingerprintState.total,
                    firstSeen: fingerprintState.lastSeen,
                    lastSeen: fingerprintState.lastSeen
                }]
                : [],
            lastUpdatedAt: fingerprintState.lastSeen
        }),
        recordSessionCreated: async (fingerprint) => {
            fingerprintState.total += 1;
            fingerprintState.lastFingerprint = `stub-${fingerprint}`;
            fingerprintState.lastSeen = new Date(0).toISOString();
        },
        recordSessionTouched: async () => {
            fingerprintState.touches += 1;
            fingerprintState.lastSeen = new Date(fingerprintState.touches * 1000).toISOString();
        },
        recordSessionEnded: async () => {
            fingerprintState.touches += 1;
            fingerprintState.lastSeen = new Date(fingerprintState.touches * 2000).toISOString();
        },
        recordSessionMetadata: async () => {}
    };

    const serverInstance = new DashboardServer(0, { fingerprintStore });
    await serverInstance.loadConfig();

    // Stub expensive helpers to keep the test lightweight and deterministic.
    serverInstance.getProjectStatus = async () => ({
        projectName: 'Test Project',
        configWarnings: [],
        timestamp: new Date().toISOString(),
        observability: serverInstance.getObservabilitySnapshot()
    });
    serverInstance.installTool = async (toolId) => ({
        success: true,
        message: `Installed ${toolId}`
    });

    serverInstance.createToolDetector = () => ({
        analyze: async () => ({
            detected: [{ id: 'existing-tool', name: 'Existing Tool' }],
            missing: [
                { id: 'firebase-tools', name: 'Firebase CLI' },
                { id: 'custom', name: 'Custom Tool', cli: 'Netlify CLI', command: 'npx netlify-cli@latest --help' },
                { id: 'explicit', name: 'Explicit Tool', safeInstallerId: 'vercel' }
            ]
        })
    });

    const fakeEngine = {
        analyze: async () => ({ summary: 'Scan complete', issues: [] }),
        autoFix: async (issueId) => ({ success: true, issueId })
    };
    serverInstance.createGuardianEngine = () => fakeEngine;

    const fakeAssistant = {
        ask: async (message) => ({ reply: `Echo: ${message}` })
    };
    serverInstance.createAIAssistant = () => fakeAssistant;

    // Tighten the rate limiter window so we can exercise throttling logic quickly.
    const shortWindow = 2000;
    serverInstance.rateLimitProfiles.install.limiter = serverInstance.createRateLimiter('install', {
        windowMs: shortWindow,
        max: 2
    });
    serverInstance.rateLimitProfiles.action.limiter = serverInstance.createRateLimiter('action', {
        windowMs: shortWindow,
        max: 2
    });
    serverInstance.rateLimitProfiles.scan.limiter = serverInstance.createRateLimiter('scan', {
        windowMs: shortWindow,
        max: 1
    });
    serverInstance.rateLimitProfiles.chat.limiter = serverInstance.createRateLimiter('chat', {
        windowMs: shortWindow,
        max: 2
    });

    const server = http.createServer((req, res) => serverInstance.handleRequest(req, res));
    server.keepAliveTimeout = 1;
    server.headersTimeout = 5000;
    server.requestTimeout = 5000;
    await new Promise((resolve) => server.listen(0, resolve));
    server.unref();

    let closed = false;
    const stop = () => {
        if (closed) {
            return Promise.resolve();
        }
        closed = true;
        if (typeof server.closeIdleConnections === 'function') {
            server.closeIdleConnections();
        }
        if (typeof server.closeAllConnections === 'function') {
            server.closeAllConnections();
        }
        return new Promise((resolve) => server.close(resolve));
    };

    t.after(stop);

    const { port } = server.address();
    const baseUrl = `http://127.0.0.1:${port}`;
    const origin = `http://localhost:${port}`;
    serverInstance.allowedOrigins.add(origin);

    return { serverInstance, baseUrl, origin, stop };
}

function parseSessionCookie(headers) {
    const raw = headers.get('set-cookie');
    if (!raw) {
        return null;
    }
    const [cookie] = raw.split(';');
    return cookie;
}

function extractCsrfFromHtml(html) {
    if (!html) {
        return null;
    }
    const scriptMatch = html.match(/window.__CSRF_TOKEN__ = '([^']+)'/);
    if (scriptMatch) {
        return scriptMatch[1];
    }

    const metaMatch = html.match(/<meta[^>]+name="csrf-token"[^>]+content="([^"]+)"/i);
    if (metaMatch) {
        return metaMatch[1];
    }

    return null;
}

const baseHeaders = Object.freeze({
    'User-Agent': 'nimbus-test-agent',
    'Accept-Language': 'en-US',
    Connection: 'close'
});

async function bootstrapSession(baseUrl, origin) {
    const dashboardResponse = await fetch(`${baseUrl}/`, {
        headers: baseHeaders
    });

    assert.equal(dashboardResponse.status, 200);
    const sessionCookie = parseSessionCookie(dashboardResponse.headers);
    assert.ok(sessionCookie?.startsWith('guardian_session='));

    const html = await dashboardResponse.text();
    let csrfToken = extractCsrfFromHtml(html);
    assert.ok(csrfToken);

    const statusResponse = await fetch(`${baseUrl}/api/status`, {
        headers: {
            ...baseHeaders,
            Cookie: sessionCookie,
            Origin: origin
        }
    });

    assert.equal(statusResponse.status, 200);
    const refreshedToken = statusResponse.headers.get('x-csrf-token');
    if (refreshedToken) {
        csrfToken = refreshedToken;
    }

    const statusBody = await statusResponse.json();
    assert.ok(statusBody.observability);
    assert.ok(statusBody.observability.sessions);
    assert.ok(statusBody.observability.fingerprints);
    assert.equal(typeof statusBody.observability.fingerprints.totalTracked, 'number');
    return { sessionCookie, csrfToken, statusBody };
}

test('dashboard API rejects unauthenticated requests', async (t) => {
    const { baseUrl, origin, stop } = await createTestServer(t);

    const res = await fetch(`${baseUrl}/api/status`, {
        headers: {
            ...baseHeaders,
            Origin: origin
        }
    });

    assert.equal(res.status, 401);
    const payload = await res.json();
    assert.match(payload.error, /session/i);
    await stop();
});

test('dashboard enforces session, CSRF, and rate limiting', async (t) => {
    const { baseUrl, origin, serverInstance, stop } = await createTestServer(t);

    const { sessionCookie, csrfToken: initialToken, statusBody } = await bootstrapSession(baseUrl, origin);
    let csrfToken = initialToken;
    assert.equal(statusBody.projectName, 'Test Project');

    // Attempt a POST without the CSRF header – should be rejected.
    const rejectedResponse = await fetch(`${baseUrl}/api/install-tool`, {
        method: 'POST',
        headers: {
            ...baseHeaders,
            'Content-Type': 'application/json',
            Cookie: sessionCookie,
            Origin: origin
        },
        body: JSON.stringify({ toolId: 'firebase-tools' })
    });

    assert.equal(rejectedResponse.status, 403);
    const rejectedBody = await rejectedResponse.json();
    assert.match(rejectedBody.error, /CSRF/i);

    // Valid POST with CSRF header should succeed.
    const successResponse = await fetch(`${baseUrl}/api/install-tool`, {
        method: 'POST',
        headers: {
            ...baseHeaders,
            'Content-Type': 'application/json',
            Cookie: sessionCookie,
            Origin: origin,
            'X-CSRF-Token': csrfToken
        },
        body: JSON.stringify({ toolId: 'firebase-tools' })
    });

    assert.equal(successResponse.status, 200);
    const rateLimitLimit = Number.parseInt(successResponse.headers.get('x-ratelimit-limit'), 10);
    assert.equal(rateLimitLimit, serverInstance.rateLimitProfiles.install.limiter.max);

    const successBody = await successResponse.json();
    assert.deepEqual(successBody, { success: true, message: 'Installed firebase-tools' });

    const maybeRotatedToken = successResponse.headers.get('x-csrf-token');
    if (maybeRotatedToken) {
        csrfToken = maybeRotatedToken;
    }

    // Second valid POST stays under the rate limit.
    const secondResponse = await fetch(`${baseUrl}/api/install-tool`, {
        method: 'POST',
        headers: {
            ...baseHeaders,
            'Content-Type': 'application/json',
            Cookie: sessionCookie,
            Origin: origin,
            'X-CSRF-Token': csrfToken
        },
        body: JSON.stringify({ toolId: 'firebase-tools' })
    });

    assert.equal(secondResponse.status, 200);

    const rotatedAgain = secondResponse.headers.get('x-csrf-token');
    if (rotatedAgain) {
        csrfToken = rotatedAgain;
    }

    // Third request exceeds the tightened test limit.
    const limitedResponse = await fetch(`${baseUrl}/api/install-tool`, {
        method: 'POST',
        headers: {
            ...baseHeaders,
            'Content-Type': 'application/json',
            Cookie: sessionCookie,
            Origin: origin,
            'X-CSRF-Token': csrfToken
        },
        body: JSON.stringify({ toolId: 'firebase-tools' })
    });

    assert.equal(limitedResponse.status, 429);
    const retryAfter = Number.parseInt(limitedResponse.headers.get('retry-after') || '0', 10);
    assert.ok(Number.isFinite(retryAfter) && retryAfter >= 1);
    const limitedBody = await limitedResponse.json();
    assert.match(limitedBody.error, /tool installation attempts are limited/i);

    await stop();
});

test('dashboard scan endpoint requires CSRF and returns results', async (t) => {
    const { baseUrl, origin, serverInstance, stop } = await createTestServer(t);

    const { sessionCookie, csrfToken: initialToken } = await bootstrapSession(baseUrl, origin);
    let csrfToken = initialToken;

    const missingHeader = await fetch(`${baseUrl}/api/scan`, {
        method: 'POST',
        headers: {
            ...baseHeaders,
            Cookie: sessionCookie,
            Origin: origin
        }
    });

    assert.equal(missingHeader.status, 403);
    const missingBody = await missingHeader.json();
    assert.match(missingBody.error, /CSRF/i);

    const allowed = await fetch(`${baseUrl}/api/scan`, {
        method: 'POST',
        headers: {
            ...baseHeaders,
            'Content-Type': 'application/json',
            Cookie: sessionCookie,
            Origin: origin,
            'X-CSRF-Token': csrfToken
        }
    });

    assert.equal(allowed.status, 200);
    const limit = Number.parseInt(allowed.headers.get('x-ratelimit-limit'), 10);
    assert.equal(limit, serverInstance.rateLimitProfiles.scan.limiter.max);

    const payload = await allowed.json();
    assert.deepEqual(payload, { summary: 'Scan complete', issues: [] });

    const rotated = allowed.headers.get('x-csrf-token');
    if (rotated) {
        csrfToken = rotated;
    }

    const throttled = await fetch(`${baseUrl}/api/scan`, {
        method: 'POST',
        headers: {
            ...baseHeaders,
            'Content-Type': 'application/json',
            Cookie: sessionCookie,
            Origin: origin,
            'X-CSRF-Token': csrfToken
        }
    });

    assert.equal(throttled.status, 429);
    const throttleBody = await throttled.json();
    assert.match(throttleBody.error, /scans are throttled/i);

    await stop();
});

test('dashboard chat endpoint uses CSRF and assistant stub', async (t) => {
    const { baseUrl, origin, serverInstance, stop } = await createTestServer(t);

    const { sessionCookie, csrfToken } = await bootstrapSession(baseUrl, origin);

    const rejected = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
            ...baseHeaders,
            'Content-Type': 'application/json',
            Cookie: sessionCookie,
            Origin: origin
        },
        body: JSON.stringify({ message: 'Hello' })
    });

    assert.equal(rejected.status, 403);
    const rejectedBody = await rejected.json();
    assert.match(rejectedBody.error, /CSRF/i);

    const accepted = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
            ...baseHeaders,
            'Content-Type': 'application/json',
            Cookie: sessionCookie,
            Origin: origin,
            'X-CSRF-Token': csrfToken
        },
        body: JSON.stringify({ message: 'Hello' })
    });

    assert.equal(accepted.status, 200);
    const limit = Number.parseInt(accepted.headers.get('x-ratelimit-limit'), 10);
    assert.equal(limit, serverInstance.rateLimitProfiles.chat.limiter.max);

    const body = await accepted.json();
    assert.deepEqual(body, { reply: 'Echo: Hello' });

    await stop();
});

test('dashboard tools endpoint returns sanitized installers', async (t) => {
    const { baseUrl, origin, stop } = await createTestServer(t);

    const { sessionCookie } = await bootstrapSession(baseUrl, origin);

    const res = await fetch(`${baseUrl}/api/tools`, {
        headers: {
            ...baseHeaders,
            Cookie: sessionCookie,
            Origin: origin
        }
    });

    assert.equal(res.status, 200);
    const payload = await res.json();

    assert.deepEqual(payload.detected, [{ id: 'existing-tool', name: 'Existing Tool' }]);
    assert.equal(payload.missing.length, 3);

    const [firebaseCli, customTool, explicitTool] = payload.missing;
    assert.equal(firebaseCli.safeInstallerId, 'firebase-tools');
    assert.equal(firebaseCli.installerLabel, 'Firebase CLI');
    assert.match(firebaseCli.installerDescription, /Firebase CLI/i);

    assert.equal(customTool.safeInstallerId, 'netlify-cli');
    assert.equal(customTool.installerLabel, 'Netlify CLI');
    assert.match(customTool.installerDescription, /Netlify CLI/i);

    assert.equal(explicitTool.safeInstallerId, 'vercel');
    assert.equal(explicitTool.installerLabel, 'Vercel CLI');

    await stop();
});

test('dashboard fix endpoint enforces CSRF, validation, and rate limits', async (t) => {
    const { baseUrl, origin, serverInstance, stop } = await createTestServer(t);

    const { sessionCookie, csrfToken: initialToken } = await bootstrapSession(baseUrl, origin);
    let csrfToken = initialToken;

    const missingHeader = await fetch(`${baseUrl}/api/fix`, {
        method: 'POST',
        headers: {
            ...baseHeaders,
            'Content-Type': 'application/json',
            Cookie: sessionCookie,
            Origin: origin
        },
        body: JSON.stringify({ issueId: 'ISSUE-1' })
    });

    assert.equal(missingHeader.status, 403);
    const missingBody = await missingHeader.json();
    assert.match(missingBody.error, /CSRF/i);

    const invalidBody = await fetch(`${baseUrl}/api/fix`, {
        method: 'POST',
        headers: {
            ...baseHeaders,
            'Content-Type': 'application/json',
            Cookie: sessionCookie,
            Origin: origin,
            'X-CSRF-Token': csrfToken
        },
        body: JSON.stringify({})
    });

    assert.equal(invalidBody.status, 400);
    const invalidPayload = await invalidBody.json();
    assert.match(invalidPayload.error, /issueId is required/i);
    csrfToken = invalidBody.headers.get('x-csrf-token') || csrfToken;

    const successResponse = await fetch(`${baseUrl}/api/fix`, {
        method: 'POST',
        headers: {
            ...baseHeaders,
            'Content-Type': 'application/json',
            Cookie: sessionCookie,
            Origin: origin,
            'X-CSRF-Token': csrfToken
        },
        body: JSON.stringify({ issueId: 'ISSUE-1' })
    });

    assert.equal(successResponse.status, 200);
    const limit = Number.parseInt(successResponse.headers.get('x-ratelimit-limit'), 10);
    assert.equal(limit, serverInstance.rateLimitProfiles.action.limiter.max);

    const successPayload = await successResponse.json();
    assert.deepEqual(successPayload, { success: true, issueId: 'ISSUE-1' });

    csrfToken = successResponse.headers.get('x-csrf-token') || csrfToken;

    const throttled = await fetch(`${baseUrl}/api/fix`, {
        method: 'POST',
        headers: {
            ...baseHeaders,
            'Content-Type': 'application/json',
            Cookie: sessionCookie,
            Origin: origin,
            'X-CSRF-Token': csrfToken
        },
        body: JSON.stringify({ issueId: 'ISSUE-2' })
    });

    assert.equal(throttled.status, 429);
    const throttleAfter = Number.parseInt(throttled.headers.get('retry-after') || '0', 10);
    assert.ok(Number.isFinite(throttleAfter) && throttleAfter >= 1);
    const throttledBody = await throttled.json();
    assert.match(throttledBody.error, /dashboard actions/i);

    await stop();
});

test('dashboard observability endpoint reports session and rate metrics', async (t) => {
    const { baseUrl, origin, stop } = await createTestServer(t);

    const { sessionCookie, csrfToken: initialToken } = await bootstrapSession(baseUrl, origin);
    let csrfToken = initialToken;

    const installHeaders = {
        ...baseHeaders,
        'Content-Type': 'application/json',
        Cookie: sessionCookie,
        Origin: origin
    };

    for (let i = 0; i < 2; i += 1) {
        const response = await fetch(`${baseUrl}/api/install-tool`, {
            method: 'POST',
            headers: {
                ...installHeaders,
                'X-CSRF-Token': csrfToken
            },
            body: JSON.stringify({ toolId: 'firebase-tools' })
        });

        assert.equal(response.status, 200);
        csrfToken = response.headers.get('x-csrf-token') || csrfToken;
        await response.json();
    }

    const throttled = await fetch(`${baseUrl}/api/install-tool`, {
        method: 'POST',
        headers: {
            ...installHeaders,
            'X-CSRF-Token': csrfToken
        },
        body: JSON.stringify({ toolId: 'firebase-tools' })
    });

    assert.equal(throttled.status, 429);
    await throttled.json();

    const observabilityResponse = await fetch(`${baseUrl}/api/observability`, {
        headers: {
            ...baseHeaders,
            Cookie: sessionCookie,
            Origin: origin
        }
    });

    assert.equal(observabilityResponse.status, 200);
    const metrics = await observabilityResponse.json();

    assert.ok(metrics.sessions.active >= 0);
    assert.ok(metrics.sessions.created >= 1);
    assert.ok(metrics.rateLimits.install.blocked >= 1);
    assert.equal(typeof metrics.rateLimits.install.lastKeyHash, 'string');

    await stop();
});

test('dashboard observability stream emits fingerprint updates', async (t) => {
    const { baseUrl, origin, stop } = await createTestServer(t);

    const { sessionCookie } = await bootstrapSession(baseUrl, origin);

    const events = [];
    const streamUrl = new URL('/api/observability/stream', baseUrl);

    const streamPromise = new Promise((resolve, reject) => {
        const request = http.request({
            protocol: streamUrl.protocol,
            hostname: streamUrl.hostname,
            port: streamUrl.port,
            path: streamUrl.pathname,
            method: 'GET',
            headers: {
                ...baseHeaders,
                Cookie: sessionCookie,
                Origin: origin,
                Accept: 'text/event-stream'
            }
        }, (res) => {
            try {
                assert.equal(res.statusCode, 200);
            } catch (error) {
                reject(error);
                request.destroy();
                return;
            }

            res.setEncoding('utf8');
            let buffer = '';
            res.on('data', (chunk) => {
                buffer += chunk;
                const frames = buffer.split('\n\n');
                buffer = frames.pop();
                for (const frame of frames) {
                    const lines = frame.split('\n').filter((line) => line.startsWith('data: '));
                    for (const line of lines) {
                        try {
                            events.push(JSON.parse(line.slice(6).trim()));
                        } catch {
                            continue;
                        }
                        if (events.length >= 2) {
                            resolve();
                            request.destroy();
                            return;
                        }
                    }
                }
            });

            res.on('end', () => {
                reject(new Error('stream ended before update'));
            });
        });

        request.on('error', reject);
        request.end();
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    const statusResponse = await fetch(`${baseUrl}/api/status`, {
        headers: {
            ...baseHeaders,
            Cookie: sessionCookie,
            Origin: origin
        }
    });
    assert.equal(statusResponse.status, 200);
    await statusResponse.json();

    await streamPromise;

    assert.ok(events.length >= 2);
    assert.equal(events[0].type, 'fingerprints');
    assert.ok(Number.isFinite(events[0].fingerprints.totalTracked));
    const latest = events[events.length - 1];
    assert.equal(latest.type, 'fingerprints');
    assert.ok(Array.isArray(latest.fingerprints.recentFingerprints));

    await stop();
});

test('dashboard observability history endpoint returns bounded snapshots', async (t) => {
    const { baseUrl, origin, serverInstance, stop } = await createTestServer(t);

    serverInstance.observabilityExporter.debounceMs = 0;

    const { sessionCookie } = await bootstrapSession(baseUrl, origin);

    const session = {
        id: 'history-session',
        createdAt: new Date(0).toISOString(),
        lastSeen: new Date(0).toISOString(),
        metadata: { fingerprint: 'history-fingerprint' }
    };

    serverInstance.recordFingerprintMetric('created', session);
    serverInstance.recordFingerprintMetric('touched', session);
    serverInstance.recordFingerprintMetric('ended', session);

    await new Promise((resolve) => setTimeout(resolve, 10));

    const response = await fetch(`${baseUrl}/api/observability/history?limit=2`, {
        headers: {
            ...baseHeaders,
            Cookie: sessionCookie,
            Origin: origin
        }
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.ok(Array.isArray(body.history));
    assert.ok(body.history.length > 0);
    assert.ok(body.history.length <= 2);

    const latest = body.history[body.history.length - 1];
    assert.equal(latest.type, 'fingerprints');
    assert.equal(typeof latest.emittedAt, 'string');
    assert.ok(
        typeof latest.fingerprints.totalTracked === 'number'
        && latest.fingerprints.totalTracked >= 1
    );

    await stop();
});

test('dashboard writes observability snapshots to disk when enabled', async (t) => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'guardian-obs-log-'));
    const logPath = path.join(tmpDir, 'observability.log');
    process.env.GUARDIAN_OBSERVABILITY_LOG_PATH = logPath;

    const { serverInstance, stop } = await createTestServer(t);

    try {
        serverInstance.observabilityExporter.debounceMs = 0;

        const session = {
            id: 'session-log-1',
            createdAt: new Date().toISOString(),
            lastSeen: new Date().toISOString(),
            metadata: { fingerprint: 'log-fp' }
        };

        await serverInstance.recordFingerprintMetric('created', session);

        await new Promise((resolve) => setTimeout(resolve, 50));

        let latest = null;
        for (let attempt = 0; attempt < 12; attempt += 1) {
            try {
                const contents = await fs.readFile(logPath, 'utf8');
                const lines = contents.trim().split('\n').filter(Boolean);
                if (lines.length > 0) {
                    const parsed = JSON.parse(lines[lines.length - 1]);
                    if (parsed?.fingerprints?.totalTracked >= 1) {
                        latest = parsed;
                        break;
                    }
                }
            } catch (error) {
                if (!error || error.code !== 'ENOENT') {
                    throw error;
                }
            }
            await new Promise((resolve) => setTimeout(resolve, 50));
        }

        assert.ok(latest, 'expected observability log sink to persist fingerprint summary');
        assert.equal(latest.type, 'fingerprints');
        assert.ok(Array.isArray(latest.fingerprints.recentFingerprints));
    } finally {
        delete process.env.GUARDIAN_OBSERVABILITY_LOG_PATH;
        await stop();
        await fs.rm(tmpDir, { recursive: true, force: true });
    }
});

test('dashboard forwards observability snapshots to webhook sinks when enabled', async () => {
    process.env.GUARDIAN_OBSERVABILITY_WEBHOOK_URL = 'https://example.test/webhook';
    process.env.GUARDIAN_OBSERVABILITY_WEBHOOK_HEADERS = JSON.stringify({
        Authorization: 'Bearer secret',
        'X-Team': 'observability'
    });
    process.env.GUARDIAN_OBSERVABILITY_WEBHOOK_TIMEOUT_MS = '2500';
    process.env.GUARDIAN_OBSERVABILITY_WEBHOOK_MAX_RETRIES = '4';
    process.env.GUARDIAN_OBSERVABILITY_WEBHOOK_BATCH_MAX_ITEMS = '3';
    process.env.GUARDIAN_OBSERVABILITY_WEBHOOK_BATCH_MAX_WAIT_MS = '1500';
    process.env.GUARDIAN_OBSERVABILITY_WEBHOOK_BATCH_MAX_BYTES = '4096';

    const summary = {
        totalTracked: 0,
        recentFingerprints: [],
        ttlMs: 60000,
        lastUpdatedAt: new Date(0).toISOString()
    };

    const fingerprintStore = {
        ensureLoaded: async () => {},
        getSummary: () => ({
            totalTracked: summary.totalTracked,
            recentFingerprints: [...summary.recentFingerprints],
            ttlMs: summary.ttlMs,
            lastUpdatedAt: summary.lastUpdatedAt
        }),
        recordSessionCreated: async (fingerprint) => {
            summary.totalTracked += 1;
            const now = new Date(summary.totalTracked * 1000).toISOString();
            summary.lastUpdatedAt = now;
            summary.recentFingerprints = [{
                fingerprintHash: `hash-${fingerprint}`,
                sessionCount: summary.totalTracked,
                firstSeen: now,
                lastSeen: now
            }];
        },
        recordSessionTouched: async () => {},
        recordSessionEnded: async () => {},
        recordSessionMetadata: async () => {}
    };

    const sinkCalls = [];
    const sinkConfigs = [];
    const sinkHandlers = new Set();

    const exporter = {
        addSink: (handler, options = {}) => {
            sinkHandlers.add(handler);
            if (options?.metrics) {
                options.metrics();
            }
            queueMicrotask(() => {
                handler({
                    type: 'fingerprints',
                    fingerprints: fingerprintStore.getSummary()
                });
            });
            return () => sinkHandlers.delete(handler);
        },
        notifyFingerprintUpdate: () => {
            const payload = {
                type: 'fingerprints',
                fingerprints: fingerprintStore.getSummary()
            };
            for (const handler of sinkHandlers) {
                handler(payload);
            }
        },
        getSinkTelemetry: () => []
    };

    const server = new DashboardServer(0, {
        fingerprintStore,
        observabilityExporter: exporter,
        createObservabilityWebhookSink: (config) => {
            sinkConfigs.push(config);
            return {
                deliver: async (payload) => {
                    sinkCalls.push(payload);
                }
            };
        }
    });

    try {
        const session = {
            id: 'session-webhook-1',
            createdAt: new Date(0).toISOString(),
            lastSeen: new Date(0).toISOString(),
            metadata: { fingerprint: 'webhook-fp' }
        };

        await server.recordFingerprintMetric('created', session);

        for (let attempt = 0; attempt < 10 && sinkCalls.length < 2; attempt += 1) {
            await new Promise((resolve) => setTimeout(resolve, 20));
        }

        assert.ok(sinkConfigs.length >= 1, 'expected webhook sink configuration to be used');
        assert.equal(sinkConfigs[0].url, 'https://example.test/webhook');
        assert.equal(sinkConfigs[0].headers.Authorization, 'Bearer secret');
        assert.equal(sinkConfigs[0].headers['X-Team'], 'observability');
        assert.equal(sinkConfigs[0].timeoutMs, 2500);
        assert.equal(sinkConfigs[0].maxRetries, 4);
        assert.equal(sinkConfigs[0].batchMaxItems, 3);
        assert.equal(sinkConfigs[0].batchMaxWaitMs, 1500);
        assert.equal(sinkConfigs[0].batchMaxBytes, 4096);
        assert.equal(typeof sinkConfigs[0].onTelemetry, 'function');

        assert.ok(sinkCalls.length >= 1, 'expected webhook sink to receive at least one payload');
        const latest = sinkCalls[sinkCalls.length - 1];
        assert.equal(latest.type, 'fingerprints');
        assert.ok(latest.fingerprints);
        assert.ok(latest.fingerprints.totalTracked >= 1);
        assert.ok(Array.isArray(latest.fingerprints.recentFingerprints));
    } finally {
        delete process.env.GUARDIAN_OBSERVABILITY_WEBHOOK_URL;
        delete process.env.GUARDIAN_OBSERVABILITY_WEBHOOK_HEADERS;
        delete process.env.GUARDIAN_OBSERVABILITY_WEBHOOK_TIMEOUT_MS;
        delete process.env.GUARDIAN_OBSERVABILITY_WEBHOOK_MAX_RETRIES;
        delete process.env.GUARDIAN_OBSERVABILITY_WEBHOOK_BATCH_MAX_ITEMS;
        delete process.env.GUARDIAN_OBSERVABILITY_WEBHOOK_BATCH_MAX_WAIT_MS;
        delete process.env.GUARDIAN_OBSERVABILITY_WEBHOOK_BATCH_MAX_BYTES;
        server._configureObservabilitySinks();
    }
});

test('fingerprint observability waits for persistence before notifying exporter', async () => {
    const notifications = [];
    let resolveWrite;
    const writePromise = new Promise((resolve) => {
        resolveWrite = resolve;
    });

    const exporter = {
        notifyFingerprintUpdate: () => {
            notifications.push('notified');
        },
        getSinkTelemetry: () => []
    };

    const store = {
        ensureLoaded: async () => {},
        recordSessionCreated: () => writePromise,
        recordSessionTouched: () => writePromise,
        recordSessionEnded: () => writePromise,
        recordSessionMetadata: () => writePromise,
        getSummary: () => ({ totalTracked: 0, recentFingerprints: [] })
    };

    const server = new DashboardServer(0, {
        sessionManager: { ttlMs: 60000 },
        fingerprintStore: store,
        observabilityExporter: exporter
    });

    const session = {
        id: 'session-1',
        createdAt: new Date().toISOString(),
        lastSeen: new Date().toISOString(),
        metadata: { fingerprint: 'abc123' }
    };

    server.recordFingerprintMetric('created', session);
    assert.equal(notifications.length, 0);

    resolveWrite();
    await writePromise;
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(notifications.length, 1);

    let resolveMetadata;
    const metadataPromise = new Promise((resolve) => {
        resolveMetadata = resolve;
    });

    store.recordSessionMetadata = () => metadataPromise;

    server.recordFingerprintMetadata(session, 'abc123');
    assert.equal(notifications.length, 1);

    resolveMetadata();
    await metadataPromise;
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(notifications.length, 2);
});
