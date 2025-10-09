const {getAdmin} = require('./firebase');
const {recordAdminEvent} = require('./admin-events');

function requireString(value, fieldName) {
    if (!value || typeof value !== 'string') {
        throw new Error(`${fieldName} must be a non-empty string`);
    }
    const trimmed = value.trim();
    if (!trimmed) {
        throw new Error(`${fieldName} must be a non-empty string`);
    }
    return trimmed;
}

function optionalString(value, fieldName) {
    if (value === undefined || value === null) {
        return null;
    }
    if (typeof value !== 'string') {
        throw new Error(`${fieldName} must be a string`);
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

function ensurePlainObject(value, fieldName) {
    if (value === undefined || value === null) {
        return {};
    }
    if (typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`${fieldName} must be an object`);
    }
    return JSON.parse(JSON.stringify(value));
}

function ensureNumber(value, fieldName) {
    if (value === undefined || value === null) {
        throw new Error(`${fieldName} must be provided`);
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        throw new Error(`${fieldName} must be a finite number`);
    }
    return parsed;
}

function coerceDate(value, fieldName, {allowNull = false, defaultValue} = {}) {
    if (value === undefined || value === null) {
        if (allowNull) {
            return null;
        }
        if (defaultValue !== undefined) {
            return defaultValue instanceof Date ? defaultValue : new Date(defaultValue);
        }
        throw new Error(`${fieldName} must be provided`);
    }

    if (value instanceof Date) {
        return value;
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.valueOf())) {
        throw new Error(`${fieldName} must be a valid date`);
    }
    return parsed;
}

function sanitizeLimit(limit, fallback) {
    const parsed = Number(limit);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return fallback;
    }
    return Math.min(Math.floor(parsed), 100);
}

function toIso(value) {
    if (!value) {
        return null;
    }
    if (value instanceof Date) {
        return value.toISOString();
    }
    if (typeof value === 'number') {
        return new Date(value).toISOString();
    }
    if (typeof value === 'string') {
        const parsed = new Date(value);
        return Number.isNaN(parsed.valueOf()) ? null : parsed.toISOString();
    }
    return null;
}

async function recordDeploymentEvent(input, {adminOverride} = {}) {
    const admin = adminOverride || getAdmin();
    const db = admin.firestore();
    const FieldValue = admin.firestore.FieldValue;

    const projectId = requireString(input.projectId, 'projectId');
    const provider = requireString(input.provider, 'provider');
    const environment = requireString(input.environment || input.env, 'environment');
    const status = requireString(input.status, 'status');
    const startedAt = coerceDate(input.startedAt, 'startedAt', {defaultValue: new Date()});
    const completedAt = coerceDate(input.completedAt, 'completedAt', {allowNull: true});
    const recordedAt = coerceDate(input.recordedAt, 'recordedAt', {defaultValue: new Date()});
    const commit = optionalString(input.commit, 'commit');
    const trigger = optionalString(input.trigger, 'trigger');
    const url = optionalString(input.url, 'url');
    const version = optionalString(input.version, 'version');
    const release = optionalString(input.release, 'release');
    const metadata = ensurePlainObject(input.metadata, 'metadata');

    const payload = {
        projectId,
        provider,
        environment,
        status,
        commit,
        trigger,
        url,
        version,
        release,
        metadata,
        startedAt,
        completedAt,
        recordedAt,
        recordedAtSource: FieldValue.serverTimestamp(),
    };

    const docRef = await db.collection('deploymentEvents').add(payload);

    await db.collection('projects').doc(projectId).set({
        projectId,
        telemetry: {
            lastDeployment: {
                id: docRef.id,
                provider,
                environment,
                status,
                commit,
                trigger,
                recordedAt,
            },
            providers: FieldValue.arrayUnion(provider),
        }
    }, {merge: true});

    await recordAdminEvent('DEPLOYMENT_RECORDED', {
        projectId,
        provider,
        environment,
        status,
        deploymentId: docRef.id,
    }, {adminOverride: admin});

    return {deploymentId: docRef.id};
}

async function listDeploymentsForProject({projectId, limit, provider}, {adminOverride} = {}) {
    const admin = adminOverride || getAdmin();
    const db = admin.firestore();
    const normalizedProjectId = requireString(projectId, 'projectId');
    const resolvedLimit = sanitizeLimit(limit, 20);

    let query = db.collection('deploymentEvents').where('projectId', '==', normalizedProjectId);
    const snapshot = await query.get();

    if (snapshot.empty) {
        return {
            projectId: normalizedProjectId,
            entries: [],
            summary: null,
        };
    }

    let entries = snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
            id: doc.id,
            projectId: data.projectId,
            provider: data.provider,
            environment: data.environment,
            status: data.status,
            commit: data.commit || null,
            trigger: data.trigger || null,
            url: data.url || null,
            version: data.version || null,
            release: data.release || null,
            metadata: data.metadata || {},
            startedAt: toIso(data.startedAt),
            completedAt: toIso(data.completedAt),
            recordedAt: toIso(data.recordedAt),
        };
    });

    if (provider) {
        entries = entries.filter((entry) => entry.provider === provider);
    }

    entries.sort((a, b) => {
        const aTime = Date.parse(a.startedAt || a.recordedAt || 0);
        const bTime = Date.parse(b.startedAt || b.recordedAt || 0);
        return bTime - aTime;
    });

    const sliced = entries.slice(0, resolvedLimit);

    const summary = sliced[0]
        ? {
            lastStatus: sliced[0].status,
            provider: sliced[0].provider,
            environment: sliced[0].environment,
            recordedAt: sliced[0].recordedAt,
            commit: sliced[0].commit,
        }
        : null;

    return {
        projectId: normalizedProjectId,
        entries: sliced,
        summary,
    };
}

