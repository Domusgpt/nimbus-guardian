/**
 * Nimbus Guardian - Cloud Functions
 * License validation, usage tracking, and rate limiting
 *
 * © 2025 Paul Phillips - Clear Seas Solutions LLC
 * Contact: chairman@parserator.com
 */

const {onInit} = require("firebase-functions/v2/core");
const {onRequest, onCall, HttpsError} = require("firebase-functions/v2/https");
const {onDocumentCreated} = require("firebase-functions/v2/firestore");
const {getAdmin} = require("./lib/firebase");
const crypto = require("crypto");
const stripe = require("stripe");
const {createLicenseRecord, recordLicenseActivation} = require("./lib/license-service");
const {queueEmail} = require("./lib/notifications");
const {recordAdminEvent} = require("./lib/admin-events");
const {upsertUserAccount} = require("./lib/user-service");
const {
    recordDeploymentEvent,
    listDeploymentsForProject,
    recordGitHubInsight,
    listGitHubInsightsForProject,
} = require("./lib/telemetry-service");

// Defer initialization to avoid deployment timeout
onInit(() => {
    getAdmin().initializeApp();
});

// Get Firestore instance (will be initialized when function runs)
const getDb = (adminOverride) => (adminOverride || getAdmin()).firestore();

function requireAutomationAuth(request) {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "Authentication required for telemetry updates");
    }

    const token = request.auth.token || {};
    if (!token.admin && !token.automation) {
        throw new HttpsError("permission-denied", "Automation credentials required");
    }
}

// ============================================================================
// ACCOUNT REGISTRATION & SYNC
// ============================================================================

async function registerAccountHandler(data, {adminOverride} = {}) {
    const admin = adminOverride || getAdmin();
    const db = admin.firestore();
    const FieldValue = admin.firestore.FieldValue;

    const {
        email,
        projectName,
        useCase,
        machineId,
        licenseKey,
        userId,
        tier
    } = data || {};

    if (!email || typeof email !== "string" || !email.includes("@")) {
        throw new HttpsError("invalid-argument", "A valid email address is required");
    }

    let licenseDoc = null;
    let licenseRef = null;

    if (licenseKey) {
        licenseRef = db.collection("licenses").doc(licenseKey);
        const snapshot = await licenseRef.get();

        if (!snapshot.exists) {
            throw new HttpsError("not-found", "License key not found");
        }

        licenseDoc = snapshot.data();

        if (licenseDoc.status === "revoked") {
            throw new HttpsError("permission-denied", "License key has been revoked");
        }

        if (licenseDoc.expiresAt && licenseDoc.expiresAt.toDate && licenseDoc.expiresAt.toDate() < new Date()) {
            throw new HttpsError("permission-denied", "License key has expired");
        }
    }

    const licenseInfo = licenseDoc
        ? {
            key: licenseKey,
            tier: licenseDoc.tier,
            expiresAt: licenseDoc.expiresAt || null
        }
        : null;

    const {userId: resolvedUserId, tier: resolvedTier, existed} = await upsertUserAccount({
        email,
        projectName,
        useCase,
        machineId,
        license: licenseInfo,
        userId,
        tier
    }, {adminOverride: admin});

    if (licenseRef) {
        const licenseUpdate = {
            userId: resolvedUserId,
            email,
            lastActivatedAt: FieldValue.serverTimestamp(),
        };

        if (machineId) {
            licenseUpdate.machineIds = FieldValue.arrayUnion(machineId);
        }

        await licenseRef.set(licenseUpdate, {merge: true});
    }

    await recordAdminEvent(existed ? "ACCOUNT_SYNCED" : "ACCOUNT_REGISTERED", {
        userId: resolvedUserId,
        email,
        projectName: projectName || null,
        useCase: useCase || null,
        licenseKey: licenseKey || null,
        tier: resolvedTier
    }, {adminOverride: admin});

    return {
        success: true,
        userId: resolvedUserId,
        tier: resolvedTier,
        licenseLinked: Boolean(licenseKey),
        existingAccount: existed,
    };
}

exports.registerAccount = onCall({
    timeoutSeconds: 180,
    memory: "256MiB"
}, async (request) => {
    return registerAccountHandler(request.data || {});
});

// ============================================================================
// LICENSE VALIDATION
// ============================================================================

/**
 * Validate and activate license key
 * Called by CLI when user runs: nimbus activate <key>
 */
