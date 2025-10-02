#!/usr/bin/env node

/**
 * Create Test Admin User
 * Sets up a temporary admin for testing license generation
 */

const admin = require('firebase-admin');

// Initialize with environment variable or default path
const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || './serviceAccountKey.json';

try {
    const serviceAccount = require(serviceAccountPath);
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
    console.log('✅ Firebase Admin SDK initialized');
} catch (error) {
    console.log('\n⚠️  No service account key found - using gcloud auth\n');

    // Try to initialize with application default credentials
    try {
        admin.initializeApp({
            credential: admin.credential.applicationDefault()
        });
        console.log('✅ Using application default credentials');
    } catch (err) {
        console.error('❌ Failed to initialize Firebase Admin SDK');
        console.error('Run: gcloud auth application-default login');
        process.exit(1);
    }
}

async function createTestAdmin() {
    console.log('\n🔧 Creating test admin user...\n');

    const testEmail = 'admin@nimbus-test.local';
    const testPassword = 'TestAdmin123!';

    try {
        // Try to get existing user first
        let user;
        try {
            user = await admin.auth().getUserByEmail(testEmail);
            console.log(`✅ Test user already exists: ${user.uid}`);
        } catch (error) {
            // Create new user if doesn't exist
            user = await admin.auth().createUser({
                email: testEmail,
                password: testPassword,
                displayName: 'Test Admin',
                disabled: false
            });
            console.log(`✅ Test user created: ${user.uid}`);
        }

        // Set admin custom claim
        await admin.auth().setCustomUserClaims(user.uid, { admin: true });
        console.log('✅ Admin claim set');

        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📧 TEST ADMIN CREDENTIALS');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`Email:    ${testEmail}`);
        console.log(`Password: ${testPassword}`);
        console.log(`UID:      ${user.uid}`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        // Get custom token for testing
        const customToken = await admin.auth().createCustomToken(user.uid);
        console.log('🔑 Custom Token (for API testing):');
        console.log(customToken);
        console.log('\n');

        return { user, customToken };

    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

async function testLicenseGeneration(customToken) {
    console.log('\n🧪 Testing license generation with admin token...\n');

    try {
        // Exchange custom token for ID token
        const response = await fetch(
            `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=AIzaSyCdJO1Y_s-s_phMrTmm6VDQG-pvNEtyPSI`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    token: customToken,
                    returnSecureToken: true
                })
            }
        );

        const authResult = await response.json();

        if (authResult.error) {
            throw new Error(authResult.error.message);
        }

        const idToken = authResult.idToken;
        console.log('✅ Got ID token');

        // Now test license generation
        console.log('🎫 Creating test license...\n');

        const licenseResponse = await fetch(
            'https://us-central1-nimbus-guardian.cloudfunctions.net/generateLicenseKey',
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`
                },
                body: JSON.stringify({
                    data: {
                        tier: 'PRO',
                        email: 'testcustomer@example.com',
                        maxMachines: 3,
                        expiresInDays: 365
                    }
                })
            }
        );

        const licenseResult = await licenseResponse.json();

        if (licenseResult.error) {
            console.error('❌ License generation failed:', licenseResult.error.message);
            return;
        }

        console.log('✅ License created successfully!\n');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📄 NEW LICENSE');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`Key:   ${licenseResult.result.licenseKey}`);
        console.log(`Tier:  ${licenseResult.result.tier}`);
        console.log(`Email: ${licenseResult.result.email}`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        console.log('🎯 To activate this license:');
        console.log(`nimbus activate ${licenseResult.result.licenseKey}\n`);

    } catch (error) {
        console.error('❌ Test failed:', error.message);
    }
}

// Run the script
(async () => {
    const { user, customToken } = await createTestAdmin();
    await testLicenseGeneration(customToken);

    console.log('✅ Setup complete!\n');
    console.log('You can now:');
    console.log('1. Use admin-tool.js with the service account key');
    console.log('2. Generate licenses via API using the admin token');
    console.log('3. Test the full license flow\n');

    process.exit(0);
})();
