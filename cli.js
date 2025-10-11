#!/usr/bin/env node

/**
 * Intelligent Cloud Guardian CLI
 * A Paul Phillips Manifestation - Paul@clearseassolutions.com
 * "The Revolution Will Not be in a Structured Format" © 2025
 */

const { program } = require('commander');
const inquirer = require('inquirer');
const chalk = require('chalk');
const ora = require('ora');
const boxen = require('boxen');
const path = require('path');
const fs = require('fs-extra');
const { loadConfig: loadGuardianConfig } = require('./lib/config-service');

const GuardianEngine = require('./guardian-engine');
const AIAssistant = require('./ai-assistant');
const setup = require('./setup');
const ObservabilityStreamClient = require('./lib/observability-stream-client');
const ObservabilityStatusClient = require('./lib/observability-status-client');

const parseHeaderOptions = (input, { onWarning } = {}) => {
    const list = input ? (Array.isArray(input) ? input : [input]) : [];
    const headers = {};

    for (const entry of list) {
        if (typeof entry !== 'string') {
            continue;
        }

        const separator = entry.indexOf(':');
        if (separator === -1) {
            onWarning?.(`Ignoring invalid header "${entry}". Use KEY:VALUE format.`);
            continue;
        }

        const key = entry.slice(0, separator).trim();
        const value = entry.slice(separator + 1).trim();

        if (!key || !value) {
            onWarning?.(`Ignoring invalid header "${entry}". Use KEY:VALUE format.`);
            continue;
        }

        headers[key] = value;
    }

    return headers;
};

const printMetricTree = (value, indent = '  ') => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        console.log(chalk.gray(`${indent}${JSON.stringify(value)}`));
        return;
    }

    const entries = Object.entries(value);
    if (entries.length === 0) {
        console.log(chalk.gray(`${indent}(no data)`));
        return;
    }

    for (const [key, child] of entries) {
        if (child && typeof child === 'object' && !Array.isArray(child)) {
            console.log(chalk.gray(`${indent}${key}:`));
            printMetricTree(child, `${indent}  `);
        } else {
            console.log(chalk.gray(`${indent}${key}: ${JSON.stringify(child)}`));
        }
    }
};

const formatSinkStatus = (status) => {
    const normalized = typeof status === 'string' ? status.toLowerCase() : 'unknown';
    switch (normalized) {
        case 'healthy':
            return chalk.green('healthy');
        case 'pending':
            return chalk.cyan('pending');
        case 'degraded':
            return chalk.yellow('degraded');
        case 'failing':
            return chalk.red('failing');
        default:
            return chalk.gray(normalized || 'unknown');
    }
};

const formatDeltaNumber = (value) => {
    if (!Number.isFinite(value)) {
        return chalk.gray('n/a');
    }
    if (value > 0) {
        return chalk.green(`+${value}`);
    }
    if (value < 0) {
        return chalk.red(`${value}`);
    }
    return chalk.gray('0');
};

const formatMaybeNumber = (value) => {
    if (Number.isFinite(value)) {
        return String(value);
    }
    if (value === null || value === undefined) {
        return 'n/a';
    }
    return String(value);
};

const formatDurationMs = (ms) => {
    if (!Number.isFinite(ms) || ms < 0) {
        return null;
    }

    const secondsTotal = Math.floor(ms / 1000);
    const parts = [];

    const days = Math.floor(secondsTotal / 86400);
    if (days > 0) {
        parts.push(`${days}d`);
    }

    const hours = Math.floor((secondsTotal % 86400) / 3600);
    if (hours > 0) {
        parts.push(`${hours}h`);
    }

    const minutes = Math.floor((secondsTotal % 3600) / 60);
    if (minutes > 0) {
        parts.push(`${minutes}m`);
    }

    const seconds = secondsTotal % 60;
    if (seconds > 0 || parts.length === 0) {
        parts.push(`${seconds}s`);
    }

    return parts.join(' ');
};

const normalizeListOption = (input) => {
    if (!input) {
        return [];
    }

    const list = Array.isArray(input) ? input : [input];
    const values = [];

    for (const entry of list) {
        if (typeof entry !== 'string') {
            continue;
        }

        const parts = entry.split(',');
        for (const part of parts) {
            const trimmed = part.trim();
            if (trimmed.length > 0) {
                values.push(trimmed);
            }
        }
    }

    return [...new Set(values)];
};

const printIncidentReport = (report) => {
    console.log(chalk.cyan('\n🚨 Observability incidents'));

    if (!report || typeof report !== 'object') {
        console.log(chalk.gray('  No incident data available.'));
        return;
    }

    if (typeof report.generatedAt === 'string') {
        console.log(chalk.gray(`  Generated at: ${report.generatedAt}`));
    }

    if (Number.isFinite(report.total)) {
        console.log(chalk.white(`  Total incidents observed: ${report.total}`));
    }

    if (Number.isFinite(report.open)) {
        console.log(chalk.white(`  Currently open: ${report.open}`));
    }

    if (Number.isFinite(report.longestDurationMs) && report.longestDurationMs > 0) {
        const durationLabel = formatDurationMs(report.longestDurationMs);
        if (durationLabel) {
            console.log(chalk.gray(`  Longest observed duration: ${durationLabel}`));
        }
    }

    const filters = report.filters && typeof report.filters === 'object'
        ? report.filters
        : {};

    const filterParts = [];
    if (Array.isArray(filters.statuses) && filters.statuses.length > 0) {
        filterParts.push(`status ∈ ${filters.statuses.join(', ')}`);
    }
    if (Array.isArray(filters.sinks) && filters.sinks.length > 0) {
        filterParts.push(`sink ∈ ${filters.sinks.join(', ')}`);
    }
    if (filters.open === true) {
        filterParts.push('open incidents only');
    }
    if (filters.open === false) {
        filterParts.push('closed incidents only');
    }
    if (Number.isFinite(filters.limit)) {
        filterParts.push(`limit ${filters.limit}`);
    }

    if (filterParts.length > 0) {
        console.log(chalk.gray(`  Filters: ${filterParts.join('; ')}`));
    } else {
        console.log(chalk.gray('  Filters: (none)'));
    }

    const matched = report.matched && typeof report.matched === 'object'
        ? report.matched
        : null;

    if (matched) {
        const total = Number.isFinite(matched.total) ? matched.total : 0;
        console.log(chalk.white(`  Matches: ${total}`));

        if (Number.isFinite(matched.open) || Number.isFinite(matched.closed)) {
            const openCount = Number.isFinite(matched.open) ? matched.open : 0;
            const closedCount = Number.isFinite(matched.closed) ? matched.closed : Math.max(total - openCount, 0);
            console.log(chalk.gray(`    open: ${openCount}`));
            console.log(chalk.gray(`    closed: ${closedCount}`));
        }

        if (matched.byStatus && typeof matched.byStatus === 'object' && Object.keys(matched.byStatus).length > 0) {
            console.log(chalk.gray('    by status:'));
            for (const [status, count] of Object.entries(matched.byStatus)) {
                console.log(chalk.gray(`      ${status}: ${count}`));
            }
        }

        if (matched.bySink && typeof matched.bySink === 'object' && Object.keys(matched.bySink).length > 0) {
            console.log(chalk.gray('    by sink:'));
            for (const [name, stats] of Object.entries(matched.bySink)) {
                const totalCount = Number.isFinite(stats.total) ? stats.total : 0;
                const openCount = Number.isFinite(stats.open) ? stats.open : 0;
                const closedCount = Math.max(totalCount - openCount, 0);
                console.log(chalk.gray(`      ${name}: ${totalCount} (open ${openCount}, closed ${closedCount})`));
            }
        }

        if (Number.isFinite(matched.displayed) && matched.displayed < (matched.total ?? matched.displayed)) {
            console.log(chalk.gray(`    showing first ${matched.displayed} incidents due to limit`));
        }
    }

    const records = Array.isArray(report.records) ? report.records : [];

    if (records.length === 0) {
        console.log(chalk.gray('\nNo incidents matched the current filters.'));
        return;
    }

    console.log(chalk.cyan('\n🧾 Incident ledger'));

    records.forEach((record, index) => {
        const sinkName = record?.sink || 'observability-sink';
        const statusLabel = formatSinkStatus(record?.status || 'unknown');
        const stateLabel = record?.open ? chalk.red('open') : chalk.gray('resolved');
        const prefix = chalk.white(`  ${index + 1}. ${sinkName}`);
        console.log(`${prefix} ${statusLabel} ${stateLabel}`);

        if (typeof record?.startedAt === 'string') {
            console.log(chalk.gray(`      started: ${record.startedAt}`));
        }

        if (typeof record?.endedAt === 'string') {
            console.log(chalk.gray(`      ended: ${record.endedAt}`));
        }

        if (Number.isFinite(record?.durationMs)) {
            const durationLabel = formatDurationMs(record.durationMs);
            if (durationLabel) {
                console.log(chalk.gray(`      duration: ${durationLabel}`));
            }
        }

        if (index !== records.length - 1) {
            console.log('');
        }
    });
};

