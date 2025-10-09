const crypto = require('crypto');
const {getAdmin} = require('./firebase');

function normalizeEmail(email) {
    return (email || '').trim().toLowerCase();
}

function generateUserId() {
    return `user_${crypto.randomBytes(8).toString('hex')}`;
}

async function findUserByEmail(db, emailLower) {
    if (!emailLower) {
        return null;
    }

    const snapshot = await db
        .collection('users')
        .where('account.emailLower', '==', emailLower)
        .limit(1)
        .get();

    if (snapshot.empty) {
        return null;
    }

    const doc = snapshot.docs[0];
    return {
        ref: doc.ref,
        data: doc.data(),
        id: doc.id
    };
}

async function upsertUserAccount({
    email,
    projectName,
    useCase,
    machineId,
    license,
    userId,
    tier: tierOverride
}, {adminOverride} = {}) {
    const admin = adminOverride || getAdmin();
    const db = admin.firestore();
    const FieldValue = admin.firestore.FieldValue;

    if (!email) {
        throw new Error('Email is required to upsert user account');
    }

    const emailLower = normalizeEmail(email);

    let existingDoc = null;
    let ref = null;
    let resolvedUserId = userId || null;

    if (userId) {
        const userSnapshot = await db.collection('users').doc(userId).get();
        if (userSnapshot.exists) {
            existingDoc = {
                id: userSnapshot.id,
                ref: userSnapshot.ref,
                data: userSnapshot.data()
            };
            ref = userSnapshot.ref;
            resolvedUserId = userSnapshot.id;
        } else {
            ref = db.collection('users').doc(userId);
            resolvedUserId = userId;
        }
    }

    if (!ref) {
        const found = await findUserByEmail(db, emailLower);
        if (found) {
            existingDoc = found;
            ref = found.ref;
            resolvedUserId = found.id;
        }
    }

    if (!ref) {
        resolvedUserId = generateUserId();
        ref = db.collection('users').doc(resolvedUserId);
    }

    const previousData = existingDoc?.data || {};
    const previousAccount = previousData.account || {};
    const previousLicense = previousData.license || {};

    const now = FieldValue.serverTimestamp();

    const account = {
        ...previousAccount,
        email,
        emailLower,
        updatedAt: now,
    };

    if (!previousAccount.registeredAt) {
        account.registeredAt = now;
    }

    if (projectName) {
        account.projectName = projectName;
    }

    if (typeof useCase === 'string' && useCase.length > 0) {
        account.useCase = useCase;
    }

    if (machineId) {
        account.machineId = machineId;
    }

    const resolvedTier = license?.tier || tierOverride || previousAccount.tier || 'FREE';
    account.tier = resolvedTier;

    const payload = {
        account,
        lastSyncedAt: now,
    };

    if (license) {
        payload.license = {
            ...previousLicense,
            key: license.key,
            tier: license.tier,
            activatedAt: previousLicense.activatedAt || now,
            lastValidatedAt: now,
        };

        if (license.expiresAt) {
            payload.license.expiresAt = license.expiresAt;
        } else if (previousLicense.expiresAt) {
            payload.license.expiresAt = previousLicense.expiresAt;
        }
    }

    if (machineId) {
        payload.machines = FieldValue.arrayUnion(machineId);
    }

    await ref.set(payload, {merge: true});

    return {
        userId: resolvedUserId,
        tier: resolvedTier,
        existed: Boolean(existingDoc)
    };
}

module.exports = {
    normalizeEmail,
    generateUserId,
    upsertUserAccount,
};
