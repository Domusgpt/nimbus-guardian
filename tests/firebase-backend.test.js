import { describe, expect, it, beforeEach, vi } from 'vitest';
import { createRequire } from 'module';

const adminMockData = {
  docs: new Map(),
  adds: []
};

const requireModule = createRequire(import.meta.url);

const collection = (name) => ({
  doc(id) {
    return {
      async set(data) {
        adminMockData.docs.set(`${name}/${id}`, data);
      },
      async update(data) {
        const key = `${name}/${id}`;
        const existing = adminMockData.docs.get(key) || {};
        adminMockData.docs.set(key, { ...existing, ...data });
      },
      async get() {
        const key = `${name}/${id}`;
        if (!adminMockData.docs.has(key)) {
          return { exists: false };
        }
        return { exists: true, data: () => adminMockData.docs.get(key) };
      },
      collection(sub) {
        return collection(`${name}/${id}/${sub}`);
      }
    };
  },
  async add(data) {
    adminMockData.adds.push({ collection: name, data });
    return { id: `mock-${adminMockData.adds.length}` };
  }
});

const firestoreFn = () => ({ collection });
firestoreFn.FieldValue = {
  serverTimestamp: () => 'SERVER_TIMESTAMP',
  increment: (value) => ({ __increment: value })
};

const firebaseAdminMock = {
  firestore: firestoreFn,
  initializeApp: vi.fn()
};

const stripeClient = { webhooks: { constructEvent: vi.fn() } };
const stripeFactory = vi.fn(() => stripeClient);
vi.mock('stripe', () => stripeFactory);

const firebaseWrapper = await import('../functions/lib/firebase.js');
firebaseWrapper.setAdminForTests(firebaseAdminMock);

const licenseService = await import('../functions/lib/license-service.js');
const notifications = await import('../functions/lib/notifications.js');
const functionsIndex = await import('../functions/index.js');

const { createLicenseRecord, resolveMaxMachines, computeExpirationDate } = licenseService;
const { queueEmail } = notifications;
const { __internal } = functionsIndex;

const { handleUserCreated, processStripeEvent } = __internal;

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
    expect(usageDoc).toMatchObject({ scans: 0, ai: 0, fixes: 0 });

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