const printHistoryOverview = (overview, indent = '  ') => {
    if (!overview || typeof overview !== 'object') {
        return false;
    }

    console.log(chalk.cyan('\n📈 History overview'));

    if (Number.isFinite(overview.totalSnapshots)) {
        console.log(chalk.white(`${indent}Snapshots: ${overview.totalSnapshots}`));
    }

    if (typeof overview.firstEmittedAt === 'string') {
        console.log(chalk.gray(`${indent}First snapshot: ${overview.firstEmittedAt}`));
    }

    if (typeof overview.lastEmittedAt === 'string') {
        console.log(chalk.gray(`${indent}Last snapshot: ${overview.lastEmittedAt}`));
    }

    if (Number.isFinite(overview.rangeMs)) {
        const durationLabel = formatDurationMs(overview.rangeMs);
        if (durationLabel) {
            console.log(chalk.gray(`${indent}Coverage window: ${durationLabel}`));
        }
    }

    const fingerprintOverview = overview.fingerprints;
    if (fingerprintOverview && typeof fingerprintOverview === 'object') {
        console.log(chalk.white(`${indent}Fingerprints:`));

        if (Number.isFinite(fingerprintOverview.latestTotalTracked)) {
            console.log(`${indent}  Latest total tracked: ${fingerprintOverview.latestTotalTracked}`);
        }

        const minTracked = fingerprintOverview.minTotalTracked;
        const maxTracked = fingerprintOverview.maxTotalTracked;
        if (Number.isFinite(minTracked) || Number.isFinite(maxTracked)) {
            const minLabel = Number.isFinite(minTracked) ? minTracked : 'n/a';
            const maxLabel = Number.isFinite(maxTracked) ? maxTracked : 'n/a';
            console.log(chalk.gray(`${indent}  Range: ${minLabel} → ${maxLabel}`));
        }

        if (Number.isFinite(fingerprintOverview.averageTotalTracked)) {
            console.log(chalk.gray(`${indent}  Avg total tracked: ${fingerprintOverview.averageTotalTracked}`));
        }

        if (Number.isFinite(fingerprintOverview.averageRecentCount)) {
            console.log(chalk.gray(`${indent}  Avg recent count: ${fingerprintOverview.averageRecentCount}`));
        }

        if (Number.isFinite(fingerprintOverview.maxRecentCount)) {
            console.log(chalk.gray(`${indent}  Max recent count: ${fingerprintOverview.maxRecentCount}`));
        }

        if (Number.isFinite(fingerprintOverview.maxActiveRecent)) {
            console.log(chalk.gray(`${indent}  Max active recent: ${fingerprintOverview.maxActiveRecent}`));
        }

        if (Number.isFinite(fingerprintOverview.uniqueRecentFingerprints)) {
            console.log(chalk.gray(`${indent}  Unique recent fingerprints: ${fingerprintOverview.uniqueRecentFingerprints}`));
        }

        if (Number.isFinite(fingerprintOverview.averageSessionCountTotal)) {
            console.log(chalk.gray(`${indent}  Avg session count total: ${fingerprintOverview.averageSessionCountTotal}`));
        }
    }

    const sinkOverview = overview.sinks;
    if (sinkOverview && typeof sinkOverview === 'object') {
        console.log(chalk.white(`${indent}Sinks:`));

        if (Number.isFinite(sinkOverview.uniqueSinks)) {
            console.log(`${indent}  Unique sinks observed: ${sinkOverview.uniqueSinks}`);
        }

        if (sinkOverview.statusCounts && typeof sinkOverview.statusCounts === 'object') {
            const entries = Object.entries(sinkOverview.statusCounts);
            if (entries.length > 0) {
                console.log(chalk.gray(`${indent}  Status appearances:`));
                for (const [status, count] of entries) {
                    const statusLabel = formatSinkStatus(status);
                    console.log(`    ${statusLabel}: ${count}`);
                }
            }
        }

        if (Number.isFinite(sinkOverview.totalStatusTransitions)) {
            console.log(chalk.gray(`${indent}  Status transitions: ${sinkOverview.totalStatusTransitions}`));
            if (sinkOverview.statusTransitions && typeof sinkOverview.statusTransitions === 'object') {
                for (const [key, count] of Object.entries(sinkOverview.statusTransitions)) {
                    console.log(chalk.gray(`${indent}    ${key}: ${count}`));
                }
            }
        }

        if (Number.isFinite(sinkOverview.unhealthySnapshots)) {
            console.log(chalk.yellow(`${indent}  Snapshots with unhealthy sinks: ${sinkOverview.unhealthySnapshots}`));
        }

        if (Number.isFinite(sinkOverview.metricsWithErrorsSnapshots)) {
            console.log(chalk.yellow(`${indent}  Snapshots with sink metric errors: ${sinkOverview.metricsWithErrorsSnapshots}`));
        }

        if (typeof sinkOverview.lastUnhealthyAt === 'string') {
            console.log(chalk.gray(`${indent}  Last unhealthy snapshot: ${sinkOverview.lastUnhealthyAt}`));
        }

        if (sinkOverview.incidents && typeof sinkOverview.incidents === 'object') {
            const incidents = sinkOverview.incidents;
            console.log(chalk.yellow(`${indent}  Incidents:`));

            if (Number.isFinite(incidents.total)) {
                console.log(chalk.gray(`${indent}    Total observed: ${incidents.total}`));
            }

            if (Number.isFinite(incidents.open)) {
                console.log(chalk.gray(`${indent}    Currently open: ${incidents.open}`));
            }

            if (incidents.byStatus && typeof incidents.byStatus === 'object') {
                const entries = Object.entries(incidents.byStatus);
                if (entries.length > 0) {
                    console.log(chalk.gray(`${indent}    By status:`));
                    for (const [status, count] of entries) {
                        console.log(chalk.gray(`${indent}      ${formatSinkStatus(status)}: ${count}`));
                    }
                }
            }

            if (Number.isFinite(incidents.longestDurationMs) && incidents.longestDurationMs > 0) {
                const durationLabel = formatDurationMs(incidents.longestDurationMs);
                if (durationLabel) {
                    console.log(chalk.gray(`${indent}    Longest duration: ${durationLabel}`));
                }
            }

            const records = Array.isArray(incidents.records) ? incidents.records : [];
            if (records.length > 0) {
                const limit = 3;
                const recent = records.slice(-limit);
                console.log(chalk.gray(`${indent}    Recent incidents:`));
                for (const record of recent) {
                    const statusLabel = formatSinkStatus(record?.status);
                    const startedAt = typeof record?.startedAt === 'string'
                        ? record.startedAt
                        : 'unknown';
                    const endedAt = typeof record?.endedAt === 'string'
                        ? record.endedAt
                        : record?.open ? 'ongoing' : 'unknown';
                    const durationLabel = Number.isFinite(record?.durationMs)
                        ? formatDurationMs(record.durationMs)
                        : null;

                    let line = `${indent}      ${record?.sink || 'observability-sink'}: ${statusLabel}`;
                    line += ` ${startedAt} → ${endedAt}`;

                    if (record?.open) {
                        line += ' (open)';
                    }

                    if (durationLabel) {
                        line += ` [${durationLabel}]`;
                    }

                    console.log(chalk.gray(line));
                }

                if (records.length > limit) {
                    console.log(chalk.gray(`${indent}    (showing last ${limit} of ${records.length})`));
                }
            }
        }
    }

    return true;
};

