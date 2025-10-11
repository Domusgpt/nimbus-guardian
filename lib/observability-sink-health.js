'use strict';

const normalizeTimestamp = (value) => {
    if (!value) {
        return null;
    }

    if (value instanceof Date) {
        const time = value.getTime();
        return Number.isFinite(time) ? time : null;
    }

    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : null;
    }

    if (typeof value === 'string') {
        const parsed = Date.parse(value);
        return Number.isFinite(parsed) ? parsed : null;
    }

    return null;
};

const describeReason = (base, detail) => {
    if (detail) {
        return `${base}: ${detail}`;
    }
    return base;
};

const classifyDiskLog = (metrics) => {
    if (!metrics || typeof metrics !== 'object') {
        return {
            status: 'unknown',
            reason: 'No metrics reported for disk log sink'
        };
    }

    const delivery = metrics.delivery || {};
    const written = Number(delivery.writtenEntries) || 0;
    const failures = Number(delivery.failedEntries) || 0;
    const lastWrite = normalizeTimestamp(delivery.lastWriteAt);
    const lastFailure = normalizeTimestamp(delivery.lastFailureAt);

    if (written === 0 && failures === 0) {
        return {
            status: 'pending',
            reason: 'No observability snapshots have been written yet'
        };
    }

    if (failures > 0 && written === 0) {
        return {
            status: 'failing',
            reason: describeReason('Failed to persist any observability snapshots', delivery.lastErrorMessage)
        };
    }

    if (failures > 0 && lastFailure && (!lastWrite || lastFailure > lastWrite)) {
        return {
            status: 'degraded',
            reason: describeReason('Latest disk write attempt failed', delivery.lastErrorMessage)
        };
    }

    return {
        status: 'healthy',
        reason: 'Observability snapshots are being written to disk'
    };
};

const classifyWebhook = (metrics) => {
    if (!metrics || typeof metrics !== 'object') {
        return {
            status: 'unknown',
            reason: 'No metrics reported for webhook sink'
        };
    }

    const queue = metrics.queue || {};
    const delivery = metrics.delivery || {};
    const delivered = Number(delivery.deliveredBatches) || 0;
    const failed = Number(delivery.failedBatches) || 0;
    const pendingEntries = Number(queue.pendingEntries) || 0;
    const flushInFlight = Boolean(queue.flushInFlight);
    const lastSuccess = normalizeTimestamp(delivery.lastSuccessAt);
    const lastFailure = normalizeTimestamp(delivery.lastFailureAt);

    if (delivered === 0 && failed === 0) {
        return {
            status: 'pending',
            reason: 'No webhook deliveries have been attempted yet'
        };
    }

    if (failed > 0 && delivered === 0) {
        return {
            status: 'failing',
            reason: describeReason('All webhook deliveries have failed', delivery.lastErrorMessage)
        };
    }

    if (pendingEntries > 0 && !flushInFlight) {
        return {
            status: 'degraded',
            reason: `Waiting to flush ${pendingEntries} queued webhook payload(s)`
        };
    }

    if (failed > 0 && lastFailure && (!lastSuccess || lastFailure > lastSuccess)) {
        return {
            status: 'degraded',
            reason: describeReason('Most recent webhook delivery failed', delivery.lastErrorMessage)
        };
    }

    return {
        status: 'healthy',
        reason: 'Webhook deliveries are succeeding'
    };
};

const classifyGeneric = (metrics) => {
    if (!metrics || typeof metrics !== 'object') {
        return {
            status: 'unknown',
            reason: 'No metrics provided'
        };
    }

    return {
        status: 'unknown',
        reason: 'Health heuristics are not defined for this sink type'
    };
};

const evaluateSinkHealth = (name, metrics) => {
    const normalizedName = typeof name === 'string' ? name.trim().toLowerCase() : '';

    switch (normalizedName) {
        case 'disk-log':
            return classifyDiskLog(metrics);
        case 'webhook':
            return classifyWebhook(metrics);
        default:
            return classifyGeneric(metrics);
    }
};

module.exports = {
    evaluateSinkHealth
};
