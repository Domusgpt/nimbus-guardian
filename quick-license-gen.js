#!/usr/bin/env node

/**
 * Quick License Generator (No Auth Required)
 * Bypasses Cloud Function by using Admin SDK directly
 */

const admin = require('firebase-admin');
const crypto = require('crypto');

// Try to initialize with existing app or create new one
try {
    admin.app();
    console.log('✅ Using existing Firebase app');
} catch (e) {
    // Initialize with application default credentials
    try {
        admin.initializeApp({
            credential: admin.credential.applicationDefault(),
            projectId: 'nimbus-guardian'
        });
        console.log('✅ Firebase initialized with default credentials');
    } catch (error) {
        console.error('❌ Failed to initialize Firebase');
        console.error('Run: gcloud auth application-default set-quota-project nimbus-guardian');
        process.exit(1);
    }
}

const db = admin.firestore();

function generateLicenseKey() {
    const generateSegment = () => crypto.randomBytes(2).toString('hex').toUpperCase();
    return `NIMBUS-${generateSegment()}-${generateSegment()}-${generateSegment()}-${generateSegment()}`;
}

async function createLicense(tier, email, maxMachines, expiresInDays) {
    const licenseKey = generateLicenseKey();

    let expiresAt = null;
    if (expiresInDays) {
        expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + expiresInDays);
    }

    const defaults = {
        'FREE': 1,
        'PRO': 3,
        'ENTERPRISE': 10
    };

    const licenseData = {
        tier: tier.toUpperCase(),
        email: email,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        status: 'active',
        maxMachines: maxMachines || defaults[tier.toUpperCase()] || 1,
        machineIds: [],
        userId: null,
        expiresAt: expiresAt,
        createdBy: 'quick-license-gen'
    };

    await db.collection('licenses').doc(licenseKey).set(licenseData);

    return { licenseKey, ...licenseData };
}

// Parse command line arguments
const args = process.argv.slice(2);

if (args.length < 2) {
    console.log('\n📝 Usage: node quick-license-gen.js <tier> <email> [maxMachines] [expiresInDays]');
    console.log('\nExamples:');
    console.log('  node quick-license-gen.js PRO customer@example.com');
    console.log('  node quick-license-gen.js PRO customer@example.com 5');
    console.log('  node quick-license-gen.js ENTERPRISE corp@example.com 10 365\n');
    console.log('Tiers: FREE, PRO, ENTERPRISE\n');
    process.exit(1);
}

const [tier, email, maxMachines, expiresInDays] = args;

(async () => {
    try {
        console.log('\n🎫 Creating license...\n');

        const license = await createLicense(
            tier,
            email,
            maxMachines ? parseInt(maxMachines) : undefined,
            expiresInDays ? parseInt(expiresInDays) : undefined
        );

        console.log('✅ License created successfully!\n');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📄 LICENSE DETAILS');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`Key:         ${license.licenseKey}`);
        console.log(`Tier:        ${license.tier}`);
        console.log(`Email:       ${license.email}`);
        console.log(`Max Machines: ${license.maxMachines}`);
        console.log(`Expires:     ${license.expiresAt ? license.expiresAt.toISOString().split('T')[0] : 'Never'}`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        console.log('🎯 To activate:');
        console.log(`   nimbus activate ${license.licenseKey}\n`);

        console.log('📧 Send to customer:');
        console.log(`   Subject: Your Nimbus Guardian ${license.tier} License`);
        console.log(`   Key: ${license.licenseKey}\n`);

        process.exit(0);

    } catch (error) {
        console.error('❌ Failed to create license:', error.message);
        process.exit(1);
    }
})();
