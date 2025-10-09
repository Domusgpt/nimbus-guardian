import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {createRequire} from 'module';

const requireModule = createRequire(import.meta.url);
const ACCOUNT_FILE = 'account.json';

describe('AccountManager cloud sync', () => {
  let tempDir;
  let originalFetch;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nimbus-account-'));
    vi.spyOn(os, 'homedir').mockReturnValue(tempDir);

    originalFetch = global.fetch;
    global.fetch = vi.fn(async () => ({
      json: async () => ({
        result: {
          userId: 'user_remote',
          tier: 'PRO',
          licenseLinked: false
        }
      })
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalFetch) {
      global.fetch = originalFetch;
    } else {
      delete global.fetch;
    }

    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, {recursive: true, force: true});
    }
  });

  it('syncs registration details to Firebase and stores account locally', async () => {
    const AccountManager = requireModule('../lib/account-manager');
    const manager = new AccountManager();

    const account = await manager.register('test@example.com', 'Test Project', 'Personal');

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(account.id).toBe('user_remote');
    expect(account.tier).toBe('PRO');
    expect(account.cloud.synced).toBe(true);

    const storedPath = path.join(tempDir, '.nimbus', ACCOUNT_FILE);
    const stored = JSON.parse(fs.readFileSync(storedPath, 'utf-8'));
    expect(stored.cloud.synced).toBe(true);
    expect(stored.projectName).toBe('Test Project');
  });

  it('falls back to local mode when cloud sync fails', async () => {
    global.fetch.mockRejectedValueOnce(new Error('network down'));

    const AccountManager = requireModule('../lib/account-manager');
    const manager = new AccountManager();

    const account = await manager.register('offline@example.com', 'Offline', 'Personal');

    expect(account.cloud.synced).toBe(false);
    expect(account.cloud.lastError).toContain('network down');
  });
});
