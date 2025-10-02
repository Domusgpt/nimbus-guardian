# FIREBASE ARCHITECTURE - Nimbus Guardian

**Goal**: Sync user data (accounts, licenses, usage) to Firebase so FREE tier limits are enforced globally, not just per-machine.

---

## CURRENT PROBLEM

**Local-Only Storage** (Files in `~/.nimbus/`):
- `account.json` - User account info
- `license.json` - License key and tier
- `rate-limits.json` - Usage timestamps

**Issue**: User can bypass limits by:
1. Deleting `~/.nimbus/` folder
2. Using multiple machines
3. Switching user accounts

**Solution**: Sync to Firebase Firestore daily (FREE tier) or real-time (PRO tier)

---

## FIREBASE PROJECT SETUP

**Project**: `nimbus-guardian` (already exists at https://nimbus-guardian.web.app)

**Services Needed**:
1. **Firestore** - User accounts, licenses, usage tracking
2. **Cloud Functions** - License validation, usage sync
3. **Firebase Hosting** - Landing page + dashboard
4. **Firebase Auth** (optional) - Email/password login

---

## FIRESTORE DATA STRUCTURE

```
users/
  {userId}/
    account:
      email: string
      registeredAt: timestamp
      machineId: string (primary machine)
      tier: "FREE" | "PRO" | "ENTERPRISE"

    license:
      key: string (NIMBUS-XXXX-XXXX-XXXX-XXXX)
      tier: string
      activatedAt: timestamp
      machineIds: array<string> (multi-machine for PRO+)
      expiresAt: timestamp (optional)

    usage/
      {YYYY-MM-DD}/
        scans: number
        aiQueries: number
        fixes: number
        lastSyncAt: timestamp

    sessions/
      {sessionId}/
        machineId: string
        startedAt: timestamp
        lastSeenAt: timestamp
        ipAddress: string (optional)

licenses/
  {licenseKey}/
    tier: string
    userId: string (assigned to)
    createdAt: timestamp
    maxMachines: number
    status: "active" | "revoked" | "expired"
```

---

## CLOUD FUNCTIONS

### 1. `validateLicense` (HTTPS Callable)
**Trigger**: CLI calls when activating license key
**Input**: `{ licenseKey, machineId }`
**Process**:
- Check if key exists in `licenses/` collection
- Check if status is "active"
- Assign userId if first activation
- Add machineId to allowed list
**Return**: `{ valid: boolean, tier: string, userId: string }`

### 2. `syncUsage` (HTTPS Callable)
**Trigger**: CLI calls on every scan (FREE: daily, PRO: real-time)
**Input**: `{ userId, machineId, action: "scan" | "ai" | "fix" }`
**Process**:
- Get today's date (YYYY-MM-DD)
- Increment usage counter in `users/{userId}/usage/{date}`
- Check rate limits based on tier
**Return**: `{ allowed: boolean, remaining: number, resetAt: timestamp }`

### 3. `checkRateLimit` (HTTPS Callable)
**Trigger**: CLI calls before every action
**Input**: `{ userId, action: "scan" | "ai" | "fix" }`
**Process**:
- Get today's usage from Firestore
- Compare against tier limits
**Return**: `{ allowed: boolean, reason: string, upgrade: url }`

### 4. `generateLicenseKey` (HTTPS Callable - Admin Only)
**Trigger**: Manual admin call or Stripe webhook
**Input**: `{ tier: string, email: string, maxMachines: number }`
**Process**:
- Generate key: `NIMBUS-{random}-{random}-{random}-{random}`
- Store in `licenses/` collection
- Email key to customer
**Return**: `{ licenseKey: string }`

### 5. `handleStripeWebhook` (HTTP Function)
**Trigger**: Stripe payment succeeded
**Input**: Stripe webhook payload
**Process**:
- Parse payment metadata (email, tier)
- Call `generateLicenseKey`
- Email license to customer
**Return**: 200 OK

---

## CLI INTEGRATION

### Current (Offline Only)
```javascript
// lib/account-manager.js
register(email) {
  const account = { id: generateId(), email, tier: 'FREE' };
  fs.writeFileSync('~/.nimbus/account.json', JSON.stringify(account));
}
```

### New (Firebase Sync)
```javascript
// lib/account-manager.js
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

async register(email) {
  // 1. Create local account (offline fallback)
  const account = {
    id: generateId(),
    email,
    tier: 'FREE',
    machineId: getMachineId()
  };
  fs.writeFileSync(this.accountFile, JSON.stringify(account));

  // 2. Sync to Firebase (if online)
  try {
    const db = getFirestore();
    await db.collection('users').doc(account.id).set({
      account: {
        email: account.email,
        registeredAt: new Date(),
        machineId: account.machineId,
        tier: 'FREE'
      }
    });
    console.log('✅ Account synced to cloud');
  } catch (err) {
    console.log('⚠️  Offline mode - account saved locally only');
  }

  return account;
}
```

### Rate Limiting (Firebase-Backed)
```javascript
// lib/rate-limiter.js
async checkLimit(userId, action, tier) {
  // 1. Check local cache first (fast)
  const localCheck = this.checkLocalLimit(action, tier);
  if (!localCheck.allowed) return localCheck;

  // 2. Check Firebase for FREE tier (daily sync)
  if (tier === 'FREE') {
    try {
      const response = await fetch('https://us-central1-nimbus-guardian.cloudfunctions.net/checkRateLimit', {
        method: 'POST',
        body: JSON.stringify({ userId, action })
      });
      const cloudCheck = await response.json();

      if (!cloudCheck.allowed) {
        return cloudCheck; // Blocked by cloud limits
      }
    } catch (err) {
      // Offline - allow (risky but necessary for offline use)
    }
  }

  // 3. Record action locally
  this.recordAction(action);

  // 4. Sync to Firebase (async, non-blocking)
  this.syncUsageToFirebase(userId, action).catch(() => {}); // Fire and forget

  return { allowed: true };
}
```

---

## SYNC STRATEGY

### FREE Tier (Daily Sync)
- **Local-first**: Check local `rate-limits.json` for immediate feedback
- **Cloud sync**: Once per day, sync usage to Firebase
- **Enforcement**: Cloud checks prevent multi-machine abuse
- **Offline**: Allow scans offline, sync later

### PRO Tier (Real-time Sync)
- **Local-first**: Still check local for speed
- **Cloud sync**: After every action (non-blocking)
- **Enforcement**: Soft limits, trusted users
- **Offline**: Full functionality, sync when online

### Algorithm
```javascript
async scan() {
  const account = getAccount();

  // 1. Fast local check
  const localCheck = rateLimiter.checkLocalLimit('scans', account.tier);
  if (!localCheck.allowed) {
    console.log('⛔ Rate limit exceeded (local)');
    return;
  }

  // 2. For FREE tier, check cloud daily
  if (account.tier === 'FREE' && shouldSyncToday()) {
    const cloudCheck = await rateLimiter.checkCloudLimit(account.id, 'scans');
    if (!cloudCheck.allowed) {
      console.log('⛔ Daily limit exceeded (cloud)');
      console.log('Upgrade: https://nimbus-guardian.web.app/#pricing');
      return;
    }
  }

  // 3. Run scan
  const results = await engine.analyze();

  // 4. Record locally
  rateLimiter.recordAction('scans');

  // 5. Sync to cloud (async, don't wait)
  syncUsageToCloud(account.id, 'scans').catch(() => {});

  return results;
}
```

---

## SECURITY RULES

**Firestore Rules**:
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users can only read/write their own data
    match /users/{userId} {
      allow read: if request.auth != null && request.auth.uid == userId;
      allow write: if request.auth != null && request.auth.uid == userId;
    }

    // Licenses are read-only for users
    match /licenses/{licenseKey} {
      allow read: if request.auth != null;
      allow write: if false; // Only Cloud Functions can write
    }
  }
}
```

---

## DASHBOARD CONNECTION

**Current**: `public/dashboard.html` shows demo data (hardcoded)

**Fix**: Connect to `dashboard-server.js` backend

### Option 1: Use dashboard-server.js (Local Server)
```bash
# User runs:
nimbus dashboard

