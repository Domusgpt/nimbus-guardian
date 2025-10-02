#!/usr/bin/env node

/**
 * Nimbus Guardian - Admin Tool
 * License management and administration
 *
 * © 2025 Paul Phillips - Clear Seas Solutions LLC
 * Contact: chairman@parserator.com
 */

const admin = require('firebase-admin');
const readline = require('readline');

// Initialize Firebase Admin SDK
const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || './serviceAccountKey.json';

try {
    const serviceAccount = require(serviceAccountPath);
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
    console.log('✅ Firebase Admin SDK initialized');
} catch (error) {
    console.error('❌ Failed to initialize Firebase Admin SDK');
    console.error('Please set GOOGLE_APPLICATION_CREDENTIALS or provide serviceAccountKey.json');
    console.error('Download from: https://console.firebase.google.com/project/nimbus-guardian/settings/serviceaccounts/adminsdk');
    process.exit(1);
}

const db = admin.firestore();
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function prompt(question) {
    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            resolve(answer);
        });
    });
}

// Generate license key
function generateLicenseKey() {
    const crypto = require('crypto');
    const generateSegment = () => crypto.randomBytes(2).toString('hex').toUpperCase();
    return `NIMBUS-${generateSegment()}-${generateSegment()}-${generateSegment()}-${generateSegment()}`;
}

async function createLicense() {
    console.log('\n📝 CREATE NEW LICENSE\n');

    const tier = await prompt('Tier (FREE/PRO/ENTERPRISE): ');
    if (!['FREE', 'PRO', 'ENTERPRISE'].includes(tier.toUpperCase())) {
        console.error('Invalid tier');
        return;
    }

    const email = await prompt('Email: ');
    if (!email.includes('@')) {
        console.error('Invalid email');
        return;
    }

    const maxMachinesInput = await prompt('Max machines (default: FREE=1, PRO=3, ENTERPRISE=10): ');
    const maxMachines = maxMachinesInput || (tier === 'FREE' ? 1 : tier === 'PRO' ? 3 : 10);

    const expiresInput = await prompt('Expires in days (leave blank for never): ');
    let expiresAt = null;
    if (expiresInput) {
        expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + parseInt(expiresInput));
    }

    const licenseKey = generateLicenseKey();

    try {
        await db.collection('licenses').doc(licenseKey).set({
            tier: tier.toUpperCase(),
            email: email,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            status: 'active',
            maxMachines: parseInt(maxMachines),
            machineIds: [],
            userId: null,
            expiresAt: expiresAt,
            createdBy: 'admin-tool'
        });

        console.log('\n✅ License created successfully!\n');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`License Key: ${licenseKey}`);
        console.log(`Tier: ${tier.toUpperCase()}`);
        console.log(`Email: ${email}`);
        console.log(`Max Machines: ${maxMachines}`);
        console.log(`Expires: ${expiresAt ? expiresAt.toISOString().split('T')[0] : 'Never'}`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        // Send email (TODO: implement email sending)
        console.log('📧 TODO: Email license to', email);

    } catch (error) {
        console.error('❌ Failed to create license:', error.message);
    }
}

async function listLicenses() {
    console.log('\n📋 ALL LICENSES\n');

    try {
        const snapshot = await db.collection('licenses').orderBy('createdAt', 'desc').limit(50).get();

        if (snapshot.empty) {
            console.log('No licenses found');
            return;
        }

        console.log('Key                           | Tier       | Email                    | Status   | Machines | Expires');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

        snapshot.forEach((doc) => {
            const license = doc.data();
            const key = doc.id.padEnd(30);
            const tier = (license.tier || 'N/A').padEnd(10);
            const email = (license.email || 'N/A').substring(0, 24).padEnd(24);
            const status = (license.status || 'N/A').padEnd(8);
            const machines = `${license.machineIds?.length || 0}/${license.maxMachines || 0}`.padEnd(8);
            const expires = license.expiresAt ?
                new Date(license.expiresAt.toDate()).toISOString().split('T')[0] :
                'Never';

            console.log(`${key} | ${tier} | ${email} | ${status} | ${machines} | ${expires}`);
        });

        console.log(`\nTotal: ${snapshot.size} licenses\n`);

    } catch (error) {
        console.error('❌ Failed to list licenses:', error.message);
    }
}

