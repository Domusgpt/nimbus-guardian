const test = require('node:test');
const assert = require('node:assert/strict');
const DashboardObservability = require('../lib/dashboard-observability');

const fixedNow = () => 1_700_000_000_000;

test('DashboardObservability tracks session lifecycle metrics', () => {
    const observability = new DashboardObservability({ now: fixedNow });

    observability.recordSessionCreated({ id: 'a', createdAt: fixedNow(), lastSeen: fixedNow(), metadata: {} });
    observability.recordSessionTouched({ id: 'a', createdAt: fixedNow(), lastSeen: fixedNow(), metadata: {} });
    observability.recordSessionDestroyed({ id: 'a', createdAt: fixedNow(), lastSeen: fixedNow(), metadata: {} });

    observability.recordSessionCreated({ id: 'b', createdAt: fixedNow(), lastSeen: fixedNow(), metadata: {} });
    observability.recordSessionExpired({ id: 'b', createdAt: fixedNow(), lastSeen: fixedNow(), metadata: {} });

    const snapshot = observability.getSnapshot();

    assert.equal(snapshot.sessions.created, 2);
    assert.equal(snapshot.sessions.touches, 1);
    assert.equal(snapshot.sessions.destroyed, 1);
    assert.equal(snapshot.sessions.expired, 1);
    assert.equal(snapshot.sessions.active, 0);
    assert.ok(snapshot.sessions.lastCreatedAt);
    assert.ok(snapshot.sessions.lastTouchedAt);
    assert.ok(snapshot.sessions.lastDestroyedAt);
    assert.ok(snapshot.sessions.lastExpiredAt);
});

test('DashboardObservability anonymizes rate limit keys and counts outcomes', () => {
    const observability = new DashboardObservability({ now: fixedNow });

    observability.recordRateLimitAttempt('action', {
        key: 'client-1',
        allowed: true,
        remaining: 3,
        retryAfterMs: 0,
        resetMs: fixedNow() + 1000,
        windowMs: 1000,
        max: 4
    });

    observability.recordRateLimitAttempt('action', {
        key: 'client-1',
        allowed: false,
        remaining: 0,
        retryAfterMs: 500,
        resetMs: fixedNow() + 500,
        windowMs: 1000,
        max: 4
    });

    observability.recordRateLimitAttempt('chat', {
        key: 'client-2',
        allowed: true,
        remaining: 7,
        retryAfterMs: 0,
        resetMs: fixedNow() + 1000,
        windowMs: 2000,
        max: 8
    });

    const snapshot = observability.getSnapshot();

    assert.equal(snapshot.rateLimits.action.allowed, 1);
    assert.equal(snapshot.rateLimits.action.blocked, 1);
    assert.equal(snapshot.rateLimits.action.lastRemaining, 0);
    assert.ok(snapshot.rateLimits.action.lastKeyHash);
    assert.equal(snapshot.rateLimits.chat.allowed, 1);
    assert.equal(snapshot.rateLimits.chat.blocked, 0);

    // Mutating the snapshot should not affect internal state.
    snapshot.rateLimits.action.allowed = 99;
    const nextSnapshot = observability.getSnapshot();
    assert.equal(nextSnapshot.rateLimits.action.allowed, 1);
});