# Opens http://localhost:3333 with real data
```

**Problem**: Requires running local server, not a web app

### Option 2: Deploy dashboard to Firebase Hosting
```bash
# Build static dashboard that calls Firebase directly
public/dashboard/
  index.html (current holographic UI)
  app.js (Firebase SDK, fetch real data)
```

**Process**:
1. User visits https://nimbus-guardian.web.app/dashboard
2. Logs in with email/password (Firebase Auth)
3. Dashboard fetches data from Firestore
4. Shows real account info, usage, scans

---

## IMPLEMENTATION PLAN

### Phase 1: Firebase Setup (1 hour)
- [x] Firebase project exists
- [ ] Enable Firestore
- [ ] Enable Cloud Functions
- [ ] Deploy security rules

### Phase 2: Cloud Functions (2 hours)
- [ ] `validateLicense` function
- [ ] `checkRateLimit` function
- [ ] `syncUsage` function
- [ ] Deploy functions

### Phase 3: CLI Integration (3 hours)
- [ ] Add `firebase-admin` dependency
- [ ] Update `account-manager.js` to sync on register
- [ ] Update `license-manager.js` to validate via Cloud Function
- [ ] Update `rate-limiter.js` to check cloud limits
- [ ] Add `--offline` flag for airplane mode

### Phase 4: Dashboard (4 hours)
- [ ] Update `public/dashboard.html` to use Firebase SDK
- [ ] Add Firebase Auth login page
- [ ] Fetch real user data from Firestore
- [ ] Deploy to Firebase Hosting

### Phase 5: Payment (Later)
- [ ] Stripe integration
- [ ] `handleStripeWebhook` function
- [ ] Automated license delivery

---

## COST ESTIMATION

**Firebase FREE Tier**:
- Firestore: 50,000 reads/day, 20,000 writes/day
- Functions: 125K invocations/month
- Hosting: 10GB/month

**Our Usage** (per user):
- 50 scans/day = 50 writes/day (usage sync)
- 50 scans/day = 50 reads/day (rate limit checks)

**Supports**: ~500 active users on FREE tier

**If we exceed**: Upgrade to Blaze plan (~$25/month for 10K users)

---

## OFFLINE SUPPORT

**Principle**: CLI should work offline (airplane mode, no internet)

**Strategy**:
1. **Local-first**: All checks happen locally first
2. **Eventual sync**: Sync to cloud when online
3. **Graceful degradation**: If cloud unreachable, trust local data
4. **Honest users**: FREE tier users can abuse offline, but we accept this

**Implementation**:
```javascript
async syncUsageToCloud(userId, action) {
  try {
    await fetch('https://us-central1-nimbus-guardian.cloudfunctions.net/syncUsage', {
      method: 'POST',
      body: JSON.stringify({ userId, action }),
      timeout: 2000 // Fast timeout
    });
  } catch (err) {
    // Failed to sync - that's okay, try again later
    this.queueForLaterSync(userId, action);
  }
}
```

---

## NEXT STEPS

1. **Enable Firestore** in Firebase console
2. **Write Cloud Functions** (`functions/index.js`)
3. **Update CLI** to use Firebase
4. **Test offline mode**
5. **Deploy dashboard**

---

**© 2025 Paul Phillips - Clear Seas Solutions LLC**
