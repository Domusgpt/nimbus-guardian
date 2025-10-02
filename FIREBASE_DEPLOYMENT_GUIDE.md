# FIREBASE DEPLOYMENT GUIDE

Complete step-by-step guide to deploy Nimbus Guardian backend to Firebase.

---

## PREREQUISITES

1. **Firebase CLI** installed globally
```bash
npm install -g firebase-tools
```

2. **Firebase project** exists: `nimbus-guardian`
   - Visit https://console.firebase.google.com
   - Project ID: `nimbus-guardian`

3. **Login to Firebase**
```bash
firebase login
```

---

## STEP 1: ENABLE FIREBASE SERVICES

### 1.1 Enable Firestore
```bash
# Via Firebase Console:
https://console.firebase.google.com/project/nimbus-guardian/firestore

# Click "Create Database"
# Choose "Production mode"
# Select region: us-central1
```

### 1.2 Enable Cloud Functions
```bash
# Via Firebase Console:
https://console.firebase.google.com/project/nimbus-guardian/functions

# Functions are automatically enabled when you deploy
```

### 1.3 Enable Authentication (Anonymous)
```bash
# Via Firebase Console:
https://console.firebase.google.com/project/nimbus-guardian/authentication

# Click "Get started"
# Enable "Anonymous" sign-in method
```

---

## STEP 2: INSTALL DEPENDENCIES

```bash
# Install Functions dependencies
cd functions
npm install
cd ..
```

---

## STEP 3: DEPLOY FIRESTORE RULES & INDEXES

```bash
# Deploy security rules
firebase deploy --only firestore:rules

# Deploy indexes
firebase deploy --only firestore:indexes
```

**Expected Output**:
```
✔ Deploy complete!

Project Console: https://console.firebase.google.com/project/nimbus-guardian/firestore
```

---

## STEP 4: DEPLOY CLOUD FUNCTIONS

```bash
# Deploy all functions
firebase deploy --only functions

# Or deploy specific functions:
firebase deploy --only functions:validateLicense
firebase deploy --only functions:checkRateLimit
firebase deploy --only functions:syncUsage
firebase deploy --only functions:generateLicenseKey
```

**Expected Output**:
```
✔ functions[validateLicense(us-central1)]: Successful create operation.
✔ functions[checkRateLimit(us-central1)]: Successful create operation.
✔ functions[syncUsage(us-central1)]: Successful create operation.
✔ functions[generateLicenseKey(us-central1)]: Successful create operation.

Function URLs:
validateLicense: https://us-central1-nimbus-guardian.cloudfunctions.net/validateLicense
checkRateLimit: https://us-central1-nimbus-guardian.cloudfunctions.net/checkRateLimit
syncUsage: https://us-central1-nimbus-guardian.cloudfunctions.net/syncUsage
```

---

## STEP 5: GET FIREBASE CONFIG

Get your Firebase web app config:

```bash
# Via Firebase Console:
https://console.firebase.google.com/project/nimbus-guardian/settings/general

# Scroll to "Your apps"
# Click "Add app" → Web
# Register app: "Nimbus Dashboard"
# Copy the firebaseConfig object
```

**Example config**:
```javascript
const firebaseConfig = {
  apiKey: "AIzaSyAbCdEfGhIjKlMnOpQrStUvWxYz1234567",
  authDomain: "nimbus-guardian.firebaseapp.com",
  projectId: "nimbus-guardian",
  storageBucket: "nimbus-guardian.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abc123def456ghi789"
};
```

**Update** `public/dashboard.html` line 722 with real config.

---

## STEP 6: DEPLOY WEBSITE & DASHBOARD

```bash
# Deploy hosting (website + dashboard)
firebase deploy --only hosting
```

**Expected Output**:
```
✔ hosting: upload complete

Hosting URL: https://nimbus-guardian.web.app
```

---

## STEP 7: TEST FUNCTIONS

### 7.1 Generate Test License Key

```bash
# Call generateLicenseKey function (needs admin auth - use Firebase Console for now)
# Go to: https://console.firebase.google.com/project/nimbus-guardian/firestore

# Manually create a test license:
# Collection: licenses
# Document ID: NIMBUS-TEST-1234-5678-ABCD
# Fields:
{
  tier: "PRO",
  email: "test@example.com",
  status: "active",
  maxMachines: 3,
  machineIds: [],
  userId: null,
  createdAt: <current timestamp>
}
```

### 7.2 Test validateLicense

```bash
# From CLI (after updating CLI to use Firebase):
nimbus activate NIMBUS-TEST-1234-5678-ABCD

# Expected:
# ✅ License activated!
# Tier: PRO
# User ID: user_abc123def456
```

