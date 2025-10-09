import { describe, expect, it, beforeEach, vi } from 'vitest';
import { createRequire } from 'module';

const adminMockData = {
  docs: new Map(),
  adds: []
};

const requireModule = createRequire(import.meta.url);

const isPlainObject = (value) => {
  if (!value || typeof value !== 'object') {
    return false;
  }
  if (Array.isArray(value)) {
    return false;
  }
  if (value instanceof Date) {
    return false;
  }
  return true;
};

function applyFieldValues(target, source) {
  const base = Array.isArray(target) ? [...target] : { ...(target || {}) };

  Object.entries(source).forEach(([key, value]) => {
    if (isPlainObject(value) && Object.prototype.hasOwnProperty.call(value, '__increment')) {
      const current = typeof base[key] === 'number' ? base[key] : 0;
      base[key] = current + value.__increment;
      return;
    }

    if (isPlainObject(value) && Object.prototype.hasOwnProperty.call(value, '__arrayUnion')) {
      const existing = Array.isArray(base[key]) ? base[key] : [];
      value.__arrayUnion.forEach((entry) => {
        if (!existing.includes(entry)) {
          existing.push(entry);
        }
      });
      base[key] = existing;
      return;
    }

    if (isPlainObject(value)) {
      base[key] = applyFieldValues(base[key], value);
      return;
    }

    base[key] = value;
  });

  return base;
}

const collection = (name) => {
  const doc = (id) => {
    const key = `${name}/${id}`;
    return {
      async set(data, options = {}) {
        const existing = options.merge ? adminMockData.docs.get(key) : undefined;
        adminMockData.docs.set(key, applyFieldValues(existing || {}, data));
      },
      async update(data) {
        const existing = adminMockData.docs.get(key) || {};
        adminMockData.docs.set(key, applyFieldValues(existing, data));
      },
      async get() {
        if (!adminMockData.docs.has(key)) {
          return { exists: false };
        }
        return { exists: true, data: () => adminMockData.docs.get(key) };
      },
      collection(sub) {
        return collection(`${name}/${id}/${sub}`);
      },
      ref: null
    };
  };

  const baseSegments = name.split('/').length;
  const prefix = `${name}/`;

  return {
    doc,
    async add(data) {
      adminMockData.adds.push({ collection: name, data });
      return { id: `mock-${adminMockData.adds.length}` };
    },
    where(fieldPath, operator, value) {
      const docs = [];

      for (const [key, stored] of adminMockData.docs.entries()) {
        if (!key.startsWith(prefix)) continue;
        const segments = key.split('/');
        if (segments.length !== baseSegments + 1) continue;

        const fieldValue = fieldPath.split('.').reduce((acc, part) => (acc ? acc[part] : undefined), stored);

        let matches = false;
        if (operator === '==') {
          matches = fieldValue === value;
        }

        if (!matches) continue;

        const id = segments[baseSegments];
        docs.push({
          id,
          data: () => stored,
          ref: doc(id)
        });
      }

      const queryApi = {
        async get() {
          return {
            empty: docs.length === 0,
            docs
          };
        },
        limit() {
          return queryApi;
        }
      };

      return queryApi;
    }
  };
};

const firestoreFn = () => ({ collection });
firestoreFn.FieldValue = {
  serverTimestamp: () => 'SERVER_TIMESTAMP',
  increment: (value) => ({ __increment: value }),
  arrayUnion: (...values) => ({ __arrayUnion: values })
};

const firebaseAdminMock = {
  firestore: firestoreFn,
  initializeApp: vi.fn()
};

const stripeClient = { webhooks: { constructEvent: vi.fn() } };
const stripeFactory = vi.fn(() => stripeClient);
vi.mock('stripe', () => stripeFactory, { virtual: true });

const firebaseWrapper = await import('../functions/lib/firebase.js');
firebaseWrapper.setAdminForTests(firebaseAdminMock);

const licenseService = await import('../functions/lib/license-service.js');
const notifications = await import('../functions/lib/notifications.js');
const functionsIndex = await import('../functions/index.js');
const userService = await import('../functions/lib/user-service.js');
const usageService = await import('../functions/lib/usage-service.js');

const { createLicenseRecord, resolveMaxMachines, computeExpirationDate } = licenseService;
const { queueEmail } = notifications;
const { __internal } = functionsIndex;

const { handleUserCreated, processStripeEvent, registerAccountHandler } = __internal;
const { normalizeEmail } = userService;
const { recordUsageEvent, checkUsageAllowance } = usageService;