const printFingerprintDelta = (delta, indent = '  ') => {
    if (!delta || typeof delta !== 'object') {
        return false;
    }

    const lines = [];

    if (delta.totalTracked) {
        const { previous, current, delta: change } = delta.totalTracked;
        const changeLabel = formatDeltaNumber(change);
        const currentLabel = formatMaybeNumber(current);
        lines.push(`${indent}  Total tracked: ${changeLabel} (now ${currentLabel})`);
        if (Number.isFinite(previous)) {
            lines.push(chalk.gray(`${indent}    Previous total: ${previous}`));
        }
    }

    const recent = delta.recentFingerprints;
    if (recent && typeof recent === 'object') {
        if (Array.isArray(recent.added) && recent.added.length > 0) {
            const hashes = recent.added
                .map((entry) => {
                    const hash = entry?.fingerprintHash || 'unknown';
                    const count = Number.isFinite(entry?.sessionCount)
                        ? ` (sessions: ${entry.sessionCount})`
                        : '';
                    return `${hash}${count}`;
                });
            lines.push(chalk.green(`${indent}  Added fingerprints: ${hashes.join(', ')}`));
        }

        if (Array.isArray(recent.removed) && recent.removed.length > 0) {
            const hashes = recent.removed
                .map((entry) => {
                    const hash = entry?.fingerprintHash || 'unknown';
                    const count = Number.isFinite(entry?.sessionCount)
                        ? ` (was ${entry.sessionCount})`
                        : '';
                    return `${hash}${count}`;
                });
            lines.push(chalk.red(`${indent}  Removed fingerprints: ${hashes.join(', ')}`));
        }

        if (Array.isArray(recent.updated) && recent.updated.length > 0) {
            for (const entry of recent.updated) {
                const hash = entry?.fingerprintHash || 'unknown';
                const changeLabel = formatDeltaNumber(entry?.delta);
                const currentLabel = formatMaybeNumber(entry?.currentSessionCount);
                lines.push(`${indent}  ${hash}: ${changeLabel} sessions (now ${currentLabel})`);
            }
        }
    }

    if (lines.length === 0) {
        return false;
    }

    console.log(chalk.cyan(`${indent}Δ Fingerprint activity`));
    for (const line of lines) {
        console.log(line);
    }
    return true;
};

const printSinkDelta = (delta, indent = '  ') => {
    if (!delta || typeof delta !== 'object') {
        return false;
    }

    const lines = [];

    if (Array.isArray(delta.added) && delta.added.length > 0) {
        for (const entry of delta.added) {
            const name = entry?.name || 'observability-sink';
            const statusLabel = formatSinkStatus(entry?.status);
            lines.push(chalk.green(`${indent}  + ${name} (${statusLabel})`));
        }
    }

    if (Array.isArray(delta.removed) && delta.removed.length > 0) {
        for (const entry of delta.removed) {
            const name = entry?.name || 'observability-sink';
            const statusLabel = formatSinkStatus(entry?.status);
            lines.push(chalk.red(`${indent}  - ${name} (${statusLabel})`));
        }
    }

    if (Array.isArray(delta.statusChanges) && delta.statusChanges.length > 0) {
        for (const entry of delta.statusChanges) {
            const name = entry?.name || 'observability-sink';
            const currentLabel = formatSinkStatus(entry?.current);
            const previousLabel = formatSinkStatus(entry?.previous);
            lines.push(`${indent}  ${name} status: ${currentLabel}${chalk.gray(' (was ')}${previousLabel}${chalk.gray(')')}`);
        }
    }

    if (Array.isArray(delta.metricsChanged) && delta.metricsChanged.length > 0) {
        for (const entry of delta.metricsChanged) {
            const name = entry?.name || 'observability-sink';
            const metrics = entry?.metrics && typeof entry.metrics === 'object'
                ? Object.entries(entry.metrics)
                : [];
            if (metrics.length === 0) {
                continue;
            }
            lines.push(chalk.white(`${indent}  ${name} metrics:`));
            for (const [key, values] of metrics) {
                const changeLabel = formatDeltaNumber(values?.delta);
                const currentLabel = formatMaybeNumber(values?.current);
                lines.push(chalk.gray(`${indent}    ${key}: ${changeLabel} (now ${currentLabel})`));
            }
        }
    }

    if (lines.length === 0) {
        return false;
    }

    console.log(chalk.cyan(`${indent}Δ Sink changes`));
    for (const line of lines) {
        console.log(line);
    }
    return true;
};

const printSnapshotSummary = (summary, indent = '  ') => {
    if (!summary || typeof summary !== 'object') {
        return false;
    }

    const fingerprintSummary = summary.fingerprints;
    const sinkSummary = summary.sinks;

    const hasFingerprints = fingerprintSummary && typeof fingerprintSummary === 'object';
    const hasSinks = sinkSummary && typeof sinkSummary === 'object';

    if (!hasFingerprints && !hasSinks) {
        return false;
    }

    console.log(chalk.cyan(`${indent}Snapshot summary`));

    if (hasFingerprints) {
        const totalTracked = formatMaybeNumber(fingerprintSummary.totalTracked);
        const recentCount = Number.isFinite(fingerprintSummary.recentCount)
            ? fingerprintSummary.recentCount
            : 0;
        const activeRecent = Number.isFinite(fingerprintSummary.activeRecent)
            ? fingerprintSummary.activeRecent
            : 0;

        console.log(chalk.white(`${indent}  Fingerprints`));
        console.log(chalk.white(`${indent}    Total tracked: ${totalTracked}`));
        console.log(chalk.white(`${indent}    Recent listed: ${recentCount}`));
        console.log(chalk.white(`${indent}    Active recent: ${activeRecent}`));

        if (Number.isFinite(fingerprintSummary.sessionCountTotal)) {
            console.log(chalk.white(`${indent}    Recent session total: ${fingerprintSummary.sessionCountTotal}`));
        }

        if (Number.isFinite(fingerprintSummary.ttlMs)) {
            console.log(chalk.gray(`${indent}    TTL: ${fingerprintSummary.ttlMs}ms`));
        }

        if (fingerprintSummary.lastUpdatedAt) {
            console.log(chalk.gray(`${indent}    Last updated: ${fingerprintSummary.lastUpdatedAt}`));
        }
    }

    if (hasSinks) {
        console.log(chalk.white(`${indent}  Sinks`));

        const totalSinks = Number.isFinite(sinkSummary.total)
            ? sinkSummary.total
            : Array.isArray(sinkSummary) ? sinkSummary.length : 0;
        console.log(chalk.white(`${indent}    Registered: ${totalSinks}`));

        const statusCounts = sinkSummary.statusCounts && typeof sinkSummary.statusCounts === 'object'
            ? sinkSummary.statusCounts
            : {};
        const entries = Object.entries(statusCounts).sort((a, b) => a[0].localeCompare(b[0]));

        if (entries.length > 0) {
            for (const [status, count] of entries) {
                const label = formatSinkStatus(status);
                console.log(chalk.white(`${indent}    ${label}: ${count}`));
            }
        } else {
            console.log(chalk.gray(`${indent}    No sink status data.`));
        }

        if (Number.isFinite(sinkSummary.metricsAvailable)) {
            console.log(chalk.gray(`${indent}    Sinks with metrics: ${sinkSummary.metricsAvailable}`));
        }

        if (Number.isFinite(sinkSummary.metricsWithErrors) && sinkSummary.metricsWithErrors > 0) {
            console.log(chalk.yellow(`${indent}    Sinks reporting metrics errors: ${sinkSummary.metricsWithErrors}`));
        }

        if (sinkSummary.unhealthy && typeof sinkSummary.unhealthy === 'object') {
            const failing = Number.isFinite(sinkSummary.unhealthy.failing)
                ? sinkSummary.unhealthy.failing
                : 0;
            const degraded = Number.isFinite(sinkSummary.unhealthy.degraded)
                ? sinkSummary.unhealthy.degraded
                : 0;

            if (failing > 0) {
                console.log(chalk.red(`${indent}    Failing sinks: ${failing}`));
            }

            if (degraded > 0) {
                console.log(chalk.yellow(`${indent}    Degraded sinks: ${degraded}`));
            }
        }
    }

    return true;
};

program
    .name('nimbus')
    .description('AI-Powered Cloud Deployment Guardian for Everyone')
    .version('1.0.0');

// Setup command
program
    .command('setup')
    .description('Interactive setup wizard')
    .action(async () => {
        await setup();
    });

