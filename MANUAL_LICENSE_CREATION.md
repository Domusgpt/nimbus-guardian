# 📝 Manual License Creation Guide

Since we don't have service account credentials set up, here's how to create licenses manually until you can run the admin tool.

---

## Option 1: Firebase Console (Easiest - 2 minutes)

### Step 1: Go to Firestore
https://console.firebase.google.com/project/nimbus-guardian/firestore/data

### Step 2: Create License Document
1. Click "Start collection"
2. Collection ID: `licenses`
3. Click "Next"

4. Document ID: `NIMBUS-TEST-0001-0002-0003-0004` (or any format matching NIMBUS-XXXX-XXXX-XXXX-XXXX)

5. Add fields:
   - `tier` (string): `PRO`
   - `email` (string): `test@example.com`
   - `status` (string): `active`
   - `maxMachines` (number): `3`
   - `machineIds` (array): [] (empty array)
   - `userId` (null): leave null
   - `createdAt` (timestamp): Click "..." → "Use server timestamp"
   - `expiresAt` (null): leave null
   - `createdBy` (string): `manual`

6. Click "Save"

### Step 3: Test Activation
```bash
nimbus activate NIMBUS-TEST-0001-0002-0003-0004
```

---

## Option 2: Using Existing License (Fastest - 10 seconds)

We already have a test license created!

```bash
nimbus activate NIMBUS-8F7D-EE57-582C-EBCB
```

**License Details:**
- Key: `NIMBUS-8F7D-EE57-582C-EBCB`
- Tier: PRO
- Max Machines: 3
- Status: Active
- Already tested and working ✅

---

## Option 3: gcloud Command (Advanced)

```bash
# Create license via gcloud firestore
gcloud firestore documents create \
  --project=nimbus-guardian \
  --collection=licenses \
  --document-id=NIMBUS-$(openssl rand -hex 2 | tr '[:lower:]' '[:upper:]')-$(openssl rand -hex 2 | tr '[:lower:]' '[:upper:]')-$(openssl rand -hex 2 | tr '[:lower:]' '[:upper:]')-$(openssl rand -hex 2 | tr '[:lower:]' '[:upper:]') \
  --data='{"tier":"PRO","email":"test@example.com","status":"active","maxMachines":3,"machineIds":[],"userId":null,"createdBy":"gcloud"}'
```

---

## Option 4: REST API (For Automation)

```bash
# Get access token
ACCESS_TOKEN=$(gcloud auth application-default print-access-token)

# Generate license key
LICENSE_KEY="NIMBUS-$(openssl rand -hex 2 | tr '[:lower:]' '[:upper:]')-$(openssl rand -hex 2 | tr '[:lower:]' '[:upper:]')-$(openssl rand -hex 2 | tr '[:lower:]' '[:upper:]')-$(openssl rand -hex 2 | tr '[:lower:]' '[:upper:]')"

# Create document
curl -X PATCH \
  "https://firestore.googleapis.com/v1/projects/nimbus-guardian/databases/(default)/documents/licenses/$LICENSE_KEY" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "fields": {
      "tier": {"stringValue": "PRO"},
      "email": {"stringValue": "test@example.com"},
      "status": {"stringValue": "active"},
      "maxMachines": {"integerValue": "3"},
      "machineIds": {"arrayValue": {"values": []}},
      "userId": {"nullValue": null},
      "createdAt": {"timestampValue": "'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'"},
      "expiresAt": {"nullValue": null},
      "createdBy": {"stringValue": "rest-api"}
    }
  }'

echo "License created: $LICENSE_KEY"
```

---

## Testing the Flow

### 1. Deactivate Current License (if any)
```bash
rm ~/.nimbus/license.json
```

### 2. Activate License
```bash
nimbus activate NIMBUS-8F7D-EE57-582C-EBCB
# or your newly created license key
```

### 3. Check Status
```bash
nimbus account
```

### 4. Test Scan
```bash
cd /path/to/test/project
nimbus scan
```

Should see:
- Rate limit check passes
- "unlimited scans remaining" (PRO tier)
- Scan completes
- Usage synced to Firestore

### 5. Verify in Firestore
https://console.firebase.google.com/project/nimbus-guardian/firestore/data/~2Fusers~2F{userId}~2Fusage

You should see today's usage tracked!

---

## Quick Reference: License Tiers

| Tier | Scans/Day | AI Queries | Fixes/Day | Max Machines |
|------|-----------|------------|-----------|--------------|
| FREE | 50 | 0 | 20 | 1 |
| PRO | Unlimited | Unlimited | Unlimited | 3 |
| ENTERPRISE | Unlimited | Unlimited | Unlimited | 10 |

---

## Troubleshooting

### "Invalid license key"
- Check format: `NIMBUS-XXXX-XXXX-XXXX-XXXX` (all caps, hex characters)
- Verify it exists in Firestore
- Check `status` field is `active`

### "License already activated on X machines"
- Check `machineIds` array in Firestore
- Current machine ID shown in activation error
- Either increase `maxMachines` or remove a machine ID from array

### "License has expired"
- Check `expiresAt` field in Firestore
- Set to `null` for no expiration
- Or update to future date

---

## Setting Up Admin Tool (Future)

Once you have a service account key:

1. Download from: https://console.firebase.google.com/project/nimbus-guardian/settings/serviceaccounts/adminsdk
2. Click "Generate new private key"
3. Save as `serviceAccountKey.json` in project root
4. Run: `node admin-tool.js`

Then you can create licenses via the interactive CLI tool!

---

**© 2025 Paul Phillips - Clear Seas Solutions LLC**

For now, use Option 2 (existing test license) to test the full flow!