describe('license-service', () => {
  beforeEach(() => {
    adminMockData.docs.clear();
    adminMockData.adds.length = 0;
  });

  it('creates a license document with metadata and analytics entry', async () => {
    const { licenseKey } = await createLicenseRecord({
      tier: 'PRO',
      email: 'customer@example.com',
      expiresInDays: 30,
      metadata: { source: 'test' }
    }, { adminOverride: firebaseAdminMock });

    expect(licenseKey).toMatch(/^NIMBUS-[A-Z0-9]{4}(-[A-Z0-9]{4}){3}$/);

    const stored = adminMockData.docs.get(`licenses/${licenseKey}`);
    expect(stored).toBeDefined();
    expect(stored).toMatchObject({
      tier: 'PRO',
      email: 'customer@example.com',
      status: 'active',
      maxMachines: 3,
      source: 'manual'
    });
    expect(stored.metadata).toMatchObject({ source: 'test' });
    expect(stored.expiresAt).toBeInstanceOf(Date);

    expect(adminMockData.adds).toContainEqual({
      collection: 'adminEvents',
      data: expect.objectContaining({
        type: 'LICENSE_GENERATED',
        payload: expect.objectContaining({ licenseKey })
      })
    });
  });

  it('allows overriding the machine limit', async () => {
    const { licenseKey } = await createLicenseRecord({
      tier: 'FREE',
      email: 'free@example.com',
      maxMachines: 5
    }, { adminOverride: firebaseAdminMock });

    const stored = adminMockData.docs.get(`licenses/${licenseKey}`);
    expect(stored.maxMachines).toBe(5);
  });

  it('resolves machine defaults based on tier', () => {
    expect(resolveMaxMachines('FREE')).toBe(1);
    expect(resolveMaxMachines('PRO')).toBe(3);
    expect(resolveMaxMachines('enterprise')).toBe(10);
    expect(resolveMaxMachines('unknown')).toBe(1);
    expect(resolveMaxMachines('PRO', 8)).toBe(8);
  });

  it('computes expiration dates relative to today', () => {
    const expires = computeExpirationDate(15);
    const now = Date.now();
    expect(expires.getTime()).toBeGreaterThan(now);
    expect(computeExpirationDate()).toBeNull();
  });
});

describe('notifications', () => {
  beforeEach(() => {
    adminMockData.adds.length = 0;
  });

  it('queues outbound emails in Firestore', async () => {
    await queueEmail({
      to: 'ops@example.com',
      template: 'license-issued',
      data: { licenseKey: 'NIMBUS-TEST' }
    }, { adminOverride: firebaseAdminMock });

    expect(adminMockData.adds).toContainEqual({
      collection: 'mailQueue',
      data: expect.objectContaining({
        to: 'ops@example.com',
        template: 'license-issued'
      })
    });
  });
});

describe('handleUserCreated trigger', () => {
  beforeEach(() => {
    adminMockData.docs.clear();
    adminMockData.adds.length = 0;
  });

  it('initializes usage document and queues welcome email', async () => {
    const event = {
      params: { userId: 'user_123' },
      data: {
        data: () => ({
          account: { email: 'hello@example.com' },
          license: { tier: 'PRO' }
        })
      }
    };

    await handleUserCreated(event, { adminOverride: firebaseAdminMock });

    const today = new Date().toISOString().split('T')[0];
    const usageDoc = adminMockData.docs.get(`users/user_123/usage/${today}`);
    expect(usageDoc.actions).toEqual({ scans: 0, ai: 0, fixes: 0 });
    expect(usageDoc.hourly).toEqual({});

    expect(adminMockData.adds).toContainEqual({
      collection: 'mailQueue',
      data: expect.objectContaining({ to: 'hello@example.com', template: 'welcome' })
    });

    expect(adminMockData.adds).toContainEqual({
      collection: 'adminEvents',
      data: expect.objectContaining({
        type: 'USER_REGISTERED',
        payload: expect.objectContaining({ userId: 'user_123', tier: 'PRO' })
      })
    });
  });
});

describe('processStripeEvent', () => {
  beforeEach(() => {
    adminMockData.docs.clear();
    adminMockData.adds.length = 0;
  });

  it('skips unsupported Stripe events', async () => {
    const result = await processStripeEvent({ type: 'customer.created' });
    expect(result).toEqual({ processed: false });
    expect(adminMockData.adds).toEqual([]);
  });
});