// Scan command
program
    .command('scan')
    .description('Scan your project for issues')
    .option('-a, --ai', 'Include AI-powered explanations')
    .option('-d, --deep', 'Deep scan (slower, more thorough)')
    .option('-q, --quick', 'Quick scan (faster, essential checks only)')
    .option('--fail-on <severity>', 'Exit with error code if issues found (critical, high, medium)')
    .option('--json', 'Output results as JSON')
    .action(async (options) => {
        // Check license and rate limits
        const LicenseManager = require('./lib/license-manager');

        const licenseManager = new LicenseManager();
        const license = licenseManager.getLicense();

        // Check rate limits (calls Cloud Function)
        const limitCheck = await licenseManager.checkRateLimit('scans');
        if (!limitCheck.allowed) {
            console.log(chalk.red('\n⛔ ' + limitCheck.reason + '\n'));
            if (limitCheck.resetAt) {
                console.log(chalk.yellow(`Resets at: ${new Date(limitCheck.resetAt).toLocaleString()}\n`));
            }
            if (limitCheck.upgrade) {
                console.log(chalk.gray('Upgrade: ' + limitCheck.upgrade + '\n'));
            }
            process.exit(1);
        }

        // Show remaining scans if limited
        if (limitCheck.remaining !== undefined && limitCheck.remaining !== 'unlimited') {
            console.log(chalk.gray(`(${limitCheck.remaining} scans remaining)\n`));
        }

        // Check if AI is requested but not allowed
        if (options.ai && !licenseManager.canUseFeature('ai')) {
            console.log(chalk.yellow('\n⚠️  AI features require a commercial license\n'));
            console.log(chalk.gray('Contact: chairman@parserator.com\n'));
            options.ai = false;
        }

        const config = await getConfig();
        if (!config) {
            console.log(chalk.yellow('\n⚠️  Please run "nimbus setup" first!\n'));
            return;
        }

        const spinner = ora('Scanning your project...').start();

        try {
            const engine = new GuardianEngine(process.cwd(), config);
            const results = await engine.analyze({
                aiExplanations: options.ai,
                quick: options.quick
            });

            spinner.succeed('Scan complete!\n');

            // Track usage (async, don't wait)
            licenseManager.trackUsage('scans', {
                issuesFound: results.issues.length,
                critical: results.issues.filter(i => i.severity === 'CRITICAL').length,
                high: results.issues.filter(i => i.severity === 'HIGH').length,
                platform: config.platform
            }).catch(() => {}); // Fail silently

            // JSON output mode
            if (options.json) {
                console.log(JSON.stringify(results, null, 2));
                process.exit(0);
            }

            displayResults(results, config.experienceLevel);

            // Handle --fail-on flag for CI/CD
            if (options.failOn) {
                const severity = options.failOn.toUpperCase();
                const severityLevels = {
                    'CRITICAL': 1,
                    'HIGH': 2,
                    'MEDIUM': 3
                };

                const critical = results.issues.filter(i => i.severity === 'CRITICAL').length;
                const high = results.issues.filter(i => i.severity === 'HIGH').length;
                const medium = results.issues.filter(i => i.severity === 'MEDIUM').length;

                if (severity === 'CRITICAL' && critical > 0) {
                    process.exit(1);
                } else if (severity === 'HIGH' && (critical > 0 || high > 0)) {
                    process.exit(2);
                } else if (severity === 'MEDIUM' && (critical > 0 || high > 0 || medium > 0)) {
                    process.exit(3);
                }
            }

        } catch (error) {
            spinner.fail('Scan failed');
            console.error(chalk.red(error.message));
            process.exit(10);
        }
    });

// Chat command - interactive AI assistant
program
    .command('chat')
    .description('Chat with your AI assistant')
    .action(async () => {
        const config = await getConfig();
        if (!config) {
            console.log(chalk.yellow('\n⚠️  Please run "nimbus setup" first!\n'));
            return;
        }

        console.clear();
        console.log(boxen(
            chalk.cyan.bold('💬 Nimbus AI Assistant\n\n') +
            chalk.white('Ask me anything about your project!\n') +
            chalk.gray('Type "exit" or "quit" to end the conversation'),
            {
                padding: 1,
                margin: 1,
                borderStyle: 'round',
                borderColor: 'cyan'
            }
        ));

        const ai = new AIAssistant({
            claudeApiKey: process.env.CLAUDE_API_KEY,
            geminiApiKey: process.env.GEMINI_API_KEY,
            experienceLevel: config.experienceLevel
        });

        await interactiveChat(ai, config);
    });

// Fix command
program
    .command('fix')
    .description('Auto-fix issues in your project')
    .option('-a, --all', 'Fix all auto-fixable issues')
    .action(async (options) => {
        const config = await getConfig();
        if (!config) {
            console.log(chalk.yellow('\n⚠️  Please run "nimbus setup" first!\n'));
            return;
        }

        const spinner = ora('Analyzing issues...').start();

        const engine = new GuardianEngine(process.cwd(), config);
        const results = await engine.analyze();

        spinner.stop();

        const fixable = results.issues.filter(i => i.autoFixable);

        if (fixable.length === 0) {
            console.log(chalk.green('\n✅ No auto-fixable issues found!\n'));
            return;
        }

        console.log(chalk.cyan(`\n🔧 Found ${fixable.length} fixable issues:\n`));

        for (const issue of fixable) {
            console.log(`  ${getSeverityIcon(issue.severity)} ${issue.message}`);
        }

        const { confirm } = await inquirer.prompt([{
            type: 'confirm',
            name: 'confirm',
            message: 'Fix these issues?',
            default: true
        }]);

        if (!confirm) {
            console.log(chalk.yellow('\nNo changes made.\n'));
            return;
        }

        const fixSpinner = ora('Applying fixes...').start();

        for (const issue of fixable) {
            const result = await engine.autoFix(issue.id);
            if (result.success) {
                fixSpinner.text = result.message;
            }
        }

        fixSpinner.succeed('All fixes applied!\n');
    });

// Explain command
program
    .command('explain <topic>')
    .description('Get AI explanation of a concept')
    .option('-d, --depth <level>', 'Explanation depth: beginner, intermediate, advanced')
    .action(async (topic, options) => {
        const config = await getConfig();
        if (!config) {
            console.log(chalk.yellow('\n⚠️  Please run "nimbus setup" first!\n'));
            return;
        }

        const spinner = ora(`Asking AI about ${topic}...`).start();

        try {
            const ai = new AIAssistant({
                claudeApiKey: process.env.CLAUDE_API_KEY,
                geminiApiKey: process.env.GEMINI_API_KEY,
                experienceLevel: options.depth || config.experienceLevel
            });

            const response = await ai.teachConcept(topic, options.depth || config.experienceLevel);

            spinner.succeed('Got it!\n');

            console.log(boxen(
                chalk.white(response.response),
                {
                    padding: 1,
                    margin: 1,
                    borderStyle: 'round',
                    borderColor: 'cyan'
                }
            ));

            console.log(chalk.gray(`\nPowered by ${response.provider}\n`));

        } catch (error) {
            spinner.fail('Failed to get explanation');
            console.error(chalk.red(error.message));
        }
    });

// Debug command
program
    .command('debug <error>')
    .description('Get help debugging an error')
    .action(async (error) => {
        const config = await getConfig();
        if (!config) {
            console.log(chalk.yellow('\n⚠️  Please run "nimbus setup" first!\n'));
            return;
        }

        const spinner = ora('Analyzing error...').start();

        try {
            const ai = new AIAssistant({
                claudeApiKey: process.env.CLAUDE_API_KEY,
                geminiApiKey: process.env.GEMINI_API_KEY,
                experienceLevel: config.experienceLevel
            });

            const response = await ai.debugError(error);

            spinner.succeed('Analysis complete!\n');

            console.log(boxen(
                chalk.white(response.response),
                {
                    padding: 1,
                    margin: 1,
                    borderStyle: 'round',
                    borderColor: 'red'
                }
            ));

            console.log(chalk.gray(`\nPowered by ${response.provider}\n`));

        } catch (error) {
            spinner.fail('Failed to debug');
            console.error(chalk.red(error.message));
        }
    });

// Learn command
program
    .command('learn [topic]')
    .description('Interactive learning tutorials')
    .action(async (topic) => {
        const config = await getConfig();
        if (!config) {
            console.log(chalk.yellow('\n⚠️  Please run "nimbus setup" first!\n'));
            return;
        }

        if (!topic) {
            // Show learning menu
            const { selectedTopic } = await inquirer.prompt([{
                type: 'list',
                name: 'selectedTopic',
                message: 'What would you like to learn?',
                choices: [
                    '🌱 Git & Version Control Basics',
                    '🌍 Environment Variables',
                    '🔐 Security Best Practices',
                    '🚀 Deploying Your First App',
                    '🐛 Debugging Like a Pro',
                    '📦 Understanding Dependencies',
                    '🐳 Docker Containers',
                    '⚙️  CI/CD Pipelines'
                ]
            }]);

            topic = selectedTopic.split(' ').slice(1).join(' ');
        }

        const spinner = ora(`Preparing lesson on ${topic}...`).start();

        try {
            const ai = new AIAssistant({
                claudeApiKey: process.env.CLAUDE_API_KEY,
                geminiApiKey: process.env.GEMINI_API_KEY,
                experienceLevel: config.experienceLevel
            });

            const response = await ai.teachConcept(topic, config.experienceLevel);

            spinner.succeed('Lesson ready!\n');

            console.log(boxen(
                chalk.white(response.response),
                {
                    padding: 1,
                    margin: 1,
                    borderStyle: 'round',
                    borderColor: 'green'
                }
            ));

        } catch (error) {
            spinner.fail('Failed to load lesson');
            console.error(chalk.red(error.message));
        }
    });

