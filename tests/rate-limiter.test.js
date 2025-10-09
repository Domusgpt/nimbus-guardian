const test = require('node:test');
const assert = require('node:assert/strict');
const RateLimiter = require('../lib/rate-limiter');

test('RateLimiter allows requests within the window', () => {
    let now = 0;
    const limiter = new RateLimiter({ windowMs: 1000, max: 3, now: () => now });

    const first = limiter.consume('user');
    assert.deepEqual(first.allowed, true);
    assert.equal(first.remaining, 2);

    const second = limiter.consume('user');
    assert.equal(second.allowed, true);
    assert.equal(second.remaining, 1);

    const third = limiter.consume('user');
    assert.equal(third.allowed, true);
    assert.equal(third.remaining, 0);
});

test('RateLimiter blocks when limit exceeded and resets after window', () => {
    let now = 0;
    const limiter = new RateLimiter({ windowMs: 1000, max: 2, now: () => now });

    limiter.consume('session');
    limiter.consume('session');

    const blocked = limiter.consume('session');
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.remaining, 0);
    assert.equal(blocked.retryAfterMs, 1000);

    now = 1001;
    const afterWindow = limiter.consume('session');
    assert.equal(afterWindow.allowed, true);
    assert.equal(afterWindow.remaining, 1);
});

test('RateLimiter handles weights larger than remaining quota', () => {
    let now = 0;
    const limiter = new RateLimiter({ windowMs: 2000, max: 5, now: () => now });

    const allowed = limiter.consume('key', 3);
    assert.equal(allowed.allowed, true);
    assert.equal(allowed.remaining, 2);

    const blocked = limiter.consume('key', 3);
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.remaining, 2);
    assert.ok(blocked.retryAfterMs > 0);

    now = 3000;
    const reset = limiter.consume('key', 2);
    assert.equal(reset.allowed, true);
    assert.equal(reset.remaining, 3);
});

test('RateLimiter rejects invalid parameters', () => {
    const limiter = new RateLimiter({ windowMs: 1000, max: 1 });

    assert.throws(() => limiter.consume('', 1), /key is required/);
    assert.throws(() => limiter.consume('k', 0), /weight must be a positive number/);
});

test('RateLimiter emits onConsume events for observability', () => {
    let now = 0;
    const events = [];
    const limiter = new RateLimiter({
        windowMs: 1000,
        max: 2,
        now: () => now,
        onConsume: (event) => events.push(event)
    });

    limiter.consume('observer');
    limiter.consume('observer');
    const blocked = limiter.consume('observer');

    assert.equal(events.length, 3);
    assert.equal(events[0].allowed, true);
    assert.equal(events[0].remaining, 1);
    assert.equal(events[0].key, 'observer');
    assert.equal(events[1].allowed, true);
    assert.equal(events[1].remaining, 0);
    assert.equal(events[2].allowed, false);
    assert.equal(events[2].remaining, 0);
    assert.equal(blocked.allowed, false);

    now = 2000;
    limiter.reset('observer');
    const afterReset = limiter.consume('observer');
    assert.equal(afterReset.allowed, true);
    assert.equal(events[events.length - 1].allowed, true);
});