exports.validateLicense = onCall({
    timeoutSeconds: 180,
    memory: "256MiB"
}, async (request) => {
    const {licenseKey, machineId, email} = request.data;

    if (!licenseKey || !machineId) {
        throw new HttpsError("invalid-argument", "License key and machine ID required");
    }

    // Check if license exists
    const db = getDb();
    const licenseRef = db.collection("licenses").doc(licenseKey);
    const licenseDoc = await licenseRef.get();

    if (!licenseDoc.exists) {
        throw new HttpsError("not-found", "Invalid license key");
    }

    const license = licenseDoc.data();

    // Check if revoked
    if (license.status === "revoked") {
        throw new HttpsError("permission-denied", "License key has been revoked");
    }

    // Check if expired
    if (license.expiresAt && license.expiresAt.toDate() < new Date()) {
        throw new HttpsError("permission-denied", "License key has expired");
    }

    // Check machine limit
    const maxMachines = license.maxMachines || 1;
    const machineIds = license.machineIds || [];

    if (!machineIds.includes(machineId) && machineIds.length >= maxMachines) {
        throw new HttpsError(
            "resource-exhausted",
            `License already activated on ${maxMachines} machine(s)`
        );
    }

    // Add machine ID if new
    if (!machineIds.includes(machineId)) {
        machineIds.push(machineId);
        await licenseRef.update({
            machineIds: machineIds,
            lastActivatedAt: getAdmin().firestore.FieldValue.serverTimestamp(),
        });
    }

    // If first activation, assign user
    if (!license.userId) {
        // Create or get user
        const userId = `user_${crypto.randomBytes(8).toString("hex")}`;
        const db = getDb();
        await db.collection("users").doc(userId).set({
            account: {
                email: email || license.email || "unknown@example.com",
                registeredAt: getAdmin().firestore.FieldValue.serverTimestamp(),
                machineId: machineId,
                tier: license.tier,
            },
            license: {
                key: licenseKey,
                tier: license.tier,
                activatedAt: getAdmin().firestore.FieldValue.serverTimestamp(),
            },
        });

        await licenseRef.update({userId: userId});

        await recordLicenseActivation({
            licenseKey,
            userId,
            machineId
        });

        await queueEmail({
            to: email || license.email,
            template: "license-activated",
            data: {
                licenseKey,
                tier: license.tier,
                machineId
            }
        });

        return {
            success: true,
            userId: userId,
            tier: license.tier,
            message: "License activated successfully",
        };
    }

    await recordLicenseActivation({
        licenseKey,
        userId: license.userId,
        machineId
    });

    return {
        success: true,
        userId: license.userId,
        tier: license.tier,
        message: "License validated",
    };
});

// ============================================================================
// RATE LIMITING & USAGE TRACKING
// ============================================================================

/**
 * Check if user is within rate limits
 * Called by CLI before every scan/AI query
 */
exports.checkRateLimit = onCall({
    timeoutSeconds: 180,
    memory: "256MiB"
}, async (request) => {
    const {userId, action} = request.data;

    if (!userId || !action) {
        throw new HttpsError("invalid-argument", "User ID and action required");
    }

    // Get user account
    const db = getDb();
    const userDoc = await db.collection("users").doc(userId).get();
    if (!userDoc.exists) {
        throw new HttpsError("not-found", "User not found");
    }

    const user = userDoc.data();
    const tier = user.account.tier || "FREE";

    // Define rate limits
    const limits = {
        FREE: {
            scans: {perDay: 50, perHour: 10},
            ai: {perMonth: 0}, // No AI on free tier
            fixes: {perDay: 20},
        },
        PRO: {
            scans: {perDay: Infinity},
            ai: {perMonth: Infinity},
            fixes: {perDay: Infinity},
        },
        ENTERPRISE: {
            scans: {perDay: Infinity},
            ai: {perMonth: Infinity},
            fixes: {perDay: Infinity},
        },
    };

    const actionLimits = limits[tier][action];
    if (!actionLimits) {
        throw new HttpsError("invalid-argument", `Unknown action: ${action}`);
    }

    // Get today's usage
    const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
    const usageRef = db.collection("users").doc(userId).collection("usage").doc(today);
    const usageDoc = await usageRef.get();
    const usage = usageDoc.exists ? usageDoc.data() : {};

    const actionCount = usage[action] || 0;

    // Check daily limit
    if (actionLimits.perDay && actionCount >= actionLimits.perDay) {
        return {
            allowed: false,
            reason: `Rate limit exceeded: ${actionLimits.perDay} ${action}s per day`,
            resetAt: new Date(new Date().setHours(24, 0, 0, 0)).toISOString(),
            upgrade: "https://nimbus-guardian.web.app/#pricing",
        };
    }

    // Check hourly limit (approximate - check last hour's usage)
    if (actionLimits.perHour) {
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        const recentUsage = await db
            .collection("users")
            .doc(userId)
            .collection("usage")
            .where("lastAction", ">=", oneHourAgo)
            .get();

        let hourlyCount = 0;
        recentUsage.forEach((doc) => {
            hourlyCount += doc.data()[action] || 0;
        });

        if (hourlyCount >= actionLimits.perHour) {
            return {
                allowed: false,
                reason: `Rate limit exceeded: ${actionLimits.perHour} ${action}s per hour`,
                resetAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
                upgrade: "https://nimbus-guardian.web.app/#pricing",
            };
        }
    }

    return {
        allowed: true,
        remaining: actionLimits.perDay === Infinity ? "unlimited" : actionLimits.perDay - actionCount,
        tier: tier,
    };
});