// Dashboard command
program
    .command('dashboard')
    .description('Launch interactive web dashboard')
    .option('-p, --port <port>', 'Port number', '3333')
    .action(async (options) => {
        const DashboardServer = require('./dashboard-server');
        const server = new DashboardServer(options.port);
        await server.start();
    });

// Tools detection command
program
    .command('tools')
    .description('Detect and recommend tools for your project')
    .action(async () => {
        const config = await getConfig();
        if (!config) {
            console.log(chalk.yellow('\n⚠️  Please run "nimbus setup" first!\n'));
            return;
        }

        const spinner = ora('Analyzing project tools...').start();

        const ToolDetector = require('./tool-detector');
        const detector = new ToolDetector(process.cwd());
        const results = await detector.analyze();

        spinner.succeed('Analysis complete!\n');

        // Display detected tools
        if (results.detected.length > 0) {
            console.log(chalk.green.bold('✅ Detected Tools:\n'));

            const byCategory = results.detected.reduce((acc, tool) => {
                if (!acc[tool.category]) acc[tool.category] = [];
                acc[tool.category].push(tool);
                return acc;
            }, {});

            for (const [category, tools] of Object.entries(byCategory)) {
                console.log(chalk.cyan(`\n${category.toUpperCase()}:`));
                tools.forEach(tool => {
                    console.log(`  ✓ ${tool.name || tool.provider}`);
                });
            }
        }

        // Display missing tools
        if (results.missing.length > 0) {
            console.log(chalk.yellow.bold('\n\n⚠️  Missing Tools:\n'));

            for (const tool of results.missing) {
                console.log(chalk.white(`\n❌ ${tool.name}`));
                console.log(chalk.gray(`   ${tool.reason}`));
                console.log(chalk.cyan(`   Install: ${tool.install}`));
            }
        }

        // Display recommendations
        if (results.recommendations.length > 0) {
            console.log(chalk.blue.bold('\n\n💡 Recommendations:\n'));

            for (const rec of results.recommendations) {
                console.log(chalk.white(`\n${rec.category}: ${rec.type}`));
                console.log(chalk.gray(`   ${rec.reason}`));
                if (rec.options) {
                    console.log(chalk.cyan('   Options:'));
                    rec.options.forEach(opt => {
                        console.log(chalk.gray(`   • ${opt.name}: ${opt.install}`));
                    });
                }
            }
        }

        console.log(chalk.cyan.bold('\n\n🚀 Quick Actions:\n'));
        console.log(chalk.white('  nimbus dashboard  - View all tools in web UI'));
        console.log(chalk.white('  nimbus chat       - Ask AI about specific tools\n'));
    });

// Install hooks command
program
    .command('install-hooks')
    .description('Install pre-commit hooks for automatic scanning')
    .action(async () => {
        const gitDir = path.join(process.cwd(), '.git');

        // Check if git repo
        if (!await fs.pathExists(gitDir)) {
            console.log(chalk.red('\n❌ Not a git repository!'));
            console.log(chalk.gray('Initialize git first: git init\n'));
            return;
        }

        const hookPath = path.join(gitDir, 'hooks', 'pre-commit');

        // Check if hook already exists
        if (await fs.pathExists(hookPath)) {
            const { overwrite } = await inquirer.prompt([{
                type: 'confirm',
                name: 'overwrite',
                message: 'pre-commit hook already exists. Overwrite?',
                default: false
            }]);

            if (!overwrite) {
                console.log(chalk.yellow('\n❌ Installation cancelled\n'));
                return;
            }
        }

        // Create hook content
        const hookContent = `#!/bin/bash
# Nimbus Guardian Pre-commit Hook
# Automatically runs security checks before each commit

echo ""
echo "🛡️  Running Nimbus Guardian security check..."
echo ""

nimbus scan --quick --fail-on critical

if [ $? -ne 0 ]; then
    echo ""
    echo "❌ COMMIT BLOCKED: Critical security issues found!"
    echo ""
    echo "Fix these issues before committing:"
    echo "  • Run 'nimbus fix' to auto-fix issues"
    echo "  • Run 'nimbus chat' for help"
    echo "  • Run 'nimbus scan' for details"
    echo ""
    echo "To commit anyway (not recommended):"
    echo "  git commit --no-verify"
    echo ""
    exit 1
fi

echo "✅ All security checks passed!"
echo ""
`;

        try {
            // Ensure hooks directory exists
            await fs.ensureDir(path.join(gitDir, 'hooks'));

            // Write hook
            await fs.writeFile(hookPath, hookContent, { mode: 0o755 });

            console.log(chalk.green('\n✅ Pre-commit hook installed successfully!\n'));
            console.log(chalk.white('What this does:'));
            console.log(chalk.gray('  • Runs nimbus scan --quick before each commit'));
            console.log(chalk.gray('  • Blocks commits if critical issues found'));
            console.log(chalk.gray('  • Fast scan mode (< 5 seconds)\n'));
            console.log(chalk.white('To uninstall:'));
            console.log(chalk.gray('  nimbus uninstall-hooks\n'));
            console.log(chalk.white('To bypass (not recommended):'));
            console.log(chalk.gray('  git commit --no-verify\n'));
        } catch (error) {
            console.log(chalk.red('\n❌ Failed to install hook:'), error.message);
        }
    });

// Uninstall hooks command
program
    .command('uninstall-hooks')
    .description('Remove pre-commit hooks')
    .action(async () => {
        const hookPath = path.join(process.cwd(), '.git', 'hooks', 'pre-commit');

        try {
            if (await fs.pathExists(hookPath)) {
                await fs.remove(hookPath);
                console.log(chalk.green('\n✅ Pre-commit hook removed\n'));
            } else {
                console.log(chalk.yellow('\n⚠️  No pre-commit hook found\n'));
            }
        } catch (error) {
            console.log(chalk.red('\n❌ Failed to remove hook:'), error.message);
        }
    });

// Deploy check command
program
    .command('pre-deploy')
    .description('Pre-deployment checklist and validation')
    .action(async () => {
        const config = await getConfig();
        if (!config) {
            console.log(chalk.yellow('\n⚠️  Please run "nimbus setup" first!\n'));
            return;
        }

        console.log(chalk.cyan.bold('\n🚀 Pre-Deployment Checklist\n'));

        const spinner = ora('Running comprehensive checks...').start();

        const engine = new GuardianEngine(process.cwd(), config);
        const results = await engine.analyze({ aiExplanations: true });

        spinner.stop();

        const critical = results.issues.filter(i => i.severity === 'CRITICAL').length;
        const high = results.issues.filter(i => i.severity === 'HIGH').length;

        console.log('\n' + boxen(
            chalk.white('Deployment Readiness Report\n\n') +
            (critical === 0 && high === 0
                ? chalk.green.bold('✅ Ready to Deploy!')
                : chalk.red.bold('⚠️  Issues Must Be Fixed First')),
            {
                padding: 1,
                margin: 1,
                borderStyle: 'round',
                borderColor: critical === 0 && high === 0 ? 'green' : 'red'
            }
        ));

        displayResults(results, config.experienceLevel);

        if (critical > 0 || high > 0) {
            console.log(chalk.yellow('\n💡 Run "nimbus fix" to auto-fix issues\n'));
            console.log(chalk.yellow('💬 Run "nimbus chat" to get help with manual fixes\n'));
        }
    });

// Helper functions

let displayedConfigWarnings = false;

async function getConfig() {
    const config = await loadGuardianConfig(process.cwd());

    if (config && !displayedConfigWarnings) {
        const warnings = Array.isArray(config.__meta?.warnings) ? config.__meta.warnings.filter(Boolean) : [];

        if (warnings.length > 0) {
            displayedConfigWarnings = true;
            console.log();
            console.log(chalk.yellow.bold('⚠️  Configuration warnings detected:'));
            warnings.forEach((warning, index) => {
                const prefix = warnings.length > 1 ? `${index + 1}. ` : '- ';
                console.log(chalk.yellow(`${prefix}${warning}`));
            });
            console.log();
        }
    }

    return config;
}

