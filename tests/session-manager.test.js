const test = require('node:test');
const assert = require('node:assert/strict');
const SessionManager = require('../lib/session-manager');

test('createSession returns a session with id and csrf token', () => {
    const manager = new SessionManager({ ttlMs: 1000 * 60, cleanupIntervalMs: 0 });
    const session = manager.createSession({ fingerprint: 'abc123' });

    assert.ok(session);
    assert.ok(typeof session.id === 'string' && session.id.length > 0);
    assert.ok(typeof session.csrfToken === 'string' && session.csrfToken.length > 0);
    assert.equal(manager.getSession(session.id), session);
    assert.equal(session.metadata.fingerprint, 'abc123');
    assert.equal(Object.getPrototypeOf(session.metadata), null);
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

    const session = manager.createSession({ fingerprint: 'abc123' });
    assert.equal(session.csrfToken, 'initial-token');

    now = 1500;
    const touched = manager.touchSession(session.id, { rotateCsrf: true });
    assert.ok(touched);
    assert.equal(touched.csrfToken, 'rotated-token');
    assert.equal(manager.getSession(session.id).csrfToken, 'rotated-token');
    assert.equal(touched.lastSeen, now);
    assert.equal(touched.metadata.fingerprint, 'abc123');
});

test('setSessionMetadata overwrites metadata with a sanitized copy', () => {
    const manager = new SessionManager({ ttlMs: 1000 * 60, cleanupIntervalMs: 0 });
    const originalMeta = { fingerprint: 'initial', ignore: 'me' };
    const session = manager.createSession(originalMeta);

    assert.equal(session.metadata.fingerprint, 'initial');

    originalMeta.fingerprint = 'tampered';
    const updated = manager.setSessionMetadata(session.id, { fingerprint: 'updated', extra: 'value' });

    assert.equal(updated.metadata.fingerprint, 'updated');
    assert.equal(updated.metadata.extra, 'value');
    assert.equal(Object.getPrototypeOf(updated.metadata), null);
    assert.equal(manager.getSession(session.id).metadata.fingerprint, 'updated');
    assert.equal(updated.metadata.hasOwnProperty, undefined);
});

test('destroySession removes session entries safely', () => {
    const manager = new SessionManager({ ttlMs: 1000 * 60, cleanupIntervalMs: 0 });
    const session = manager.createSession({ fingerprint: 'abc123' });

    assert.ok(manager.getSession(session.id));
    manager.destroySession(session.id);
    assert.equal(manager.getSession(session.id), null);
    // Destroying twice should not throw
    manager.destroySession(session.id);
});

test('session manager emits observability callbacks', () => {
    let now = 0;
    const events = [];
    const manager = new SessionManager({
        ttlMs: 100,
        cleanupIntervalMs: 1,
        now: () => now,
        onSessionCreated: (session) => events.push({ type: 'created', session }),
        onSessionTouched: (session) => events.push({ type: 'touched', session }),
        onSessionDestroyed: (session) => events.push({ type: 'destroyed', session }),
        onSessionExpired: (session) => events.push({ type: 'expired', session })
    });

    const first = manager.createSession({ fingerprint: 'demo' });
    assert.equal(events[0].type, 'created');
    assert.equal(events[0].session.metadata.fingerprint, 'demo');

    manager.touchSession(first.id);
    assert.equal(events[1].type, 'touched');
    assert.equal(events[1].session.id, first.id);

    manager.destroySession(first.id);
    assert.equal(events[2].type, 'destroyed');

    now = 50;
    const second = manager.createSession();
    assert.equal(events[3].type, 'created');

    now = 200;
    manager.cleanupExpiredSessions(now);

    const lastEvent = events[events.length - 1];
    assert.equal(lastEvent.type, 'expired');
    assert.equal(lastEvent.session.id, second.id);
    assert.equal(lastEvent.session.metadata.fingerprint, undefined);
});