/**
 * Record usage action
 * Called by CLI after every scan/AI query/fix
 */
exports.syncUsage = onCall({
    timeoutSeconds: 180,
    memory: "256MiB"
}, async (request) => {
    const {userId, action, metadata} = request.data;

    if (!userId || !action) {
        throw new HttpsError("invalid-argument", "User ID and action required");
    }

    const db = getDb();
    const today = new Date().toISOString().split("T")[0];
    const usageRef = db.collection("users").doc(userId).collection("usage").doc(today);

    // Increment counter
    await usageRef.set(
        {
            [action]: getAdmin().firestore.FieldValue.increment(1),
            lastAction: getAdmin().firestore.FieldValue.serverTimestamp(),
            metadata: metadata || {},
        },
        {merge: true}
    );

    return {
        success: true,
        message: "Usage recorded",
    };
});

// ============================================================================
// DEPLOYMENT & INSIGHT TELEMETRY
// ============================================================================

exports.recordDeploymentEvent = onCall({
    timeoutSeconds: 180,
    memory: "256MiB"
}, async (request) => {
    requireAutomationAuth(request);
    return recordDeploymentEvent(request.data || {});
});

exports.listDeployments = onCall({
    timeoutSeconds: 120,
    memory: "256MiB"
}, async (request) => {
    return listDeploymentsForProject(request.data || {});
});

exports.recordGitHubInsight = onCall({
    timeoutSeconds: 180,
    memory: "256MiB"
}, async (request) => {
    requireAutomationAuth(request);
    return recordGitHubInsight(request.data || {});
});

exports.listGitHubInsights = onCall({
    timeoutSeconds: 120,
    memory: "256MiB"
}, async (request) => {
    return listGitHubInsightsForProject(request.data || {});
});

// ============================================================================
// LICENSE GENERATION (ADMIN ONLY)
// ============================================================================

/**
 * Generate new license key
 * Called manually or by Stripe webhook
 * REQUIRES ADMIN AUTHENTICATION
 */
exports.generateLicenseKey = onCall({
    timeoutSeconds: 180,
    memory: "256MiB"
}, async (request) => {
    // CRITICAL SECURITY: Only admins can generate licenses
    if (!request.auth) {
        throw new HttpsError(
            "unauthenticated",
            "Authentication required to generate licenses"
        );
    }

    // Check for admin custom claim
    if (!request.auth.token.admin) {
        throw new HttpsError(
            "permission-denied",
            "Admin access required. Contact chairman@parserator.com for license generation."
        );
    }

    const {tier, email, maxMachines, expiresInDays} = request.data;

    if (!tier || !email) {
        throw new HttpsError("invalid-argument", "Tier and email required");
    }

    const {licenseKey} = await createLicenseRecord({
        tier,
        email,
        maxMachines,
        expiresInDays,
        source: "admin",
        metadata: {
            requestedBy: request.auth.uid || "admin",
        }
    });

    await queueEmail({
        to: email,
        template: "license-issued",
        data: {
            licenseKey,
            tier,
            expiresInDays: expiresInDays || null,
        }
    });

    return {
        success: true,
        licenseKey: licenseKey,
        tier: tier,
        email: email,
    };
});

// ============================================================================
// STRIPE WEBHOOK (FUTURE)
// ============================================================================

