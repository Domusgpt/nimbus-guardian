const crypto = require('crypto');
const {getAdmin} = require('./firebase');
const {recordAdminEvent} = require('./admin-events');

const DEFAULT_MACHINE_LIMITS = {
    FREE: 1,
    PRO: 3,
    ENTERPRISE: 10
};

const generateSegment = () => crypto.randomBytes(2).toString('hex').toUpperCase();

const generateLicenseKey = () => `NIMBUS-${generateSegment()}-${generateSegment()}-${generateSegment()}-${generateSegment()}`;

const resolveMaxMachines = (tier, override) => {
    if (typeof override === 'number' && override > 0) {
        return override;
    }
    const upperTier = (tier || '').toUpperCase();
    return DEFAULT_MACHINE_LIMITS[upperTier] || DEFAULT_MACHINE_LIMITS.FREE;
};

const computeExpirationDate = (expiresInDays) => {
    if (!expiresInDays) {
        return null;
    }
    const expires = new Date();
    expires.setUTCDate(expires.getUTCDate() + Number(expiresInDays));
    return expires;
};

async function createLicenseRecord({tier, email, maxMachines, expiresInDays, source = 'manual', metadata = {}}, {adminOverride} = {}) {
    if (!tier) {
        throw new Error('Tier required to generate license');
    }
    if (!email) {
        throw new Error('Customer email required to generate license');
    }

    const admin = adminOverride || getAdmin();
    const db = admin.firestore();
    const licenseKey = generateLicenseKey();
    const resolvedMaxMachines = resolveMaxMachines(tier, maxMachines);
    const expiresAt = computeExpirationDate(expiresInDays);

    const record = {
        tier,
        email,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        status: 'active',
        maxMachines: resolvedMaxMachines,
        machineIds: [],
        userId: null,
        expiresAt: expiresAt,
        source,
        metadata
    };

    await db.collection('licenses').doc(licenseKey).set(record);

    await recordAdminEvent('LICENSE_GENERATED', {
        licenseKey,
        tier,
        email,
        source,
        metadata,
        maxMachines: resolvedMaxMachines,
        expiresInDays: expiresInDays || null
    }, {adminOverride: admin});

    return {
        licenseKey,
        record
    };
}

async function recordLicenseActivation({licenseKey, userId, machineId}) {
    await recordAdminEvent('LICENSE_ACTIVATED', {
        licenseKey,
        userId,
        machineId
    });
}

module.exports = {
    createLicenseRecord,
    generateLicenseKey,
    resolveMaxMachines,
    computeExpirationDate,
    recordLicenseActivation
};