### 7.3 Test checkRateLimit

```bash
# The CLI will automatically call this before each scan
nimbus scan

# Expected:
# ✅ Starting scan...
# (scan runs normally)
```

---

## STEP 8: MONITOR & DEBUG

### View Function Logs
```bash
firebase functions:log

# Or in Firebase Console:
https://console.firebase.google.com/project/nimbus-guardian/functions/logs
```

### View Firestore Data
```bash
# Firebase Console:
https://console.firebase.google.com/project/nimbus-guardian/firestore/data
```

### Test Dashboard
```bash
# Visit:
https://nimbus-guardian.web.app/dashboard.html

# Should show demo data initially
# After CLI usage, will show real user data
```

---

## STEP 9: UPDATE CLI TO USE FIREBASE

Add Firebase SDK to CLI:

```bash
# In project root:
npm install firebase-admin node-fetch@2
```

**Update** `lib/account-manager.js`:
- Add Firebase sync on register
- Store userId locally

**Update** `lib/license-manager.js`:
- Call `validateLicense` Cloud Function on activation
- Store tier and userId

**Update** `lib/rate-limiter.js`:
- Call `checkRateLimit` before scans (FREE tier only, daily)
- Call `syncUsage` after scans (async, non-blocking)

---

## STEP 10: DEPLOYMENT CHECKLIST

### Before Going Live:
- [ ] Firestore rules deployed
- [ ] Cloud Functions deployed
- [ ] Website & dashboard deployed
- [ ] Firebase config updated in dashboard.html
- [ ] Test license created in Firestore
- [ ] Test CLI activation with test license
- [ ] Test FREE tier rate limiting
- [ ] Test dashboard loads real data
- [ ] Monitor function logs for errors

### Environment Variables:
```bash
# Set in Firebase Functions config:
firebase functions:config:set \
  stripe.secret_key="sk_live_..." \
  email.api_key="..." \
  admin.api_key="..."

# Deploy again to apply:
firebase deploy --only functions
```

---

## COST MONITORING

### Firebase FREE Tier Limits:
- **Firestore**: 50K reads/day, 20K writes/day, 1GB storage
- **Functions**: 125K invocations/month, 40K GB-seconds compute
- **Hosting**: 10GB storage, 360MB/day transfer

### Expected Usage (per user/day):
- **50 scans**: 50 writes (syncUsage) + 50 reads (checkRateLimit) = 100 ops
- **Supports**: ~200 active users on FREE tier

### If Exceeded:
- Upgrade to Blaze plan (pay-as-you-go)
- Expected cost: $25-50/month for 1,000-5,000 users

---

## TROUBLESHOOTING

### Error: "Permission denied"
```bash
# Check Firestore rules are deployed:
firebase deploy --only firestore:rules

# Check user is authenticated in dashboard
# (Anonymous auth should be enabled)
```

### Error: "Function not found"
```bash
# Redeploy functions:
firebase deploy --only functions

# Check function names match exactly:
# - validateLicense (not validate-license)
# - checkRateLimit (not check-rate-limit)
```

### Error: "CORS blocked"
```bash
# Functions v2 has CORS enabled by default
# If using v1, add CORS headers manually
```

### Dashboard shows "No user data"
```bash
# 1. Check Firebase config is correct
# 2. Check Anonymous auth is enabled
# 3. Check Firestore has users/{userId} document
# 4. Check browser console for errors
```

---

## ROLLBACK PLAN

### Rollback Functions
```bash
# List function versions:
firebase functions:list

# Rollback to previous version:
gcloud functions deploy validateLicense \
  --region=us-central1 \
  --runtime=nodejs18 \
  --trigger-http \
  --source=gs://path-to-previous-version
```

### Rollback Hosting
```bash
# Via Firebase Console:
https://console.firebase.google.com/project/nimbus-guardian/hosting

# Click "Release History"
# Click "..." → "Rollback"
```

### Rollback Firestore Rules
```bash
# Via Firebase Console:
https://console.firebase.google.com/project/nimbus-guardian/firestore/rules

# Click "Rules" → "History"
# Select previous version → "Rollback"
```

---

## NEXT STEPS AFTER DEPLOYMENT

1. **Generate real license keys** for customers
2. **Setup Stripe webhook** for automated license delivery
3. **Enable email notifications** (SendGrid/Mailgun)
4. **Add analytics** (Google Analytics 4)
5. **Monitor costs** in Firebase Console
6. **Scale up** to Blaze plan when needed

---

**© 2025 Paul Phillips - Clear Seas Solutions LLC**
**Contact**: chairman@parserator.com