/**
 * Handle Stripe payment webhook
 * Automatically generates license key when payment succeeds
 */
async function processStripeEvent(event) {
    const eventType = event.type;
    const payload = event.data?.object || {};

    if (eventType !== "checkout.session.completed" && eventType !== "payment_intent.succeeded") {
        return {processed: false};
    }

    const customerEmail = payload.customer_details?.email || payload.receipt_email || payload.email || payload.metadata?.email;
    const tier = payload.metadata?.tier || "PRO";
    const maxMachines = payload.metadata?.maxMachines ? Number(payload.metadata.maxMachines) : undefined;
    const expiresInDays = payload.metadata?.expiresInDays ? Number(payload.metadata.expiresInDays) : undefined;

    const {licenseKey} = await createLicenseRecord({
        tier,
        email: customerEmail,
        maxMachines,
        expiresInDays,
        source: "stripe",
        metadata: {
            stripeEventId: event.id,
            stripeObject: payload.id,
            amountTotal: payload.amount_total || payload.amount_received || null,
        }
    });

    await queueEmail({
        to: customerEmail,
        template: "license-issued",
        data: {
            licenseKey,
            tier,
            expiresInDays: expiresInDays || null,
        }
    });

    await recordAdminEvent("STRIPE_LICENSE_FULFILLED", {
        eventId: event.id,
        licenseKey,
        tier,
        email: customerEmail,
    });

    return {
        processed: true,
        licenseKey
    };
}

exports.handleStripeWebhook = onRequest({
    timeoutSeconds: 180,
    memory: "256MiB"
}, async (req, res) => {
    if (req.method !== "POST") {
        res.status(405).send("Method Not Allowed");
        return;
    }

    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    let event;

    try {
        if (webhookSecret) {
            const stripeClient = stripe(process.env.STRIPE_SECRET_KEY || "");
            event = stripeClient.webhooks.constructEvent(
                req.rawBody,
                req.headers["stripe-signature"],
                webhookSecret
            );
        } else {
            event = req.body;
        }
    } catch (error) {
        console.error("Stripe webhook verification failed", error.message);
        res.status(400).send(`Webhook Error: ${error.message}`);
        return;
    }

    try {
        const result = await processStripeEvent(event);
        res.status(200).send({received: true, ...result});
    } catch (error) {
        console.error("Stripe webhook handler error", error);
        res.status(500).send({error: error.message});
    }
});

// ============================================================================
// FIRESTORE TRIGGERS
// ============================================================================

/**
 * Send welcome email when user registers
 */
async function handleUserCreated(event, {adminOverride} = {}) {
    const userData = event.data.data();
    const userId = event.params.userId;
    const db = getDb(adminOverride);

    console.log(`New user registered: ${userId}`, userData.account?.email);

    const today = new Date().toISOString().split("T")[0];
    await db
        .collection("users")
        .doc(userId)
        .collection("usage")
        .doc(today)
        .set({
            scans: 0,
            ai: 0,
            fixes: 0,
            lastAction: (adminOverride || getAdmin()).firestore.FieldValue.serverTimestamp(),
        });

    await queueEmail({
        to: userData.account?.email,
        template: "welcome",
        data: {
            tier: userData.license?.tier || "FREE",
            userId,
        }
    }, {adminOverride});

    await recordAdminEvent("USER_REGISTERED", {
        userId,
        tier: userData.license?.tier || "FREE",
    }, {adminOverride});
}

exports.onUserCreated = onDocumentCreated("users/{userId}", async (event) => {
    await handleUserCreated(event);
    return null;
});

/**
 * Track license activations
 */
exports.onLicenseActivated = onDocumentCreated("licenses/{licenseKey}", async (event) => {
    const licenseData = event.data.data();
    const licenseKey = event.params.licenseKey;

    console.log(`New license created: ${licenseKey}`, licenseData.tier);

    await recordAdminEvent("LICENSE_CREATED_TRIGGER", {
        licenseKey,
        tier: licenseData.tier,
        email: licenseData.email,
    });

    await queueEmail({
        to: licenseData.email,
        template: "license-issued",
        data: {
            licenseKey,
            tier: licenseData.tier,
            expiresInDays: null,
        }
    });

    return null;
});

exports.__internal = {
    processStripeEvent,
    handleUserCreated,
    registerAccountHandler,
    recordDeploymentEvent,
    listDeploymentsForProject,
    recordGitHubInsight,
    listGitHubInsightsForProject,
};