async function viewLicense() {
    const licenseKey = await prompt('\nLicense Key: ');

    try {
        const doc = await db.collection('licenses').doc(licenseKey).get();

        if (!doc.exists) {
            console.error('❌ License not found');
            return;
        }

        const license = doc.data();

        console.log('\n📄 LICENSE DETAILS\n');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`Key: ${doc.id}`);
        console.log(`Tier: ${license.tier}`);
        console.log(`Email: ${license.email}`);
        console.log(`Status: ${license.status}`);
        console.log(`Max Machines: ${license.maxMachines}`);
        console.log(`Activated Machines: ${license.machineIds?.length || 0}`);
        if (license.machineIds && license.machineIds.length > 0) {
            license.machineIds.forEach((id, i) => {
                console.log(`  ${i + 1}. ${id}`);
            });
        }
        console.log(`User ID: ${license.userId || 'Not activated'}`);
        console.log(`Created: ${license.createdAt ? new Date(license.createdAt.toDate()).toISOString() : 'N/A'}`);
        console.log(`Expires: ${license.expiresAt ? new Date(license.expiresAt.toDate()).toISOString() : 'Never'}`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        // Show usage if user exists
        if (license.userId) {
            const usageSnapshot = await db.collection('users').doc(license.userId)
                .collection('usage').orderBy('lastAction', 'desc').limit(7).get();

            if (!usageSnapshot.empty) {
                console.log('📊 RECENT USAGE (Last 7 days)\n');
                console.log('Date       | Scans | Fixes | AI Queries');
                console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

                usageSnapshot.forEach((doc) => {
                    const usage = doc.data();
                    const date = doc.id.padEnd(10);
                    const scans = (usage.scans || 0).toString().padStart(5);
                    const fixes = (usage.fixes || 0).toString().padStart(5);
                    const ai = (usage.ai || 0).toString().padStart(10);
                    console.log(`${date} | ${scans} | ${fixes} | ${ai}`);
                });
                console.log();
            }
        }

    } catch (error) {
        console.error('❌ Failed to view license:', error.message);
    }
}

async function revokeLicense() {
    const licenseKey = await prompt('\nLicense Key to revoke: ');
    const confirm = await prompt(`Are you sure you want to revoke ${licenseKey}? (yes/no): `);

    if (confirm.toLowerCase() !== 'yes') {
        console.log('Cancelled');
        return;
    }

    try {
        await db.collection('licenses').doc(licenseKey).update({
            status: 'revoked',
            revokedAt: admin.firestore.FieldValue.serverTimestamp(),
            revokedBy: 'admin-tool'
        });

        console.log('✅ License revoked successfully');

    } catch (error) {
        console.error('❌ Failed to revoke license:', error.message);
    }
}

async function setAdminClaim() {
    const email = await prompt('\nUser email to make admin: ');

    try {
        const user = await admin.auth().getUserByEmail(email);

        await admin.auth().setCustomUserClaims(user.uid, { admin: true });

        console.log(`✅ Admin claim set for ${email} (${user.uid})`);
        console.log('⚠️  User must sign out and sign in again for changes to take effect');

    } catch (error) {
        console.error('❌ Failed to set admin claim:', error.message);
    }
}

async function showStats() {
    console.log('\n📊 SYSTEM STATISTICS\n');

    try {
        // Count licenses
        const licensesSnapshot = await db.collection('licenses').get();
        const totalLicenses = licensesSnapshot.size;
        const activeLicenses = licensesSnapshot.docs.filter(doc => doc.data().status === 'active').length;
        const revokedLicenses = licensesSnapshot.docs.filter(doc => doc.data().status === 'revoked').length;

        // Count by tier
        const freeTier = licensesSnapshot.docs.filter(doc => doc.data().tier === 'FREE').length;
        const proTier = licensesSnapshot.docs.filter(doc => doc.data().tier === 'PRO').length;
        const enterpriseTier = licensesSnapshot.docs.filter(doc => doc.data().tier === 'ENTERPRISE').length;

        // Count users
        const usersSnapshot = await db.collection('users').get();
        const totalUsers = usersSnapshot.size;

        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('LICENSES');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`Total: ${totalLicenses}`);
        console.log(`Active: ${activeLicenses}`);
        console.log(`Revoked: ${revokedLicenses}`);
        console.log();
        console.log('BY TIER');
        console.log(`  FREE: ${freeTier}`);
        console.log(`  PRO: ${proTier}`);
        console.log(`  ENTERPRISE: ${enterpriseTier}`);
        console.log();
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('USERS');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`Total: ${totalUsers}`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    } catch (error) {
        console.error('❌ Failed to fetch stats:', error.message);
    }
}

async function mainMenu() {
    console.log('\n╔════════════════════════════════════════╗');
    console.log('║   NIMBUS GUARDIAN - ADMIN TOOL         ║');
    console.log('╚════════════════════════════════════════╝\n');
    console.log('1. Create License');
    console.log('2. List Licenses');
    console.log('3. View License Details');
    console.log('4. Revoke License');
    console.log('5. Set Admin Claim');
    console.log('6. Show Statistics');
    console.log('7. Exit\n');

    const choice = await prompt('Choose option: ');

    switch (choice) {
        case '1':
            await createLicense();
            break;
        case '2':
            await listLicenses();
            break;
        case '3':
            await viewLicense();
            break;
        case '4':
            await revokeLicense();
            break;
        case '5':
            await setAdminClaim();
            break;
        case '6':
            await showStats();
            break;
        case '7':
            console.log('\n👋 Goodbye!\n');
            rl.close();
            process.exit(0);
            return;
        default:
            console.log('Invalid option');
    }

    // Loop back to menu
    mainMenu();
}

// Start the admin tool
mainMenu();