function displayResults(results, experienceLevel) {
    const { issues, warnings, insights } = results;

    const critical = issues.filter(i => i.severity === 'CRITICAL').length;
    const high = issues.filter(i => i.severity === 'HIGH').length;
    const medium = issues.filter(i => i.severity === 'MEDIUM').length;

    console.log(boxen(
        chalk.white.bold('📊 Scan Results\n\n') +
        `${critical > 0 ? chalk.red('🔴') : chalk.green('✅')} Critical: ${critical}\n` +
        `${high > 0 ? chalk.yellow('🟠') : chalk.green('✅')} High: ${high}\n` +
        `${medium > 0 ? chalk.yellow('🟡') : chalk.green('✅')} Medium: ${medium}\n` +
        chalk.gray(`⚪ Warnings: ${warnings.length}`),
        {
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: critical > 0 ? 'red' : high > 0 ? 'yellow' : 'green'
        }
    ));

    if (issues.length > 0) {
        console.log(chalk.red.bold('\n❌ Issues Found:\n'));

        for (const issue of issues.slice(0, 10)) {
            console.log(`${getSeverityIcon(issue.severity)} ${chalk.white(issue.message)}`);
            if (issue.file) {
                console.log(chalk.gray(`   📄 ${issue.file}`));
            }
            if (issue.autoFixable) {
                console.log(chalk.green('   ✅ Auto-fixable'));
            }

            // Show AI insight if available
            const insight = insights.find(i => i.issueId === issue.id);
            if (insight && experienceLevel === 'beginner') {
                console.log(chalk.cyan('\n   🤖 AI Explanation:'));
                console.log(chalk.white('   ' + insight.explanation.split('\n')[0].substring(0, 100) + '...'));
                console.log(chalk.gray(`   (Run "nimbus explain ${issue.id}" for full explanation)\n`));
            }

            console.log();
        }
    }

    if (warnings.length > 0 && experienceLevel !== 'beginner') {
        console.log(chalk.yellow.bold('⚠️  Warnings:\n'));

        for (const warning of warnings.slice(0, 5)) {
            console.log(`⚪ ${chalk.white(warning.message)}\n`);
        }
    }

    // Show priority guidance
    const priorityInsight = insights.find(i => i.type === 'priority-guidance');
    if (priorityInsight) {
        console.log(boxen(
            chalk.cyan.bold('🎯 AI Recommendations\n\n') +
            chalk.white(priorityInsight.explanation),
            {
                padding: 1,
                margin: 1,
                borderStyle: 'round',
                borderColor: 'cyan'
            }
        ));
    }
}

function getSeverityIcon(severity) {
    const icons = {
        'CRITICAL': '🔴',
        'HIGH': '🟠',
        'MEDIUM': '🟡',
        'LOW': '⚪'
    };
    return icons[severity] || '⚪';
}

async function interactiveChat(ai, config) {
    while (true) {
        const { question } = await inquirer.prompt([{
            type: 'input',
            name: 'question',
            message: chalk.cyan('You:'),
            prefix: ''
        }]);

        if (['exit', 'quit', 'bye'].includes(question.toLowerCase())) {
            console.log(chalk.cyan('\n👋 Goodbye! Run "nimbus chat" anytime.\n'));
            break;
        }

        if (!question.trim()) continue;

        const spinner = ora('Thinking...').start();

        try {
            const response = await ai.ask(question);

            spinner.stop();

            console.log(chalk.white(`\n🤖 ${response.provider}:\n`));
            console.log(chalk.white(response.response));
            console.log();

        } catch (error) {
            spinner.fail('Error');
            console.error(chalk.red(error.message + '\n'));
        }
    }
}

// Account management commands
program
    .command('register')
    .description('Register your account')
    .action(async () => {
        const AccountManager = require('./lib/account-manager');
        const accountManager = new AccountManager();

        if (accountManager.isLoggedIn()) {
            console.log(chalk.yellow('\n⚠️  Already registered!\n'));
            const account = accountManager.getAccount();
            console.log(`Email: ${account.email}`);
            console.log(`Tier: ${account.tier}\n`);
            return;
        }

        const answers = await inquirer.prompt([
            {
                type: 'input',
                name: 'email',
                message: 'Email address:',
                validate: (input) => input.includes('@') || 'Please enter a valid email'
            },
            {
                type: 'input',
                name: 'projectName',
                message: 'Project name:',
                default: 'My Project'
            },
            {
                type: 'list',
                name: 'useCase',
                message: 'Primary use case:',
                choices: ['Personal/Learning', 'Open Source', 'Commercial/Business', 'Enterprise']
            }
        ]);

        const spinner = ora('Creating account...').start();

        try {
            const account = accountManager.register(
                answers.email,
                answers.projectName,
                answers.useCase
            );

            spinner.succeed('Account created!');

            console.log('\n' + boxen(
                chalk.green.bold('✅ Registration Complete\n\n') +
                chalk.white(`Account ID: ${account.id}\n`) +
                chalk.white(`Email: ${account.email}\n`) +
                chalk.white(`Tier: ${account.tier}\n\n`) +
                chalk.gray('Personal tier is for non-commercial use only.\n') +
                chalk.gray('For commercial use, contact: chairman@parserator.com'),
                { padding: 1, margin: 1, borderStyle: 'round', borderColor: 'green' }
            ));

            if (answers.useCase === 'Commercial/Business' || answers.useCase === 'Enterprise') {
                console.log(chalk.yellow('\n⚠️  Commercial use detected!'));
                console.log('You\'ll need a commercial license to use Nimbus for business.');
                console.log('Contact: chairman@parserator.com\n');
            }

        } catch (error) {
            spinner.fail('Registration failed');
            console.error(chalk.red(error.message + '\n'));
        }
    });

program
    .command('activate <license-key>')
    .description('Activate commercial license')
    .option('-e, --email <email>', 'Email address for license')
    .action(async (licenseKey, options) => {
        const LicenseManager = require('./lib/license-manager');
        const AccountManager = require('./lib/account-manager');

        const licenseManager = new LicenseManager();
        const accountManager = new AccountManager();

        // Prompt for email if not provided
        let email = options.email;
        if (!email) {
            const answers = await inquirer.prompt([
                {
                    type: 'input',
                    name: 'email',
                    message: 'Email address:',
                    validate: (input) => input.includes('@') || 'Please enter a valid email'
                }
            ]);
            email = answers.email;
        }

        const spinner = ora('Activating license...').start();

        try {
            const license = await licenseManager.activateKey(licenseKey, email);

            // Update account tier if registered
            if (accountManager.isLoggedIn()) {
                accountManager.update({ tier: license.tier });
            }

            spinner.succeed('License activated!');

            console.log('\n' + boxen(
                chalk.green.bold('✅ License Activated\n\n') +
                chalk.white(`Tier: ${license.tier}\n`) +
                chalk.white(`User ID: ${license.userId}\n`) +
                chalk.white(`Email: ${email}\n`) +
                chalk.white(`Activated: ${new Date(license.activated).toLocaleDateString()}\n\n`) +
                chalk.green('You can now use Nimbus commercially!'),
                { padding: 1, margin: 1, borderStyle: 'round', borderColor: 'green' }
            ));

        } catch (error) {
            spinner.fail('Activation failed');
            console.error(chalk.red('\n' + error.message + '\n'));
            console.log('Contact support: chairman@parserator.com\n');
        }
    });

