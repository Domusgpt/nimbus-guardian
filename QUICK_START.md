# QUICK START - Firebase Backend Setup

**Goal**: Get dashboard and Cloud Functions live in 30 minutes

---

## STEP 1: Install Functions Dependencies (5 min)

```bash
cd functions
npm install
cd ..
```

---

## STEP 2: Enable Firestore (2 min)

1. Go to: https://console.firebase.google.com/project/nimbus-guardian/firestore
2. Click **"Create Database"**
3. Choose **"Production mode"**
4. Select location: **us-central1**
5. Click **"Enable"**

---

## STEP 3: Enable Anonymous Auth (1 min)

1. Go to: https://console.firebase.google.com/project/nimbus-guardian/authentication
2. Click **"Get started"**
3. Click **"Sign-in method"** tab
4. Enable **"Anonymous"**
5. Click **"Save"**

---

## STEP 4: Deploy Everything (10 min)

```bash
# Deploy Firestore rules
firebase deploy --only firestore:rules

# Deploy Firestore indexes
firebase deploy --only firestore:indexes

# Deploy Cloud Functions
firebase deploy --only functions

# Deploy hosting (website + dashboard)
firebase deploy --only hosting
```

**Expected output**:
```
✔ Deploy complete!

Functions:
- validateLicense: https://us-central1-nimbus-guardian.cloudfunctions.net/validateLicense
- checkRateLimit: https://us-central1-nimbus-guardian.cloudfunctions.net/checkRateLimit
- syncUsage: https://us-central1-nimbus-guardian.cloudfunctions.net/syncUsage
- generateLicenseKey: https://us-central1-nimbus-guardian.cloudfunctions.net/generateLicenseKey

Hosting:
https://nimbus-guardian.web.app
```

---

## STEP 5: Get Firebase Config (3 min)

1. Go to: https://console.firebase.google.com/project/nimbus-guardian/settings/general
2. Scroll to **"Your apps"**
3. If no web app exists:
   - Click **"Add app"** → **Web** (</> icon)
   - Name: "Nimbus Dashboard"
   - Click **"Register app"**
4. Copy the **firebaseConfig** object

**Example**:
```javascript
const firebaseConfig = {
  apiKey: "AIzaSyAbCd...",
  authDomain: "nimbus-guardian.firebaseapp.com",
  projectId: "nimbus-guardian",
  storageBucket: "nimbus-guardian.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abc123"
};
```

5. **Update** `public/dashboard.html` line 722:
   - Replace placeholder config with real config
   - Save file

6. **Redeploy hosting**:
```bash
firebase deploy --only hosting
```

---

## STEP 6: Create Test License (5 min)

1. Go to: https://console.firebase.google.com/project/nimbus-guardian/firestore/data
2. Click **"Start collection"**
3. Collection ID: **licenses**
4. Document ID: **NIMBUS-TEST-1234-5678-ABCD**
5. Add fields:

```
tier: "PRO" (string)
email: "test@example.com" (string)
status: "active" (string)
maxMachines: 3 (number)
machineIds: [] (array - leave empty)
userId: null (null)
createdAt: <click "timestamp" and select current time>
expiresAt: null (null)
```

6. Click **"Save"**

---

## STEP 7: Test Dashboard (2 min)

1. Visit: https://nimbus-guardian.web.app/dashboard.html
2. Open browser console (F12)
3. Should see:
   - ✅ "Nimbus Holographic Interface Loaded"
   - ✅ "No user data found - showing demo data"
4. Dashboard shows demo data (hardcoded)

**This is expected** - real data appears after CLI usage.

---

## STEP 8: Test Cloud Function (2 min)

Test the `validateLicense` function:

```bash
# Install Firebase CLI if not already:
npm install -g firebase-tools

# Call function directly:
firebase functions:shell

# In the shell:
validateLicense({ data: { licenseKey: 'NIMBUS-TEST-1234-5678-ABCD', machineId: 'test-machine', email: 'test@example.com' } })

# Expected output:
{
  success: true,
  userId: 'user_abc123...',
  tier: 'PRO',
  message: 'License activated successfully'
}

# Exit shell:
.exit
```

---

## TROUBLESHOOTING

### "Permission denied" in Firestore
```bash
# Redeploy rules:
firebase deploy --only firestore:rules
```

### "Function not found"
```bash
# Redeploy functions:
firebase deploy --only functions
```

### Dashboard shows blank page
```bash
# Check browser console for errors
# Make sure Firebase config is correct
# Make sure Anonymous auth is enabled
```

### "CORS blocked" error
```bash
# Functions v2 has CORS enabled by default
# If using v1, you need to manually add CORS headers
```

---

## VERIFICATION CHECKLIST

After completing all steps, verify:

- [ ] Firestore database exists in Firebase Console
- [ ] Cloud Functions are deployed (4 functions visible)
- [ ] Dashboard loads at https://nimbus-guardian.web.app/dashboard.html
- [ ] Test license exists in Firestore: `licenses/NIMBUS-TEST-1234-5678-ABCD`
- [ ] Firebase config is updated in dashboard.html
- [ ] No errors in browser console
- [ ] No errors in function logs: `firebase functions:log`

---

## WHAT'S NEXT

### Immediate:
You now have a **fully functional backend** for:
- License validation
- Rate limiting
- Usage tracking
- Dashboard (showing demo data)

### This Week:
**Update CLI to use Firebase backend**:
1. Add `firebase-admin` to `package.json`
2. Update `lib/license-manager.js` to call `validateLicense`
3. Update `lib/rate-limiter.js` to call `checkRateLimit` + `syncUsage`
4. Test activation: `nimbus activate NIMBUS-TEST-1234-5678-ABCD`
5. Test rate limiting: Run 51 scans
6. Verify dashboard shows real usage

### Next Week:
**Add Stripe integration**:
1. Create Stripe account
2. Add webhook handler to `functions/index.js`
3. Test payment → automated license generation
4. Launch publicly

---

## SUPPORT

**Questions?** Contact: chairman@parserator.com

**Documentation**:
- Full architecture: `FIREBASE_ARCHITECTURE.md`
- Deployment guide: `FIREBASE_DEPLOYMENT_GUIDE.md`
- Implementation summary: `IMPLEMENTATION_SUMMARY.md`

---

**© 2025 Paul Phillips - Clear Seas Solutions LLC**