describe('usage-service', () => {
  beforeEach(() => {
    adminMockData.docs.clear();
  });

  it('records hourly usage totals and metadata snapshots', async () => {
    const now = new Date('2025-01-02T10:15:00Z');
    const result = await recordUsageEvent({
      userId: 'user_usage',
      action: 'scans',
      metadata: { issues: 3 },
      now
    }, { adminOverride: firebaseAdminMock });

    expect(result).toMatchObject({
      action: 'scans',
      totalActions: 1,
      hourlyActions: 1
    });

    const stored = adminMockData.docs.get('users/user_usage/usage/2025-01-02');
    expect(stored.actions.scans).toBe(1);
    expect(stored.hourly['2025-01-02T10'].scans).toBe(1);
    expect(stored.lastMetadata).toEqual({ issues: 3 });
  });

  it('blocks when free tier hourly usage is exhausted', async () => {
    adminMockData.docs.set('users/user_hour/usage/2025-01-02', {
      actions: { scans: 12 },
      hourly: {
        '2025-01-02T10': { scans: 10 }
      }
    });

    const result = await checkUsageAllowance({
      userId: 'user_hour',
      action: 'scans',
      tier: 'FREE',
      now: new Date('2025-01-02T10:45:00Z')
    }, { adminOverride: firebaseAdminMock });

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('per hour');
    expect(result.resetAt).toBeDefined();
  });

  it('blocks when free tier daily usage is exhausted', async () => {
    adminMockData.docs.set('users/user_daily/usage/2025-01-02', {
      actions: { scans: 50 },
      hourly: {
        '2025-01-02T09': { scans: 8 }
      }
    });

    const result = await checkUsageAllowance({
      userId: 'user_daily',
      action: 'scans',
      tier: 'FREE',
      now: new Date('2025-01-02T11:00:00Z')
    }, { adminOverride: firebaseAdminMock });

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('per day');
    expect(result.resetAt).toBeDefined();
  });

  it('returns unlimited remaining for pro users', async () => {
    const result = await checkUsageAllowance({
      userId: 'user_pro',
      action: 'scans',
      tier: 'PRO',
      now: new Date('2025-01-02T12:00:00Z')
    }, { adminOverride: firebaseAdminMock });

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe('unlimited');
  });
});

describe('user account registration', () => {
  beforeEach(() => {
    adminMockData.docs.clear();
    adminMockData.adds.length = 0;
  });

  it('normalizes email addresses', () => {
    expect(normalizeEmail('  Test@Example.com ')).toBe('test@example.com');
    expect(normalizeEmail(null)).toBe('');
  });

  it('creates a new cloud user without a license and logs an event', async () => {
    const result = await registerAccountHandler({
      email: 'hello@example.com',
      projectName: 'Cloud App',
      useCase: 'Personal',
      machineId: 'machine-123'
    }, { adminOverride: firebaseAdminMock });

    expect(result.success).toBe(true);
    expect(result.licenseLinked).toBe(false);
    expect(result.existingAccount).toBe(false);

    const stored = adminMockData.docs.get(`users/${result.userId}`);
    expect(stored.account.email).toBe('hello@example.com');
    expect(stored.account.projectName).toBe('Cloud App');
    expect(stored.machines).toContain('machine-123');

    expect(adminMockData.adds).toContainEqual({
      collection: 'adminEvents',
      data: expect.objectContaining({
        type: 'ACCOUNT_REGISTERED',
        payload: expect.objectContaining({ email: 'hello@example.com' })
      })
    });
  });

  it('links licenses to existing users and updates machine lists', async () => {
    adminMockData.docs.set('licenses/NIMBUS-TEST', {
      tier: 'PRO',
      status: 'active',
      machineIds: []
    });

    const result = await registerAccountHandler({
      email: 'pro@example.com',
      licenseKey: 'NIMBUS-TEST',
      machineId: 'machine-pro'
    }, { adminOverride: firebaseAdminMock });

    expect(result.tier).toBe('PRO');
    expect(result.licenseLinked).toBe(true);

    const licenseDoc = adminMockData.docs.get('licenses/NIMBUS-TEST');
    expect(licenseDoc.userId).toBe(result.userId);
    expect(licenseDoc.machineIds).toContain('machine-pro');

    const userDoc = adminMockData.docs.get(`users/${result.userId}`);
    expect(userDoc.license.key).toBe('NIMBUS-TEST');
    expect(userDoc.account.tier).toBe('PRO');
  });

  it('reuses existing user IDs from licenses', async () => {
    adminMockData.docs.set('users/user_existing', {
      account: {
        email: 'existing@example.com',
        emailLower: 'existing@example.com',
        tier: 'PRO'
      }
    });

    adminMockData.docs.set('licenses/NIMBUS-EXIST', {
      tier: 'PRO',
      status: 'active',
      userId: 'user_existing'
    });

    const result = await registerAccountHandler({
      email: 'existing@example.com',
      licenseKey: 'NIMBUS-EXIST',
      machineId: 'machine-existing'
    }, { adminOverride: firebaseAdminMock });

    expect(result.userId).toBe('user_existing');
    expect(result.existingAccount).toBe(true);

    const events = adminMockData.adds.filter((entry) => entry.collection === 'adminEvents');
    expect(events).toContainEqual({
      collection: 'adminEvents',
      data: expect.objectContaining({ type: 'ACCOUNT_SYNCED' })
    });
  });

  it('throws when registering with a revoked license', async () => {
    adminMockData.docs.set('licenses/NIMBUS-BLOCKED', {
      tier: 'PRO',
      status: 'revoked'
    });

    await expect(registerAccountHandler({
      email: 'blocked@example.com',
      licenseKey: 'NIMBUS-BLOCKED'
    }, { adminOverride: firebaseAdminMock })).rejects.toThrow('revoked');
  });
});