program
    .command('observability-stream')
    .description('Stream anonymized fingerprint telemetry from the dashboard SSE endpoint')
    .option('--url <url>', 'Observability stream URL', 'http://localhost:3333/api/observability/stream')
    .option('--cookie <value>', 'guardian_session cookie value or full Cookie header')
    .option('--header <header...>', 'Additional request header(s) in KEY:VALUE format')
    .option('--json', 'Print raw JSON payloads instead of formatted summaries')
    .option('--once', 'Exit after the first fingerprint payload is received')
    .option('--timeout <seconds>', 'Stop streaming after the specified number of seconds')
    .option('--quiet', 'Suppress connection status and heartbeat output')
    .action(async (options) => {
        const headers = parseHeaderOptions(options.header, {
            onWarning: (message) => console.log(chalk.yellow(message))
        });

        const client = new ObservabilityStreamClient({
            url: options.url,
            headers,
            logger: console
        });

        const spinner = ora('Connecting to observability stream...').start();

        let timeoutId = null;
        let stopRequested = false;
        let exitCode = 0;
        let updateCount = 0;

        const requestStop = (code = 0) => {
            if (stopRequested) {
                return;
            }
            stopRequested = true;
            exitCode = code;
            client.stop();
        };

        if (options.timeout !== undefined) {
            const seconds = Number(options.timeout);
            if (Number.isFinite(seconds) && seconds > 0) {
                timeoutId = setTimeout(() => {
                    if (!options.quiet) {
                        console.log(chalk.yellow('\n⏱️  Timeout reached, closing stream.'));
                    }
                    requestStop(0);
                }, seconds * 1000);
                timeoutId.unref?.();
            } else {
                console.log(chalk.yellow('Ignoring invalid --timeout value. Expected a positive number.'));
            }
        }

        const handleSigint = () => {
            console.log();
            if (!options.quiet) {
                console.log(chalk.yellow('Received interrupt. Closing stream...'));
            }
            requestStop(0);
        };

        process.on('SIGINT', handleSigint);

        try {
            await client.start({
                cookie: options.cookie,
                onConnect: () => {
                    spinner.succeed('Connected to observability stream.');
                    if (!options.quiet) {
                        console.log(chalk.gray('Listening for fingerprint updates...'));
                    }
                },
                onHeartbeat: (comment) => {
                    if (!options.quiet && comment) {
                        console.log(chalk.gray(`♥ ${comment}`));
                    }
                },
                onData: (payload) => {
                    updateCount += 1;
                    if (options.json) {
                        console.log(JSON.stringify(payload));
                    } else {
                        const emittedAt = payload?.emittedAt
                            ? new Date(payload.emittedAt).toISOString()
                            : new Date().toISOString();
                        const recentFingerprints = Array.isArray(payload?.fingerprints?.recentFingerprints)
                            ? payload.fingerprints.recentFingerprints
                            : [];

                        console.log(chalk.cyan(`\n📡 Fingerprint update #${updateCount} @ ${emittedAt}`));

                        const printedSummary = printSnapshotSummary(payload?.summary, '  ');
                        if (!printedSummary) {
                            const totalTracked = payload?.fingerprints?.totalTracked ?? 0;
                            console.log(chalk.white(`  Total tracked: ${totalTracked}`));
                            console.log(chalk.white(`  Recent fingerprints: ${recentFingerprints.length}`));
                        }

                        if (recentFingerprints.length > 0) {
                            const latest = recentFingerprints[0];
                            if (latest) {
                                console.log(chalk.gray(`  Latest fingerprint: ${latest.fingerprintHash} (sessions: ${latest.sessionCount})`));
                            }
                        }

                        if (Array.isArray(payload?.sinks) && payload.sinks.length > 0) {
                            console.log(chalk.cyan('  Sink telemetry:'));
                            for (const sink of payload.sinks) {
                                const name = sink?.name || 'observability-sink';
                                console.log(chalk.white(`    • ${name}`));

                                const statusLabel = formatSinkStatus(sink?.status);
                                console.log(`      Status: ${statusLabel}`);
                                if (sink?.statusReason) {
                                    console.log(chalk.gray(`      Reason: ${sink.statusReason}`));
                                }

                                const metrics = sink?.metrics;
                                if (metrics && typeof metrics === 'object') {
                                    printMetricTree(metrics, '      ');
                                } else if (sink?.metricsError) {
                                    console.log(chalk.yellow(`      metrics error: ${sink.metricsError}`));
                                } else {
                                    console.log(chalk.gray('      (metrics unavailable)'));
                                }
                            }
                        } else {
                            console.log(chalk.gray('  No registered observability sinks.'));
                        }

                        const fingerprintDelta = payload?.delta?.fingerprints;
                        const sinkDelta = payload?.delta?.sinks;
                        if (fingerprintDelta || sinkDelta) {
                            console.log();
                            const printedFingerprintDelta = printFingerprintDelta(fingerprintDelta, '  ');
                            const printedSinkDelta = printSinkDelta(sinkDelta, '  ');
                            if (!printedFingerprintDelta && !printedSinkDelta) {
                                console.log(chalk.gray('  No fingerprint or sink deltas detected.'));
                            }
                        }
                    }

                    if (options.once) {
                        requestStop(0);
                    }
                }
            });

            if (timeoutId) {
                clearTimeout(timeoutId);
            }

            if (!stopRequested && !options.quiet) {
                console.log(chalk.gray('\nStream closed by server.'));
            }

            process.exitCode = exitCode;
        } catch (error) {
            spinner.fail('Unable to connect to observability stream');
            console.error(chalk.red(error.message));
            process.exitCode = 1;
        } finally {
            process.off('SIGINT', handleSigint);
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
            if (spinner.isSpinning) {
                spinner.stop();
            }
        }
    });

program
    .command('observability-status')
    .description('Fetch a single observability snapshot from the dashboard API')
    .option('--url <url>', 'Observability status URL', 'http://localhost:3333/api/observability')
    .option('--cookie <value>', 'guardian_session cookie value or full Cookie header')
    .option('--header <header...>', 'Additional request header(s) in KEY:VALUE format')
    .option('--history <count>', 'Include the latest <count> observability snapshots from history')
    .option('--json', 'Print raw JSON payload instead of a formatted summary')
    .option('--timeout <seconds>', 'Request timeout in seconds (default: 5)')
    .action(async (options) => {
        const headers = parseHeaderOptions(options.header, {
            onWarning: (message) => console.log(chalk.yellow(message))
        });

        const timeoutSeconds = Number(options.timeout);
        const timeoutMs = Number.isFinite(timeoutSeconds) && timeoutSeconds > 0
            ? timeoutSeconds * 1000
            : undefined;

        const historyCount = Number.parseInt(options.history, 10);
        const includeHistory = Number.isFinite(historyCount) && historyCount > 0
            ? Math.floor(historyCount)
            : 0;

        const client = new ObservabilityStatusClient({
            url: options.url,
            headers,
            timeoutMs,
            logger: console
        });

        const spinner = ora('Fetching observability snapshot...').start();

        try {
            const snapshot = await client.fetchStatus({ cookie: options.cookie });

            let historyResult = null;
            if (includeHistory) {
                spinner.text = 'Fetching observability history...';
                historyResult = await client.fetchHistory({ cookie: options.cookie, limit: includeHistory });
            }

            spinner.succeed('Snapshot retrieved.');

            const historyEntries = Array.isArray(historyResult)
                ? historyResult
                : Array.isArray(historyResult?.history)
                    ? historyResult.history
                    : [];
            const historyOverview = historyResult && typeof historyResult === 'object'
                ? historyResult.overview
                : null;

            if (options.json) {
                if (includeHistory) {
                    console.log(JSON.stringify({ snapshot, history: historyEntries, overview: historyOverview }, null, 2));
                } else {
                    console.log(JSON.stringify(snapshot, null, 2));
                }
                return;
            }

            if (!snapshot) {
                console.log(chalk.yellow('No observability snapshot returned.'));
                if (includeHistory && historyEntries.length > 0) {
                    if (historyOverview) {
                        printHistoryOverview(historyOverview);
                    }
                    console.log(chalk.cyan('\n🕒 Recent observability history'));
                    historyEntries.forEach((entry, index) => {
                        const timestamp = entry?.fingerprints?.generatedAt
                            || entry?.emittedAt
                            || 'unknown';
                        const total = entry?.summary?.fingerprints?.totalTracked
                            ?? entry?.fingerprints?.totalTracked;
                        const sinks = entry?.summary?.sinks?.total
                            ?? (Array.isArray(entry?.sinks) ? entry.sinks.length : 0);
                        const label = `#${index + 1}`;
                        console.log(chalk.white(`  ${label}: ${timestamp}`));
                        if (typeof total === 'number') {
                            console.log(chalk.gray(`     total tracked: ${total}`));
                        }
                        console.log(chalk.gray(`     sinks: ${sinks}`));
                        const failing = entry?.summary?.sinks?.unhealthy?.failing ?? 0;
                        const degraded = entry?.summary?.sinks?.unhealthy?.degraded ?? 0;
                        if (failing > 0) {
                            console.log(chalk.red(`     failing sinks: ${failing}`));
                        }
                        if (degraded > 0) {
                            console.log(chalk.yellow(`     degraded sinks: ${degraded}`));
                        }
                    });
                } else if (includeHistory) {
                    console.log(chalk.gray('\nNo observability history available.'));
                }
                return;
            }

            const emittedAt = snapshot?.fingerprints?.generatedAt
                || snapshot?.emittedAt
                || new Date().toISOString();

            console.log(chalk.cyan(`\n📊 Observability snapshot @ ${emittedAt}`));

            const printedSummary = printSnapshotSummary(snapshot?.summary, '  ');

            if (!printedSummary) {
                const fingerprintStats = snapshot?.fingerprints || {};
                if (typeof fingerprintStats.totalTracked === 'number') {
                    console.log(chalk.white(`  Total tracked fingerprints: ${fingerprintStats.totalTracked}`));
                }
                if (Array.isArray(fingerprintStats.recentFingerprints)) {
                    console.log(chalk.white(`  Recent fingerprints: ${fingerprintStats.recentFingerprints.length}`));
                }
            }

            if (Array.isArray(snapshot?.sinks) && snapshot.sinks.length > 0) {
                console.log(chalk.cyan('\n🔌 Sink telemetry'));
                for (const sink of snapshot.sinks) {
                    const name = sink?.name || 'observability-sink';
                    console.log(chalk.white(`• ${name}`));

                    const statusLabel = formatSinkStatus(sink?.status);
                    console.log(`  Status: ${statusLabel}`);
                    if (sink?.statusReason) {
                        console.log(chalk.gray(`  Reason: ${sink.statusReason}`));
                    }

                    const metrics = sink?.metrics;
                    if (metrics && typeof metrics === 'object') {
                        printMetricTree(metrics, '  ');
                    } else if (sink?.metricsError) {
                        console.log(chalk.yellow(`  metrics error: ${sink.metricsError}`));
                    } else {
                        console.log(chalk.gray('  (metrics unavailable)'));
                    }
                }
            } else {
                console.log(chalk.gray('\nNo registered observability sinks.'));
            }

            console.log();
            const printedFingerprintDelta = printFingerprintDelta(snapshot?.delta?.fingerprints);
            const printedSinkDelta = printSinkDelta(snapshot?.delta?.sinks);

            if (!printedFingerprintDelta && !printedSinkDelta) {
                console.log(chalk.gray('No recent fingerprint or sink changes detected.'));
            }

            if (includeHistory) {
                if (historyOverview) {
                    printHistoryOverview(historyOverview);
                }

                if (historyEntries.length > 0) {
                    console.log(chalk.cyan('\n🕒 Recent observability history'));
                    historyEntries.forEach((entry, index) => {
                        const timestamp = entry?.fingerprints?.generatedAt
                            || entry?.emittedAt
                            || 'unknown';
                        const total = entry?.summary?.fingerprints?.totalTracked
                            ?? entry?.fingerprints?.totalTracked;
                        const sinks = entry?.summary?.sinks?.total
                            ?? (Array.isArray(entry?.sinks) ? entry.sinks.length : 0);
                        const label = `#${index + 1}`;
                        console.log(chalk.white(`  ${label}: ${timestamp}`));
                        if (typeof total === 'number') {
                            console.log(chalk.gray(`     total tracked: ${total}`));
                        }
                        if (sinks > 0) {
                            console.log(chalk.gray(`     sinks: ${sinks}`));
                        } else {
                            console.log(chalk.gray('     sinks: 0'));
                        }
                        const failing = entry?.summary?.sinks?.unhealthy?.failing ?? 0;
                        const degraded = entry?.summary?.sinks?.unhealthy?.degraded ?? 0;
                        if (failing > 0) {
                            console.log(chalk.red(`     failing sinks: ${failing}`));
                        }
                        if (degraded > 0) {
                            console.log(chalk.yellow(`     degraded sinks: ${degraded}`));
                        }
                        const totalDelta = entry?.delta?.fingerprints?.totalTracked?.delta;
                        if (Number.isFinite(totalDelta) && totalDelta !== 0) {
                            const deltaLabel = formatDeltaNumber(totalDelta);
                            console.log(chalk.gray(`     Δ total tracked: ${deltaLabel}`));
                        }
                    });
                } else {
                    console.log(chalk.gray('\nNo observability history available.'));
                }
            }
        } catch (error) {
            spinner.fail('Unable to fetch observability snapshot');
            console.error(chalk.red(error.message));
            process.exitCode = 1;
        } finally {
            if (spinner.isSpinning) {
                spinner.stop();
            }
        }
    });

