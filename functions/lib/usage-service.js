const {getAdmin} = require('./firebase');

const ACTIONS = new Set(['scans', 'ai', 'fixes']);

const LIMITS = {
    FREE: {
        scans: {perDay: 50, perHour: 10},
        ai: {perMonth: 0},
        fixes: {perDay: 20},
    },
    PRO: {
        scans: {perDay: Infinity, perHour: Infinity},
        ai: {perMonth: Infinity},
        fixes: {perDay: Infinity},
    },
    ENTERPRISE: {
        scans: {perDay: Infinity, perHour: Infinity},
        ai: {perMonth: Infinity},
        fixes: {perDay: Infinity},
    }
};

function resolveTierLimits(tier) {
    return LIMITS[tier] || LIMITS.FREE;
}

function getDateParts(now = new Date()) {
    const iso = now.toISOString();
    const [date, time] = iso.split('T');
    const hour = time.slice(0, 2);
    return {date, hour};
}

function formatHourKey(datePart, hourPart) {
    return `${datePart}T${hourPart}`;
}

function sanitizeMetadata(metadata) {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
        return null;
    }
    try {
        return JSON.parse(JSON.stringify(metadata));
    } catch (error) {
        return null;
    }
}

async function recordUsageEvent({userId, action, metadata = null, now = new Date()}, {adminOverride} = {}) {
    if (!userId) {
        throw new Error('userId is required to record usage');
    }

    if (!ACTIONS.has(action)) {
        throw new Error(`Unsupported usage action: ${action}`);
    }

    const admin = adminOverride || getAdmin();
    const db = admin.firestore();
    const FieldValue = admin.firestore.FieldValue;

    const {date, hour} = getDateParts(now);
    const usageRef = db
        .collection('users')
        .doc(userId)
        .collection('usage')
        .doc(date);

    const metadataPayload = sanitizeMetadata(metadata);

    const updatePayload = {
        actions: {
            [action]: FieldValue.increment(1)
        },
        hourly: {
            [formatHourKey(date, hour)]: {
                [action]: FieldValue.increment(1)
            }
        },
        lastActionAt: FieldValue.serverTimestamp(),
    };

    if (metadataPayload) {
        updatePayload.lastMetadata = metadataPayload;
    }

    await usageRef.set(updatePayload, {merge: true});

    const snapshot = await usageRef.get();
    const stored = snapshot.exists ? snapshot.data() : {};

    const totalActions = stored.actions?.[action] || 0;
    const hourlyBucket = stored.hourly?.[formatHourKey(date, hour)]?.[action] || 0;

    return {
        date,
        hour,
        action,
        totalActions,
        hourlyActions: hourlyBucket,
        lastMetadata: stored.lastMetadata || null,
    };
}

function computeResetAt(now, type) {
    const next = new Date(now);
    if (type === 'day') {
        next.setUTCHours(0, 0, 0, 0);
        next.setUTCDate(next.getUTCDate() + 1);
        return next.toISOString();
    }

    if (type === 'hour') {
        next.setUTCMinutes(0, 0, 0);
        next.setUTCHours(next.getUTCHours() + 1);
        return next.toISOString();
    }

    return null;
}

async function checkUsageAllowance({userId, action, tier, now = new Date()}, {adminOverride} = {}) {
    if (!userId) {
        throw new Error('userId is required to check usage');
    }

    if (!ACTIONS.has(action)) {
        throw new Error(`Unsupported usage action: ${action}`);
    }

    const admin = adminOverride || getAdmin();
    const db = admin.firestore();

    const limits = resolveTierLimits(tier);
    const actionLimits = limits[action];

    if (!actionLimits) {
        throw new Error(`No rate limit configuration for action: ${action}`);
    }

    if (actionLimits.perMonth === 0) {
        return {
            allowed: false,
            reason: 'AI usage is not available on the Free tier',
            upgrade: 'https://nimbus-guardian.web.app/#pricing',
            tier: tier || 'FREE',
        };
    }

    const {date, hour} = getDateParts(now);
    const usageRef = db
        .collection('users')
        .doc(userId)
        .collection('usage')
        .doc(date);

    const snapshot = await usageRef.get();
    const usage = snapshot.exists ? snapshot.data() : {};
    const total = usage.actions?.[action] || 0;
    const hourlyBucket = usage.hourly?.[formatHourKey(date, hour)]?.[action] || 0;

    if (actionLimits.perDay !== undefined && actionLimits.perDay !== Infinity) {
        if (total >= actionLimits.perDay) {
            return {
                allowed: false,
                reason: `Rate limit exceeded: ${actionLimits.perDay} ${action} per day`,
                resetAt: computeResetAt(now, 'day'),
                upgrade: 'https://nimbus-guardian.web.app/#pricing',
                tier: tier || 'FREE',
            };
        }
    }

    if (actionLimits.perHour !== undefined && actionLimits.perHour !== Infinity) {
        if (hourlyBucket >= actionLimits.perHour) {
            return {
                allowed: false,
                reason: `Rate limit exceeded: ${actionLimits.perHour} ${action} per hour`,
                resetAt: computeResetAt(now, 'hour'),
                upgrade: 'https://nimbus-guardian.web.app/#pricing',
                tier: tier || 'FREE',
            };
        }
    }

    const remaining = actionLimits.perDay === Infinity
        ? 'unlimited'
        : (actionLimits.perDay === undefined ? undefined : actionLimits.perDay - total);

    return {
        allowed: true,
        remaining,
        tier: tier || 'FREE',
    };
}

module.exports = {
    recordUsageEvent,
    checkUsageAllowance,
    resolveTierLimits,
};
