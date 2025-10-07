const test = require('node:test');
const assert = require('node:assert/strict');
const SessionManager = require('../lib/session-manager');

test('createSession returns a session with id and csrf token', () => {
    const manager = new SessionManager({ ttlMs: 1000 * 60, cleanupIntervalMs: 0 });
    const session = manager.createSession();

    assert.ok(session);
    assert.ok(typeof session.id === 'string' && session.id.length > 0);
    assert.ok(typeof session.csrfToken === 'string' && session.csrfToken.length > 0);
    assert.equal(manager.getSession(session.id), session);
});

test('sessions expire after ttl elapses', () => {
    let now = 0;
    const manager = new SessionManager({
        ttlMs: 100,
        cleanupIntervalMs: 0,
        now: () => now
    });

    const session = manager.createSession();
    assert.ok(manager.getSession(session.id));

    now = 150;
    assert.equal(manager.getSession(session.id), null);
});

test('touchSession refreshes timestamps and rotates csrf when requested', () => {
    let now = 1000;
    const tokens = ['initial-token', 'rotated-token'];
    const manager = new SessionManager({
        ttlMs: 1000,
        cleanupIntervalMs: 0,
        now: () => now,
        tokenGenerator: () => tokens.shift() || 'exhausted'
    });

    const session = manager.createSession();
    assert.equal(session.csrfToken, 'initial-token');

    now = 1500;
    const touched = manager.touchSession(session.id, { rotateCsrf: true });
    assert.ok(touched);
    assert.equal(touched.csrfToken, 'rotated-token');
    assert.equal(manager.getSession(session.id).csrfToken, 'rotated-token');
    assert.equal(touched.lastSeen, now);
});
