'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');

const DashboardServer = require('../dashboard-server');
const RateLimiter = require('../lib/rate-limiter');

async function createTestServer(t) {
    const serverInstance = new DashboardServer(0);
    await serverInstance.loadConfig();

    // Stub expensive helpers to keep the test lightweight and deterministic.
    serverInstance.getProjectStatus = async () => ({
        projectName: 'Test Project',
        configWarnings: [],
        timestamp: new Date().toISOString()
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
    serverInstance.rateLimitProfiles.install.limiter = new RateLimiter({
        windowMs: shortWindow,
        max: 2
    });
    serverInstance.rateLimitProfiles.action.limiter = new RateLimiter({
        windowMs: shortWindow,
        max: 2
    });
    serverInstance.rateLimitProfiles.scan.limiter = new RateLimiter({
        windowMs: shortWindow,
        max: 1
    });
    serverInstance.rateLimitProfiles.chat.limiter = new RateLimiter({
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
