'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('fs-extra');

const FingerprintStore = require('../lib/fingerprint-store');

async function createStore(options = {}) {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fingerprint-store-'));
    const filePath = path.join(tmpDir, 'fingerprints.json');
    const store = new FingerprintStore({
        filePath,
        writeDebounceMs: 0,
        ...options
    });
    await store.ensureLoaded();
    return { store, filePath, tmpDir };
}

test('persists fingerprint metrics across reloads', async () => {
    let now = 1_000;
    const { store, filePath, tmpDir } = await createStore({ now: () => now, ttlMs: 10_000 });

    await store.recordSessionCreated('fingerprint-a', { id: 'session-1', createdAt: now });
    now += 500;
    await store.recordSessionTouched('fingerprint-a', { id: 'session-1', lastSeen: now });
    const firstSummary = store.getSummary();

    assert.equal(firstSummary.totalTracked, 1);
    assert.equal(firstSummary.recentFingerprints.length, 1);
    assert.equal(firstSummary.recentFingerprints[0].sessionCount, 1);
    assert.ok(firstSummary.recentFingerprints[0].fingerprintHash);

    const reloaded = new FingerprintStore({ filePath, now: () => now + 100, ttlMs: 10_000, writeDebounceMs: 0 });
    await reloaded.ensureLoaded();
    const secondSummary = reloaded.getSummary();

    assert.equal(secondSummary.totalTracked, 1);
    assert.equal(secondSummary.recentFingerprints[0].sessionCount, 1);
    assert.equal(secondSummary.recentFingerprints[0].firstSeen, firstSummary.recentFingerprints[0].firstSeen);
    assert.equal(secondSummary.recentFingerprints[0].fingerprintHash, firstSummary.recentFingerprints[0].fingerprintHash);

    await fs.remove(tmpDir);
});

test('prunes expired fingerprints and limits stored entries', async () => {
    let now = 0;
    const { store, tmpDir } = await createStore({ now: () => now, ttlMs: 2000, maxEntries: 2 });

    await store.recordSessionCreated('fp-1', { id: 's1', createdAt: now });
    await store.recordSessionCreated('fp-2', { id: 's2', createdAt: now });
    await store.recordSessionCreated('fp-3', { id: 's3', createdAt: now });

    let summary = store.getSummary();
    assert.equal(summary.totalTracked, 2);

    now = 5000; // advance beyond ttl
    await store.recordSessionTouched('fp-3', { id: 's3', lastSeen: now });
    summary = store.getSummary();

    assert.equal(summary.totalTracked, 1);
    assert.equal(summary.recentFingerprints[0].sessionCount, 1);

    await fs.remove(tmpDir);
});