async function recordGitHubInsight(input, {adminOverride} = {}) {
    const admin = adminOverride || getAdmin();
    const db = admin.firestore();
    const FieldValue = admin.firestore.FieldValue;

    const projectId = requireString(input.projectId, 'projectId');
    const owner = requireString(input.owner, 'owner');
    const repo = requireString(input.repo, 'repo');
    const fetchedAt = coerceDate(input.fetchedAt, 'fetchedAt', {defaultValue: new Date()});
    const stars = ensureNumber(input.stars, 'stars');
    const forks = ensureNumber(input.forks, 'forks');
    const openIssues = ensureNumber(input.openIssues, 'openIssues');
    const openPullRequests = ensureNumber(input.openPullRequests, 'openPullRequests');
    const watchers = input.watchers === undefined || input.watchers === null
        ? null
        : ensureNumber(input.watchers, 'watchers');
    const metadata = ensurePlainObject(input.metadata, 'metadata');
    const defaultBranch = optionalString(input.defaultBranch, 'defaultBranch');

    const payload = {
        projectId,
        owner,
        repo,
        stars,
        forks,
        openIssues,
        openPullRequests,
        watchers,
        defaultBranch,
        fetchedAt,
        recordedAt: fetchedAt,
        recordedAtSource: FieldValue.serverTimestamp(),
        metadata,
    };

    const docRef = await db.collection('githubInsights').add(payload);

    await db.collection('projects').doc(projectId).set({
        projectId,
        github: {
            owner,
            repo,
            stars,
            forks,
            openIssues,
            openPullRequests,
            watchers,
            defaultBranch,
            lastSyncedAt: fetchedAt,
        }
    }, {merge: true});

    await recordAdminEvent('GITHUB_INSIGHT_RECORDED', {
        projectId,
        owner,
        repo,
        stars,
        forks,
        openIssues,
        openPullRequests,
        insightId: docRef.id,
    }, {adminOverride: admin});

    return {insightId: docRef.id};
}

async function listGitHubInsightsForProject({projectId, limit}, {adminOverride} = {}) {
    const admin = adminOverride || getAdmin();
    const db = admin.firestore();
    const normalizedProjectId = requireString(projectId, 'projectId');
    const resolvedLimit = sanitizeLimit(limit, 30);

    const snapshot = await db
        .collection('githubInsights')
        .where('projectId', '==', normalizedProjectId)
        .get();

    if (snapshot.empty) {
        return {
            projectId: normalizedProjectId,
            entries: [],
            summary: null,
        };
    }

    const entries = snapshot.docs
        .map((doc) => {
            const data = doc.data();
            return {
                id: doc.id,
                projectId: data.projectId,
                owner: data.owner,
                repo: data.repo,
                stars: data.stars,
                forks: data.forks,
                openIssues: data.openIssues,
                openPullRequests: data.openPullRequests,
                watchers: data.watchers ?? null,
                defaultBranch: data.defaultBranch || null,
                fetchedAt: toIso(data.fetchedAt),
                recordedAt: toIso(data.recordedAt),
                metadata: data.metadata || {},
            };
        })
        .sort((a, b) => Date.parse(b.fetchedAt || b.recordedAt || 0) - Date.parse(a.fetchedAt || a.recordedAt || 0));

    const sliced = entries.slice(0, resolvedLimit);
    const latest = sliced[0] || null;
    const previous = sliced[1] || null;

    const summary = latest
        ? {
            projectId: latest.projectId,
            owner: latest.owner,
            repo: latest.repo,
            defaultBranch: latest.defaultBranch,
            fetchedAt: latest.fetchedAt,
            stars: latest.stars,
            forks: latest.forks,
            openIssues: latest.openIssues,
            openPullRequests: latest.openPullRequests,
            watchers: latest.watchers,
            deltas: {
                stars: previous ? latest.stars - previous.stars : null,
                forks: previous ? latest.forks - previous.forks : null,
                openIssues: previous ? latest.openIssues - previous.openIssues : null,
                openPullRequests: previous ? latest.openPullRequests - previous.openPullRequests : null,
                watchers: previous && latest.watchers !== null && previous.watchers !== null
                    ? latest.watchers - previous.watchers
                    : null,
            }
        }
        : null;

    return {
        projectId: normalizedProjectId,
        entries: sliced,
        summary,
    };
}

module.exports = {
    recordDeploymentEvent,
    listDeploymentsForProject,
    recordGitHubInsight,
    listGitHubInsightsForProject,
};