program
    .command('observability-incidents')
    .description('Summarize sink incidents detected in observability history')
    .option('--url <url>', 'Observability incidents URL', 'http://localhost:3333/api/observability/incidents')
    .option('--cookie <value>', 'guardian_session cookie value or full Cookie header')
    .option('--header <header...>', 'Additional request header(s) in KEY:VALUE format')
    .option('--status <status...>', 'Filter incidents by status (repeatable or comma separated)')
    .option('--sink <sink...>', 'Filter incidents by sink name (repeatable or comma separated)')
    .option('--open', 'Only include open incidents')
    .option('--closed', 'Only include closed incidents')
    .option('--limit <count>', 'Limit the number of incidents returned after filtering')
    .option('--json', 'Print raw JSON response instead of formatted output')
    .action(async (options) => {
        const headers = parseHeaderOptions(options.header, {
            onWarning: (message) => console.log(chalk.yellow(message))
        });

        const statuses = normalizeListOption(options.status);
        const sinks = normalizeListOption(options.sink);

        const limitValue = Number.parseInt(options.limit, 10);
        const limit = Number.isFinite(limitValue) && limitValue > 0
            ? Math.floor(limitValue)
            : null;

        if (options.limit !== undefined && (limit === null || limitValue <= 0)) {
            console.log(chalk.yellow('Ignoring --limit value; expected a positive integer.'));
        }

        let openFilter = null;
        if (options.open && options.closed) {
            console.log(chalk.yellow('Both --open and --closed supplied; returning all incidents.'));
        } else if (options.open) {
            openFilter = true;
        } else if (options.closed) {
            openFilter = false;
        }

        const client = new ObservabilityStatusClient({
            url: options.url,
            incidentsUrl: options.url,
            headers,
            logger: console
        });

        const spinner = ora('Fetching observability incidents...').start();

        try {
            const report = await client.fetchIncidents({
                cookie: options.cookie,
                limit: limit ?? undefined,
                statuses,
                sinks,
                open: openFilter
            });

            spinner.succeed('Incident report retrieved.');

            if (options.json) {
                console.log(JSON.stringify(report, null, 2));
                return;
            }

            printIncidentReport(report);
        } catch (error) {
            spinner.fail('Unable to fetch observability incidents');
            console.error(chalk.red(error.message));
            process.exitCode = 1;
        } finally {
            if (spinner.isSpinning) {
                spinner.stop();
            }
        }
    });

program
    .command('account')
    .description('View account information')
    .action(() => {
        const AccountManager = require('./lib/account-manager');
        const LicenseManager = require('./lib/license-manager');

        const accountManager = new AccountManager();
        const licenseManager = new LicenseManager();

        const accountInfo = accountManager.getAccountInfo();
        const licenseInfo = licenseManager.getLicenseInfo();

        if (!accountInfo.loggedIn) {
            console.log(chalk.yellow('\n⚠️  Not registered\n'));
            console.log('Run: nimbus register\n');
            return;
        }

        console.log('\n' + boxen(
            chalk.cyan.bold('👤 Account Information\n\n') +
            chalk.white(`Email: ${accountInfo.email}\n`) +
            chalk.white(`Account ID: ${accountInfo.id}\n`) +
            chalk.white(`Tier: ${accountInfo.tier}\n`) +
            chalk.white(`Registered: ${new Date(accountInfo.registeredAt).toLocaleDateString()}\n\n`) +
            chalk.cyan.bold('📊 Usage\n\n') +
            chalk.white(`Scans: ${licenseInfo.usage.scans || 0}\n`) +
            chalk.white(`AI Queries: ${licenseInfo.usage.aiQueries || 0}\n`) +
            chalk.white(`Auto-fixes: ${licenseInfo.usage.fixes || 0}\n\n`) +
            (accountInfo.tier === 'FREE' ?
                chalk.gray('Upgrade for commercial use: chairman@parserator.com') :
                chalk.green('✅ Licensed for commercial use')),
            { padding: 1, margin: 1, borderStyle: 'round', borderColor: 'cyan' }
        ));
    });

program
    .command('logout')
    .description('Logout and remove local account')
    .action(() => {
        const AccountManager = require('./lib/account-manager');
        const accountManager = new AccountManager();

        if (!accountManager.isLoggedIn()) {
            console.log(chalk.yellow('\n⚠️  Not logged in\n'));
            return;
        }

        accountManager.logout();
        console.log(chalk.green('\n✅ Logged out\n'));
    });

// Parse command line
program.parse();

// Show help if no command
if (!process.argv.slice(2).length) {
    console.log(boxen(
        chalk.cyan.bold('☁️  Nimbus Guardian\n\n') +
        chalk.white('AI-Powered Deployment Safety for Everyone\n\n') +
        chalk.gray('Quick Start:\n') +
        chalk.white('  nimbus register    Create account\n') +
        chalk.white('  nimbus setup       Configure tools\n') +
        chalk.white('  nimbus scan        Check your project\n') +
        chalk.white('  nimbus dashboard   Launch web dashboard\n') +
        chalk.white('  nimbus account     View license & usage\n\n') +
        chalk.gray('Run "nimbus --help" for all commands'),
        {
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'cyan'
        }
    ));
}