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

    // Tighten the rate limiter window so we can exercise throttling logic quickly.
    serverInstance.rateLimitProfiles.install.limiter = new RateLimiter({
        windowMs: 2000,
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

    // Establish a browser session via the dashboard shell.
    const dashboardResponse = await fetch(`${baseUrl}/`, {
        headers: baseHeaders
    });

    assert.equal(dashboardResponse.status, 200);
    const sessionCookie = parseSessionCookie(dashboardResponse.headers);
    assert.ok(sessionCookie?.startsWith('guardian_session='));

    const html = await dashboardResponse.text();
    let csrfToken = extractCsrfFromHtml(html);
    assert.ok(csrfToken);

    // Fetch project status with the established session.
    const statusResponse = await fetch(`${baseUrl}/api/status`, {
        headers: {
            ...baseHeaders,
            Cookie: sessionCookie,
            Origin: origin
        }
    });

    assert.equal(statusResponse.status, 200);
    const refreshedToken = statusResponse.headers.get('x-csrf-token');
    assert.ok(refreshedToken);
    csrfToken = refreshedToken;

    const statusBody = await statusResponse.json();
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
