
import { initMotionScene } from './motion.js';
import { createNetworking, createNetworkMonitor } from './networking.js';
import { createAssistantLoader } from './assistant-loader.js';
import { createRefreshScheduler } from './scheduler.js';
import { deriveCardState, renderCardFallback } from './card-state.js';
import {
    showToast,
    copyText,
    setLoadingState,
    clearLoadingState,
    setBadge,
    renderMetrics,
    createMetaUpdater
} from './ui.js';
import {
    titleCase,
    formatToolLabel,
    resolveInstallCommand,
    resolveDocsLink,
    formatRelativeTimeValue,
    appendTimelineItem
} from './cards/card-utils.js';
import {
    getSeverityCounts,
    getSecurityBadge,
    computeSecureScore,
    createProgressBar,
    severityToClass,
    severityIcon,
    gitStatusSeverity,
    createInfoItem
} from './cards/security-utils.js';

const scene = document.getElementById('scene');
const mouseXDisplay = document.getElementById('mouseX');
const mouseYDisplay = document.getElementById('mouseY');
const networkStatusLabel = document.getElementById('network-status');
const motionStatusLabel = document.getElementById('motion-status');
const particlesContainer = document.getElementById('particles');
const cards = Array.from(document.querySelectorAll('.neo-card'));

function showOfflineNotice(container, message) {
    if (!container) {
        return;
    }

    let notice = container.querySelector(':scope > .offline-notice');
    if (!notice) {
        notice = document.createElement('p');
        notice.className = 'muted-text offline-notice';
        container.appendChild(notice);
    }

    notice.textContent = message;
}

function removeOfflineNotice(container) {
    if (!container) {
        return;
    }

    const notice = container.querySelector(':scope > .offline-notice');
    if (notice) {
        notice.remove();
    }
}

const {
    fetchJSON,
    saveCache,
    readCache,
    parseDateLike,
    formatRelativeTime: formatRelativeTimeFromDate,
    extractTimestamp
} = createNetworking();

const refreshScheduler = createRefreshScheduler({
    documentRef: document,
    requestIdleCallback: window.requestIdleCallback,
    cancelIdleCallback: window.cancelIdleCallback
});

const scheduleRefresh = refreshScheduler.schedule;
const stopAutoRefresh = refreshScheduler.stopAll;

initMotionScene({
    scene,
    mouseXDisplay,
    mouseYDisplay,
    motionStatusLabel,
    particlesContainer,
    cards
});

const networkMonitor = createNetworkMonitor({
    statusLabel: networkStatusLabel,
    showToast,
    onOnline: () => {
        loadStatus();
        loadSecurity();
        loadTools();
        loadDeployments();
        loadGitHub();
        loadIssues();
    },
    onOffline: restoreCachedCards
});

function isOnline() {
    return networkMonitor.isOnline();
}

let assistantErrorNotified = false;

const assistantLoader = createAssistantLoader({
    importAssistant: () => import('./assistant.js'),
    getDependencies: () => ({
        fetchJSON,
        showToast,
        isOnline,
        loadTools,
        refreshScan
    })
});

async function invokeAssistantAction(actionName, event) {
    if (event && typeof event.stopPropagation === 'function') {
        event.stopPropagation();
    }

    try {
        const assistant = await assistantLoader.ensureActions();
        const handler = assistant?.[actionName];
        if (typeof handler !== 'function') {
            throw new Error(`Assistant action "${actionName}" is unavailable`);
        }
        await handler(event);
        assistantErrorNotified = false;
    } catch (error) {
        if (!assistantErrorNotified) {
            showToast('Assistant features are unavailable right now. Try again shortly.', 'error');
            assistantErrorNotified = true;
        }
        console.error(`Assistant action ${actionName} failed`, error);
    }
}

const assistantHandlers = {
    handleAutoFix: event => invokeAssistantAction('handleAutoFix', event),
    handleInstallTool: event => invokeAssistantAction('handleInstallTool', event)
};

async function handleCopyInstallCommand(event) {
    event.stopPropagation();

    const button = event.currentTarget;
    if (!button || button.dataset.state === 'busy') {
        return;
    }

    const command = button.dataset.command;
    const toolName = button.dataset.tool || 'Tool';

    if (!command) {
        showToast(`No install command is available for ${toolName}.`, 'warning');
        return;
    }

    button.dataset.state = 'busy';
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');

    try {
        await copyText(command);
        showToast(`Install command copied for ${toolName}.`, 'success');
    } catch (error) {
        console.error(`Failed to copy install command for ${toolName}`, error);
        showToast(`Unable to copy the install command for ${toolName}.`, 'error');
    } finally {
        if (!button.isConnected) {
            return;
        }

        delete button.dataset.state;
        button.disabled = false;
        button.removeAttribute('aria-busy');
    }
}

function scheduleAssistantPreload() {
    const trigger = () => {
        assistantLoader.preload().then(() => {
            assistantErrorNotified = false;
        });
    };

    if (typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(trigger, { timeout: 2000 });
    } else {
        setTimeout(trigger, 2000);
    }
}

scheduleAssistantPreload();

networkMonitor.updateNetworkStatus();
restoreCachedCards();

const latestData = {
    scan: null,
    git: null,
    deployments: null,
    github: null
};

const REFRESH_INTERVALS = {
    status: 60_000,
    tools: 120_000,
    issues: 45_000,
    deployments: 300_000,
    github: 180_000
};

function formatRelativeTimestamp(value) {
    if (value instanceof Date) {
        return formatRelativeTimeFromDate(value);
    }

    const parsed = parseDateLike(value);
    return parsed ? formatRelativeTimeFromDate(parsed) : '';
}

const setUpdatedMeta = createMetaUpdater({
    parseDateLike,
    formatRelativeTime: formatRelativeTimestamp
});

function startAutoRefresh() {
    scheduleRefresh('status', loadStatus, REFRESH_INTERVALS.status);
    scheduleRefresh('tools', loadTools, REFRESH_INTERVALS.tools);
    scheduleRefresh('issues', loadIssues, REFRESH_INTERVALS.issues);
    scheduleRefresh('deployments', loadDeployments, REFRESH_INTERVALS.deployments, {
        deferUntilIdle: true,
        idleTimeout: 2000
    });
    scheduleRefresh('github', loadGitHub, REFRESH_INTERVALS.github, {
        deferUntilIdle: true,
        idleTimeout: 2600
    });
}


function renderDeploymentSection(container, entry = {}) {
    if (!container) return;

    const platform = titleCase(entry.platform || 'Provider');
    const title = document.createElement('div');
    title.className = 'metric-section-title';
    title.textContent = `${platform} Deployments`;
    container.appendChild(title);

    const summary = document.createElement('div');
    summary.className = 'metric';

    const label = document.createElement('span');
    label.className = 'metric-label';
    label.textContent = 'Records';

    const value = document.createElement('span');
    value.className = 'metric-value';

    let items = [];
    if (Array.isArray(entry.projects)) {
        items = entry.projects;
    } else if (Array.isArray(entry.deployments)) {
        items = entry.deployments;
    }

    value.textContent = items.length.toString();
    summary.append(label, value);
    container.appendChild(summary);

    const timeline = document.createElement('ul');
    timeline.className = 'timeline';
    let hasItems = false;

    if (Array.isArray(entry.projects)) {
        entry.projects.forEach(project => {
            if (!project) return;
            const details = [];
            if (project.projectId) details.push(project.projectId);
            if (project.projectNumber) details.push(`#${project.projectNumber}`);
            if (project.resources?.defaultHostingSite) {
                details.push(`Hosting: ${project.resources.defaultHostingSite}`);
            }
            const displayName = project.displayName || project.projectId || 'Firebase project';
            const joined = details.join(' • ');
            hasItems = appendTimelineItem(timeline, displayName, joined) || hasItems;
        });
    } else if (Array.isArray(entry.deployments)) {
        entry.deployments.slice(0, 6).forEach(deployment => {
            if (!deployment) return;
            const details = [];
            const state = deployment.state || deployment.readyState;
            if (state) details.push(titleCase(state));
            const relative = formatRelativeTimeValue(deployment.createdAt || deployment.ready || deployment.updatedAt);
            if (relative) details.push(relative);
            const target = deployment.url || deployment.inspectUrl || deployment.target || null;
            const labelText = deployment.name || deployment.project || deployment.target || 'Deployment';
            const joined = details.join(' • ');
            hasItems = appendTimelineItem(timeline, labelText, joined, target) || hasItems;
        });
    }

    if (hasItems) {
        container.appendChild(timeline);
    } else {
        const empty = document.createElement('p');
        empty.className = 'muted-text';
        empty.textContent = 'No recent deployment activity detected.';
        container.appendChild(empty);
    }
}


function createIssueItem(issue, type = 'issue') {
    const severity = (issue?.severity || (type === 'warning' ? 'LOW' : 'INFO')).toString().toUpperCase();
    const item = document.createElement('li');
    item.className = `issue-item ${severityToClass(severity)}`;

    const icon = document.createElement('span');
    icon.className = 'issue-icon';
    icon.textContent = severityIcon(severity);

    const text = document.createElement('div');
    text.className = 'issue-text';
    text.textContent = issue.message || 'Issue detected';

    if (issue.file) {
        const fileDetail = document.createElement('span');
        fileDetail.className = 'issue-details';
        fileDetail.textContent = issue.file;
        text.appendChild(fileDetail);
    }

    if (Array.isArray(issue.details) && issue.details.length) {
        const details = document.createElement('span');
        details.className = 'issue-details';
        details.textContent = issue.details.join(' • ');
        text.appendChild(details);
    } else if (issue.details && typeof issue.details === 'string') {
        const details = document.createElement('span');
        details.className = 'issue-details';
        details.textContent = issue.details;
        text.appendChild(details);
    }

    item.append(icon, text);

    if (issue.autoFixable && issue.id) {
        const button = document.createElement('button');
        button.className = 'holo-button';
        button.type = 'button';
        button.textContent = 'Auto-fix';
        button.dataset.issueId = issue.id;
        button.dataset.issueLabel = issue.message || issue.id;
        button.addEventListener('click', assistantHandlers.handleAutoFix);
        item.appendChild(button);
    }

    return item;
}

function createGitIssueItem(entry) {
    const severity = gitStatusSeverity(entry.status || '');
    const item = document.createElement('li');
    item.className = `issue-item ${severityToClass(severity)}`;

    const icon = document.createElement('span');
    icon.className = 'issue-icon';
    icon.textContent = severityIcon(severity);

    const text = document.createElement('div');
    text.className = 'issue-text';
    const label = (entry.status || '').trim() || '??';
    text.textContent = `${label} ${entry.file || ''}`.trim();

    item.append(icon, text);
    return item;
}

function renderIssuesList() {
    const list = document.getElementById('issues-list');
    if (!list) return;

    if (!latestData.scan && !latestData.git) {
        const isFirstLoad = !list.dataset.loaded;
        setLoadingState(list, isFirstLoad ? 'Preparing issue data...' : 'Refreshing issue data...');
        return;
    }

    Array.from(list.children).forEach(child => {
        if (!child.classList.contains('loading-overlay')) {
            list.removeChild(child);
        }
    });

    const fragment = document.createDocumentFragment();
    let hasItems = false;

    if (latestData.scan) {
        const issues = Array.isArray(latestData.scan.issues) ? latestData.scan.issues : [];
        const warnings = Array.isArray(latestData.scan.warnings) ? latestData.scan.warnings : [];

        issues.forEach(issue => {
            fragment.appendChild(createIssueItem(issue));
            hasItems = true;
        });

        warnings.forEach(warning => {
            fragment.appendChild(createIssueItem(warning, 'warning'));
            hasItems = true;
        });

        if (!issues.length && !warnings.length) {
            fragment.appendChild(createInfoItem('🟢', 'No security issues detected', null, 'SUCCESS'));
            hasItems = true;
        }
    }

    if (latestData.git) {
        if (latestData.git.error) {
            fragment.appendChild(createInfoItem('⚠️', 'Git status unavailable', latestData.git.error, 'INFO'));
            hasItems = true;
        } else {
            if (latestData.git.branch) {
                fragment.appendChild(createInfoItem('🛰️', `On branch ${latestData.git.branch}`, null, 'LOW'));
                hasItems = true;
            }

            if (Array.isArray(latestData.git.status) && latestData.git.status.length) {
                latestData.git.status.forEach(entry => {
                    fragment.appendChild(createGitIssueItem(entry));
                    hasItems = true;
                });
            }

            if (Array.isArray(latestData.git.commits) && latestData.git.commits.length) {
                const recent = latestData.git.commits.slice(0, 3).map(commit => `${commit.hash} ${commit.message}`);
                fragment.appendChild(createInfoItem('🌀', 'Recent commits', recent.join(' • '), 'INFO'));
                hasItems = true;
            }
        }
    }

    if (!hasItems) {
        fragment.appendChild(createInfoItem('✨', 'Awaiting scan data', 'Trigger a scan to populate issues.', 'INFO'));
    }

    list.appendChild(fragment);
}

function populateStatus(data, { fromCache = false, timestamp, expired = false, offline = false } = {}) {
    const content = document.getElementById('status-content');
    const badge = document.getElementById('status-badge');
    if (!content) {
        return;
    }

    clearLoadingState(content);
    removeOfflineNotice(content);
    content.innerHTML = '';

    const projectNameLabel = document.getElementById('project-name');

    if (!data) {
        if (projectNameLabel && !projectNameLabel.textContent) {
            projectNameLabel.textContent = 'Guardian Project';
        }

        renderCardFallback(content, {
            offline,
            fromCache,
            expired,
            offlineMessage: 'Offline — reconnect to refresh project status.',
            cacheMessage: 'Cached project status unavailable.',
            emptyMessage: 'No project status available yet.',
            offlineMetaMessage: 'Offline – awaiting status data',
            emptyMetaMessage: 'Awaiting project status',
            badge,
            metaId: 'status-updated',
            setBadge,
            setUpdatedMeta
        });
        return;
    }

    if (projectNameLabel) {
        projectNameLabel.textContent = data.projectName || data.package?.name || 'Guardian Project';
    }

    const uncommitted = data.git?.uncommitted ?? 0;
    const dependencies = data.package
        ? (data.package.dependencies ?? 0) + (data.package.devDependencies ?? 0)
        : null;
    const experience = data.experienceLevel ? titleCase(data.experienceLevel) : 'Unknown';
    const badgeVariant = uncommitted > 0 ? 'status-warning' : 'status-good';
    const badgeText = uncommitted > 0 ? `${uncommitted} pending` : 'Healthy';

    renderMetrics(content, [
        { label: 'Experience Level', value: experience },
        data.package ? { label: 'Package Version', value: data.package.version || '—' } : null,
        { label: 'Dependencies', value: dependencies !== null ? dependencies : 'N/A' },
        { label: 'Branch', value: data.git?.branch || 'Unknown' },
        { label: 'Uncommitted Changes', value: uncommitted }
    ]);

    const derivedTimestamp = extractTimestamp(data, timestamp);
    if (derivedTimestamp) {
        const detail = document.createElement('p');
        detail.className = 'muted-text';
        detail.textContent = `Synced ${derivedTimestamp.toLocaleString()}`;
        content.appendChild(detail);
    }

    if (fromCache || offline || expired) {
        const note = document.createElement('p');
        note.className = 'muted-text';
        note.textContent = offline
            ? 'Offline — displaying last known project status.'
            : expired
                ? 'Cached project status may be stale.'
                : 'Showing cached project status.';
        content.appendChild(note);
    }

    setBadge(badge, badgeText, badgeVariant, deriveCardState({ offline, fromCache, expired }));

    setUpdatedMeta('status-updated', {
        timestamp: derivedTimestamp || timestamp || Date.now(),
        fromCache,
        expired,
        offline
    });

    content.dataset.loaded = 'true';
    if (badge) {
        badge.dataset.loaded = 'true';
    }
}

function populateSecurity(data, { fromCache = false, timestamp, expired = false, offline = false } = {}) {
    const content = document.getElementById('security-content');
    const badge = document.getElementById('security-badge');
    if (!content) {
        return;
    }

    clearLoadingState(content);
    removeOfflineNotice(content);
    content.innerHTML = '';

    if (data) {
        latestData.scan = data;
    } else {
        latestData.scan = null;
    }

    if (!data) {
        renderCardFallback(content, {
            offline,
            fromCache,
            expired,
            offlineMessage: 'Offline — no cached security scan available.',
            cacheMessage: 'Cached security scan unavailable.',
            emptyMessage: 'Security scan has not run yet.',
            offlineMetaMessage: 'Offline – scan unavailable',
            emptyMetaMessage: 'Scan not run yet',
            badge,
            metaId: 'security-updated',
            setBadge,
            setUpdatedMeta
        });

        renderIssuesList();
        return;
    }

    const counts = getSeverityCounts(data.issues);
    const warningCount = Array.isArray(data.warnings) ? data.warnings.length : 0;
    const badgeInfo = getSecurityBadge(counts, warningCount);

    renderMetrics(content, [
        { label: '🔴 Critical', value: counts.CRITICAL },
        { label: '🟠 High', value: counts.HIGH },
        { label: '🟡 Medium', value: counts.MEDIUM },
        { label: '⚪ Warnings', value: warningCount }
    ]);

    const secureScore = computeSecureScore(counts, warningCount);
    content.appendChild(createProgressBar(secureScore));

    if (fromCache || offline || expired) {
        const note = document.createElement('p');
        note.className = 'muted-text';
        note.textContent = offline
            ? 'Offline — displaying last security scan.'
            : expired
                ? 'Cached scan results may be stale.'
                : 'Showing cached scan results.';
        content.appendChild(note);
    }

    setBadge(badge, badgeInfo.text, badgeInfo.variant, deriveCardState({ offline, fromCache, expired }));

    const derivedTimestamp = extractTimestamp(data, timestamp);
    setUpdatedMeta('security-updated', {
        timestamp: derivedTimestamp || timestamp || Date.now(),
        fromCache,
        expired,
        offline
    });

    content.dataset.loaded = 'true';
    if (badge) {
        badge.dataset.loaded = 'true';
    }

    renderIssuesList();
}

function populateTools(data, { fromCache = false, timestamp, expired = false, offline = false } = {}) {
    const content = document.getElementById('tools-content');
    const badge = document.getElementById('tools-badge');
    if (!content) {
        return;
    }

    clearLoadingState(content);
    removeOfflineNotice(content);
    content.innerHTML = '';

    if (!data) {
        renderCardFallback(content, {
            offline,
            fromCache,
            expired,
            offlineMessage: 'Offline — tooling insights will resume when reconnected.',
            cacheMessage: 'No cached tooling insights available.',
            emptyMessage: 'No tooling signals detected yet.',
            offlineMetaMessage: 'Offline – awaiting tool signals',
            emptyMetaMessage: 'Awaiting tool signals',
            badge,
            metaId: 'tools-updated',
            setBadge,
            setUpdatedMeta
        });

        return;
    }

    const detected = Array.isArray(data.detected) ? data.detected : [];
    const missing = Array.isArray(data.missing) ? data.missing : [];
    const recommendations = Array.isArray(data.recommendations) ? data.recommendations : [];

    const badgeVariant = missing.length ? 'status-warning' : 'status-good';
    const badgeText = missing.length
        ? `${detected.length} detected • ${missing.length} missing`
        : `${detected.length} detected`;

    if (!detected.length && !missing.length && !recommendations.length) {
        const empty = document.createElement('p');
        empty.className = 'muted-text';
        empty.textContent = offline
            ? 'Offline — tooling insights will resume when reconnected.'
            : fromCache
                ? 'No cached tooling insights available.'
                : 'No tooling signals detected yet.';
        content.appendChild(empty);
    } else {
        if (detected.length) {
            const title = document.createElement('div');
            title.className = 'metric-section-title';
            title.textContent = 'Detected';
            content.appendChild(title);

            renderMetrics(content, detected.map(tool => ({
                label: formatToolLabel(tool),
                value: tool.cliRequired?.command || tool.command || tool.version || tool.package || 'Available'
            })));
        }

        if (missing.length) {
            const title = document.createElement('div');
            title.className = 'metric-section-title';
            title.textContent = 'Missing';
            content.appendChild(title);

            missing.forEach(tool => {
                const row = document.createElement('div');
                row.className = 'metric metric-actionable';

                const label = document.createElement('span');
                label.className = 'metric-label';
                const toolLabel = formatToolLabel(tool);
                label.textContent = toolLabel;

                const installCommand = resolveInstallCommand(tool);
                const docsLink = resolveDocsLink(tool);
                const actions = document.createElement('div');
                actions.className = 'metric-actions';

                if (installCommand) {
                    const installButton = document.createElement('button');
                    installButton.type = 'button';
                    installButton.className = 'holo-button compact';
                    installButton.textContent = 'Install';
                    installButton.dataset.command = installCommand;
                    installButton.dataset.tool = toolLabel;
                    installButton.addEventListener('click', assistantHandlers.handleInstallTool);
                    actions.appendChild(installButton);

                    const copyButton = document.createElement('button');
                    copyButton.type = 'button';
                    copyButton.className = 'holo-button compact';
                    copyButton.textContent = 'Copy';
                    copyButton.dataset.command = installCommand;
                    copyButton.dataset.tool = toolLabel;
                    copyButton.setAttribute('aria-label', `Copy install command for ${toolLabel}`);
                    copyButton.addEventListener('click', handleCopyInstallCommand);
                    actions.appendChild(copyButton);
                } else if (docsLink) {
                    const docsButton = document.createElement('a');
                    docsButton.className = 'holo-button compact';
                    docsButton.textContent = 'Docs';
                    docsButton.href = docsLink;
                    docsButton.target = '_blank';
                    docsButton.rel = 'noopener noreferrer';
                    actions.appendChild(docsButton);
                } else {
                    const manualButton = document.createElement('button');
                    manualButton.type = 'button';
                    manualButton.className = 'holo-button compact';
                    manualButton.textContent = 'Manual';
                    manualButton.disabled = true;
                    manualButton.title = 'Review details below to install manually.';
                    actions.appendChild(manualButton);
                }

                row.append(label, actions);
                content.appendChild(row);

                const detailParts = [];
                if (tool.reason) detailParts.push(tool.reason);
                if (!installCommand && tool.install && !tool.installCommand) {
                    detailParts.push(`Install hint: ${tool.install}`);
                } else if (installCommand) {
                    detailParts.push(`Command: ${installCommand}`);
                }

                if (detailParts.length) {
                    const detailEl = document.createElement('div');
                    detailEl.className = 'metric-details';
                    detailEl.textContent = detailParts.join(' • ');
                    content.appendChild(detailEl);
                }

                if (docsLink && installCommand) {
                    const docsAnchor = document.createElement('a');
                    docsAnchor.className = 'metric-link';
                    docsAnchor.href = docsLink;
                    docsAnchor.target = '_blank';
                    docsAnchor.rel = 'noopener noreferrer';
                    docsAnchor.textContent = 'View documentation';
                    content.appendChild(docsAnchor);
                }
            });
        }

        if (recommendations.length) {
            const title = document.createElement('div');
            title.className = 'metric-section-title';
            title.textContent = 'Recommendations';
            content.appendChild(title);

            recommendations.forEach(rec => {
                const row = document.createElement('div');
                row.className = 'metric';

                const label = document.createElement('span');
                label.className = 'metric-label';
                label.textContent = rec.reason || titleCase(rec.category);

                const value = document.createElement('span');
                value.className = 'metric-value';
                value.textContent = rec.suggestion || 'Review';

                row.append(label, value);
                content.appendChild(row);

                if (Array.isArray(rec.options) && rec.options.length) {
                    const detailEl = document.createElement('div');
                    detailEl.className = 'metric-details';
                    detailEl.textContent = rec.options.map(option => option.name).join(' • ');
                    content.appendChild(detailEl);
                }
            });
        }
    }

    if (fromCache || offline || expired) {
        const note = document.createElement('p');
        note.className = 'muted-text';
        note.textContent = offline
            ? 'Offline — showing cached tool inventory.'
            : expired
                ? 'Cached tooling snapshot may be stale.'
                : 'Showing cached tooling snapshot.';
        content.appendChild(note);
    }

    setBadge(badge, badgeText, badgeVariant, deriveCardState({ offline, fromCache, expired }));

    setUpdatedMeta('tools-updated', {
        timestamp: extractTimestamp(data, timestamp) || timestamp || Date.now(),
        fromCache,
        expired,
        offline
    });

    content.dataset.loaded = 'true';
    if (badge) {
        badge.dataset.loaded = 'true';
    }
}

function populateDeployments(data, { fromCache = false, timestamp, expired = false, offline = false } = {}) {
    const content = document.getElementById('deployments-content');
    const badge = document.getElementById('deployments-badge');
    if (!content) {
        return;
    }

    clearLoadingState(content);
    removeOfflineNotice(content);
    content.innerHTML = '';

    const entries = Array.isArray(data) ? data : [];
    latestData.deployments = entries;

    let derivedTimestamp = null;
    entries.forEach(entry => {
        const candidate = extractTimestamp(entry);
        if (candidate && (!derivedTimestamp || candidate > derivedTimestamp)) {
            derivedTimestamp = candidate;
        }
    });

    if (!entries.length) {
        renderCardFallback(content, {
            offline,
            fromCache,
            expired,
            offlineMessage: 'Offline — deployment history will resume when reconnected.',
            cacheMessage: 'No cached deployment providers detected.',
            emptyMessage: 'No deployment providers detected yet.',
            offlineMetaMessage: 'Offline – awaiting deployment history',
            emptyMetaMessage: 'Awaiting deployment history',
            badge,
            pendingBadgeText: 'No data',
            metaId: 'deployments-updated',
            setBadge,
            setUpdatedMeta
        });
    } else {
        const providers = entries.length;
        setBadge(badge, `${providers} provider${providers === 1 ? '' : 's'}`, 'status-good', deriveCardState({ offline, fromCache, expired }));

        entries.forEach(entry => renderDeploymentSection(content, entry));

        if (fromCache || offline || expired) {
            const note = document.createElement('p');
            note.className = 'muted-text';
            note.textContent = offline
                ? 'Offline — showing cached deployment history.'
                : expired
                    ? 'Cached deployment history may be stale.'
                    : 'Showing cached deployment history.';
            content.appendChild(note);
        }
    }

    if (entries.length) {
        setUpdatedMeta('deployments-updated', {
            timestamp: derivedTimestamp || timestamp || Date.now(),
            fromCache,
            expired,
            offline
        });
    }

    if (!entries.length) {
        return;
    }

    content.dataset.loaded = 'true';
    if (badge) {
        badge.dataset.loaded = 'true';
    }
}

function populateGitHub(data, { fromCache = false, timestamp, expired = false, offline = false } = {}) {
    const content = document.getElementById('github-content');
    const badge = document.getElementById('github-badge');
    if (!content) {
        return;
    }

    clearLoadingState(content);
    removeOfflineNotice(content);
    content.innerHTML = '';

    latestData.github = data || null;

    if (!data || data.error) {
        renderCardFallback(content, {
            offline,
            fromCache,
            expired,
            offlineMessage: data?.error || 'Offline — repository insights unavailable.',
            cacheMessage: data?.error || 'Cached repository insights unavailable.',
            emptyMessage: data?.error || 'Repository information unavailable.',
            offlineMetaMessage: data?.error || 'Offline – repository insights unavailable',
            emptyMetaMessage: data?.error || 'Awaiting repository insights',
            badge,
            offlineBadgeText: data?.error ? 'Unavailable' : 'Offline',
            pendingBadgeText: data?.error ? 'Unavailable' : 'Pending',
            metaId: 'github-updated',
            setBadge,
            setUpdatedMeta
        });
        return;
    }

    const repoName = data.name || data.repo || 'Repository';
    const owner = data.owner || data.organization || '';
    const fullName = owner ? `${owner}/${repoName}` : repoName;

    const header = document.createElement('div');
    header.className = 'metric-section-title';
    header.textContent = 'Overview';
    content.appendChild(header);

    const nameRow = document.createElement('div');
    nameRow.className = 'metric';
    const nameLabel = document.createElement('span');
    nameLabel.className = 'metric-label';
    nameLabel.textContent = 'Repository';
    const nameValue = document.createElement('span');
    nameValue.className = 'metric-value';
    nameValue.textContent = fullName;
    nameRow.append(nameLabel, nameValue);
    content.appendChild(nameRow);

    if (data.description) {
        const description = document.createElement('div');
        description.className = 'metric-details';
        description.textContent = data.description;
        content.appendChild(description);
    }

    const metrics = [
        data.stargazerCount !== undefined ? { label: 'Stars', value: data.stargazerCount } : null,
        data.isPrivate !== undefined ? { label: 'Visibility', value: data.isPrivate ? 'Private' : 'Public' } : null
    ].filter(Boolean);

    if (metrics.length) {
        renderMetrics(content, metrics);
    }

    if (data.url) {
        const link = document.createElement('a');
        link.href = data.url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.className = 'metric-link';
        link.textContent = 'Open on GitHub';
        content.appendChild(link);
    }

    if (fromCache || offline || expired) {
        const note = document.createElement('p');
        note.className = 'muted-text';
        note.textContent = offline
            ? 'Offline — showing cached repository insights.'
            : expired
                ? 'Cached repository insights may be stale.'
                : 'Showing cached repository insights.';
        content.appendChild(note);
    }

    const badgeVariant = data.isPrivate ? 'status-warning' : 'status-good';
    const badgeText = data.stargazerCount !== undefined
        ? `${data.stargazerCount} ⭐`
        : data.isPrivate ? 'Private' : 'Linked';

    setBadge(badge, badgeText, badgeVariant, deriveCardState({ offline, fromCache, expired }));

    setUpdatedMeta('github-updated', {
        timestamp: extractTimestamp(data, timestamp) || timestamp || Date.now(),
        fromCache,
        expired,
        offline
    });

    content.dataset.loaded = 'true';
    if (badge) {
        badge.dataset.loaded = 'true';
    }
}

async function loadStatus() {
    const content = document.getElementById('status-content');
    const badge = document.getElementById('status-badge');

    if (!content) {
        return;
    }

    const cached = readCache('status');

    if (!isOnline()) {
        if (cached?.data) {
            populateStatus(cached.data, {
                fromCache: true,
                timestamp: cached.timestamp,
                expired: cached.expired,
                offline: true
            });
        } else {
            clearLoadingState(content);
            content.innerHTML = '';
            showOfflineNotice(content, 'Reconnect to update project status.');
            setBadge(badge, 'Offline', 'status-warning', { source: 'offline', state: 'offline' });
            setUpdatedMeta('status-updated', {
                message: 'Offline – no cached status data',
                fromCache: true,
                offline: true
            });
        }
        return;
    }

    removeOfflineNotice(content);
    const isFirstLoad = !content.dataset.loaded && !cached?.data;
    setLoadingState(content, isFirstLoad ? 'Analyzing project...' : 'Refreshing status...');
    setBadge(badge, isFirstLoad ? 'Loading...' : 'Refreshing...', 'status-warning', { source: 'live' });

    try {
        const data = await fetchJSON('status', '/api/status', { cache: 'no-store' });
        saveCache('status', data);
        const derivedTimestamp = extractTimestamp(data) || Date.now();
        populateStatus(data, { timestamp: derivedTimestamp });
    } catch (error) {
        if (error.name === 'AbortError') {
            return;
        }

        if (!isOnline()) {
            if (cached?.data) {
                populateStatus(cached.data, {
                    fromCache: true,
                    timestamp: cached.timestamp,
                    expired: cached.expired,
                    offline: true
                });
            } else {
                clearLoadingState(content);
                content.innerHTML = '';
                showOfflineNotice(content, 'Reconnect to update project status.');
                setBadge(badge, 'Offline', 'status-warning', { source: 'offline', state: 'offline' });
                setUpdatedMeta('status-updated', {
                    message: 'Offline – no cached status data',
                    fromCache: true,
                    offline: true
                });
            }
            return;
        }

        console.error('Failed to load status', error);
        if (cached?.data) {
            populateStatus(cached.data, {
                fromCache: true,
                timestamp: cached.timestamp,
                expired: cached.expired
            });
            const variant = error.name === 'TimeoutError' ? 'warning' : 'error';
            const message = error.name === 'TimeoutError'
                ? 'Project status request timed out. Showing cached data.'
                : `Unable to load project status. Showing cached data. (${error.message})`;
            showToast(message, variant);
        } else {
            clearLoadingState(content);
            setBadge(badge, 'Error', 'status-error', { source: 'error' });
            content.innerHTML = `<p class="error-text">Unable to load project status.<br><small>${error.message}</small></p>`;
            setUpdatedMeta('status-updated', {
                message: 'Last project status update failed',
                fromCache: false
            });
            const variant = error.name === 'TimeoutError' ? 'warning' : 'error';
            const message = error.name === 'TimeoutError'
                ? 'Project status request timed out. Retrying shortly.'
                : `Unable to load project status: ${error.message}`;
            showToast(message, variant);
        }
    }
}

async function loadSecurity() {
    const content = document.getElementById('security-content');
    const badge = document.getElementById('security-badge');

    if (!content) {
        return;
    }

    const cached = readCache('security');

    if (!isOnline()) {
        if (cached?.data) {
            populateSecurity(cached.data, {
                fromCache: true,
                timestamp: cached.timestamp,
                expired: cached.expired,
                offline: true
            });
        } else {
            clearLoadingState(content);
            content.innerHTML = '';
            showOfflineNotice(content, 'Reconnect to run security scans.');
            setBadge(badge, 'Offline', 'status-warning', { source: 'offline', state: 'offline' });
            setUpdatedMeta('security-updated', {
                message: 'Offline – scan unavailable',
                fromCache: true,
                offline: true
            });
            latestData.scan = null;
            renderIssuesList();
        }
        return;
    }

    removeOfflineNotice(content);
    const isFirstLoad = !content.dataset.loaded && !cached?.data;
    setLoadingState(content, isFirstLoad ? 'Scanning for threats...' : 'Refreshing scan results...');
    setBadge(badge, isFirstLoad ? 'Scanning...' : 'Refreshing...', 'status-warning', { source: 'live' });

    try {
        const data = await fetchJSON('security', '/api/scan', {
            method: 'POST',
            timeout: 60_000,
            cache: 'no-store'
        });
        saveCache('security', data);
        const derivedTimestamp = extractTimestamp(data) || Date.now();
        populateSecurity(data, { timestamp: derivedTimestamp });
    } catch (error) {
        if (error.name === 'AbortError') {
            return;
        }

        if (!isOnline()) {
            if (cached?.data) {
                populateSecurity(cached.data, {
                    fromCache: true,
                    timestamp: cached.timestamp,
                    expired: cached.expired,
                    offline: true
                });
            } else {
                clearLoadingState(content);
                content.innerHTML = '';
                showOfflineNotice(content, 'Reconnect to run security scans.');
                setBadge(badge, 'Offline', 'status-warning', { source: 'offline', state: 'offline' });
                setUpdatedMeta('security-updated', {
                    message: 'Offline – scan unavailable',
                    fromCache: true,
                    offline: true
                });
                latestData.scan = null;
                renderIssuesList();
            }
            return;
        }

        console.error('Failed to load security scan', error);
        if (cached?.data) {
            populateSecurity(cached.data, {
                fromCache: true,
                timestamp: cached.timestamp,
                expired: cached.expired
            });
            const variant = error.name === 'TimeoutError' ? 'warning' : 'error';
            const message = error.name === 'TimeoutError'
                ? 'Security scan timed out. Showing cached results.'
                : `Security scan failed. Showing cached results. (${error.message})`;
            showToast(message, variant);
        } else {
            clearLoadingState(content);
            setBadge(badge, 'Error', 'status-error', { source: 'error' });
            content.innerHTML = `<p class="error-text">Security scan failed.<br><small>${error.message}</small></p>`;
            setUpdatedMeta('security-updated', {
                message: 'Security scan failed',
                fromCache: false
            });
            const variant = error.name === 'TimeoutError' ? 'warning' : 'error';
            const message = error.name === 'TimeoutError'
                ? 'Security scan timed out. Please try again.'
                : `Security scan failed: ${error.message}`;
            showToast(message, variant);
        }
    }
}

async function loadTools() {
    const content = document.getElementById('tools-content');
    const badge = document.getElementById('tools-badge');

    if (!content) {
        return;
    }

    const cached = readCache('tools');

    if (!isOnline()) {
        if (cached?.data) {
            populateTools(cached.data, {
                fromCache: true,
                timestamp: cached.timestamp,
                expired: cached.expired,
                offline: true
            });
        } else {
            clearLoadingState(content);
            content.innerHTML = '';
            showOfflineNotice(content, 'Reconnect to detect tooling and recommendations.');
            setBadge(badge, 'Offline', 'status-warning', { source: 'offline', state: 'offline' });
            setUpdatedMeta('tools-updated', {
                message: 'Offline – no cached tooling data',
                fromCache: true,
                offline: true
            });
        }
        return;
    }

    removeOfflineNotice(content);
    const isFirstLoad = !content.dataset.loaded && !cached?.data;
    setLoadingState(content, isFirstLoad ? 'Detecting tools...' : 'Refreshing tooling insights...');
    setBadge(badge, isFirstLoad ? 'Detecting...' : 'Refreshing...', 'status-warning', { source: 'live' });

    try {
        const data = await fetchJSON('tools', '/api/tools', { cache: 'no-store' });
        saveCache('tools', data);
        const derivedTimestamp = extractTimestamp(data) || Date.now();
        populateTools(data, { timestamp: derivedTimestamp });
    } catch (error) {
        if (error.name === 'AbortError') {
            return;
        }

        if (!isOnline()) {
            if (cached?.data) {
                populateTools(cached.data, {
                    fromCache: true,
                    timestamp: cached.timestamp,
                    expired: cached.expired,
                    offline: true
                });
            } else {
                clearLoadingState(content);
                content.innerHTML = '';
                showOfflineNotice(content, 'Reconnect to detect tooling and recommendations.');
                setBadge(badge, 'Offline', 'status-warning', { source: 'offline', state: 'offline' });
                setUpdatedMeta('tools-updated', {
                    message: 'Offline – no cached tooling data',
                    fromCache: true,
                    offline: true
                });
            }
            return;
        }

        console.error('Failed to load tools', error);
        if (cached?.data) {
            populateTools(cached.data, {
                fromCache: true,
                timestamp: cached.timestamp,
                expired: cached.expired
            });
            const variant = error.name === 'TimeoutError' ? 'warning' : 'error';
            const message = error.name === 'TimeoutError'
                ? 'Tool detection request timed out. Showing cached insights.'
                : `Tool detection failed. Showing cached insights. (${error.message})`;
            showToast(message, variant);
        } else {
            clearLoadingState(content);
            setBadge(badge, 'Error', 'status-error', { source: 'error' });
            content.innerHTML = `<p class="error-text">Tool detection failed.<br><small>${error.message}</small></p>`;
            setUpdatedMeta('tools-updated', {
                message: 'Tool detection failed',
                fromCache: false
            });
            const variant = error.name === 'TimeoutError' ? 'warning' : 'error';
            const message = error.name === 'TimeoutError'
                ? 'Tool detection request timed out. Retrying shortly.'
                : `Tool detection failed: ${error.message}`;
            showToast(message, variant);
        }
    }
}

async function loadDeployments() {
    const content = document.getElementById('deployments-content');
    const badge = document.getElementById('deployments-badge');

    if (!content) {
        return;
    }

    const cached = readCache('deployments');

    if (!isOnline()) {
        if (cached?.data) {
            populateDeployments(cached.data, {
                fromCache: true,
                timestamp: cached.timestamp,
                expired: cached.expired,
                offline: true
            });
        } else {
            clearLoadingState(content);
            content.innerHTML = '';
            showOfflineNotice(content, 'Reconnect to fetch deployment history.');
            setBadge(badge, 'Offline', 'status-warning', { source: 'offline', state: 'offline' });
            setUpdatedMeta('deployments-updated', {
                message: 'Offline – no cached deployment history',
                fromCache: true,
                offline: true
            });
        }
        return;
    }

    removeOfflineNotice(content);
    const isFirstLoad = !content.dataset.loaded && !cached?.data;
    setLoadingState(content, isFirstLoad ? 'Discovering deployment targets...' : 'Refreshing deployment history...');
    setBadge(badge, isFirstLoad ? 'Loading...' : 'Refreshing...', 'status-warning', { source: 'live' });

    try {
        const data = await fetchJSON('deployments', '/api/deployments', { cache: 'no-store', timeout: 45_000 });
        saveCache('deployments', data);
        populateDeployments(data, { timestamp: Date.now() });
    } catch (error) {
        if (error.name === 'AbortError') {
            return;
        }

        if (!isOnline()) {
            if (cached?.data) {
                populateDeployments(cached.data, {
                    fromCache: true,
                    timestamp: cached.timestamp,
                    expired: cached.expired,
                    offline: true
                });
            } else {
                clearLoadingState(content);
                content.innerHTML = '';
                showOfflineNotice(content, 'Reconnect to fetch deployment history.');
                setBadge(badge, 'Offline', 'status-warning', { source: 'offline', state: 'offline' });
                setUpdatedMeta('deployments-updated', {
                    message: 'Offline – no cached deployment history',
                    fromCache: true,
                    offline: true
                });
            }
            return;
        }

        console.error('Failed to load deployments', error);
        if (cached?.data) {
            populateDeployments(cached.data, {
                fromCache: true,
                timestamp: cached.timestamp,
                expired: cached.expired
            });
            const variant = error.name === 'TimeoutError' ? 'warning' : 'error';
            const message = error.name === 'TimeoutError'
                ? 'Deployment providers request timed out. Showing cached history.'
                : `Unable to load deployments. Showing cached history. (${error.message})`;
            showToast(message, variant);
        } else {
            clearLoadingState(content);
            setBadge(badge, 'Error', 'status-error', { source: 'error' });
            content.innerHTML = `<p class="error-text">Unable to load deployments.<br><small>${error.message}</small></p>`;
            setUpdatedMeta('deployments-updated', {
                message: 'Deployment fetch failed',
                fromCache: false
            });
            const variant = error.name === 'TimeoutError' ? 'warning' : 'error';
            const message = error.name === 'TimeoutError'
                ? 'Deployment providers request timed out.'
                : `Unable to load deployments: ${error.message}`;
            showToast(message, variant);
        }
    }
}

async function loadGitHub() {
    const content = document.getElementById('github-content');
    const badge = document.getElementById('github-badge');

    if (!content) {
        return;
    }

    const cached = readCache('github');

    if (!isOnline()) {
        if (cached?.data) {
            populateGitHub(cached.data, {
                fromCache: true,
                timestamp: cached.timestamp,
                expired: cached.expired,
                offline: true
            });
        } else {
            clearLoadingState(content);
            content.innerHTML = '';
            showOfflineNotice(content, 'Reconnect to refresh repository insights.');
            setBadge(badge, 'Offline', 'status-warning', { source: 'offline', state: 'offline' });
            setUpdatedMeta('github-updated', {
                message: 'Offline – no cached repository insights',
                fromCache: true,
                offline: true
            });
        }
        return;
    }

    removeOfflineNotice(content);
    const isFirstLoad = !content.dataset.loaded && !cached?.data;
    setLoadingState(content, isFirstLoad ? 'Gathering repository insights...' : 'Refreshing repository info...');
    setBadge(badge, isFirstLoad ? 'Loading...' : 'Refreshing...', 'status-warning', { source: 'live' });

    try {
        const data = await fetchJSON('github', '/api/github', { cache: 'no-store', timeout: 30_000 });
        saveCache('github', data);
        const derivedTimestamp = extractTimestamp(data) || Date.now();
        populateGitHub(data, { timestamp: derivedTimestamp });
    } catch (error) {
        if (error.name === 'AbortError') {
            return;
        }

        if (!isOnline()) {
            if (cached?.data) {
                populateGitHub(cached.data, {
                    fromCache: true,
                    timestamp: cached.timestamp,
                    expired: cached.expired,
                    offline: true
                });
            } else {
                clearLoadingState(content);
                content.innerHTML = '';
                showOfflineNotice(content, 'Reconnect to refresh repository insights.');
                setBadge(badge, 'Offline', 'status-warning', { source: 'offline', state: 'offline' });
                setUpdatedMeta('github-updated', {
                    message: 'Offline – no cached repository insights',
                    fromCache: true,
                    offline: true
                });
            }
            return;
        }

        console.error('Failed to load repository details', error);
        if (cached?.data) {
            populateGitHub(cached.data, {
                fromCache: true,
                timestamp: cached.timestamp,
                expired: cached.expired
            });
            const variant = error.name === 'TimeoutError' ? 'warning' : 'error';
            const message = error.name === 'TimeoutError'
                ? 'Repository info request timed out. Showing cached data.'
                : `Unable to load repository info. Showing cached data. (${error.message})`;
            showToast(message, variant);
        } else {
            clearLoadingState(content);
            setBadge(badge, 'Error', 'status-error', { source: 'error' });
            content.innerHTML = `<p class="error-text">Unable to load repository info.<br><small>${error.message}</small></p>`;
            setUpdatedMeta('github-updated', {
                message: 'Repository fetch failed',
                fromCache: false
            });
            const variant = error.name === 'TimeoutError' ? 'warning' : 'error';
            const message = error.name === 'TimeoutError'
                ? 'Repository info request timed out.'
                : `Unable to load repository info: ${error.message}`;
            showToast(message, variant);
        }
    }
}

async function loadIssues() {
    const list = document.getElementById('issues-list');
    if (!list) {
        return;
    }

    const cached = readCache('git');

    const applyOfflineCache = () => {
        list.querySelectorAll('.offline-notice').forEach(node => node.remove());
        if (cached?.data) {
            latestData.git = cached.data;
            clearLoadingState(list);
            list.dataset.loaded = 'true';
            renderIssuesList();

            const notice = createInfoItem('📡', 'Offline mode', 'Showing cached repository status.', 'INFO');
            notice.classList.add('offline-notice');
            list.insertBefore(notice, list.firstChild || null);

            setUpdatedMeta('issues-updated', {
                timestamp: cached.timestamp || Date.now(),
                fromCache: true,
                expired: cached.expired,
                offline: true
            });
        } else {
            clearLoadingState(list);
            const notice = createInfoItem('📡', 'Offline mode', 'Reconnect to sync repository status.', 'INFO');
            notice.classList.add('offline-notice');
            list.insertBefore(notice, list.firstChild || null);
            setUpdatedMeta('issues-updated', {
                message: 'Offline – no cached repository status',
                fromCache: true,
                offline: true
            });
        }
    };

    if (!isOnline()) {
        applyOfflineCache();
        return;
    }

    list.querySelectorAll('.offline-notice').forEach(node => node.remove());

    const isFirstLoad = !list.dataset.loaded && !cached?.data;
    setLoadingState(list, isFirstLoad ? 'Gathering repository status...' : 'Refreshing repository status...');

    try {
        const data = await fetchJSON('issues', '/api/git-status', { cache: 'no-store' });
        latestData.git = data;
        saveCache('git', data);
        clearLoadingState(list);
        list.dataset.loaded = 'true';
        renderIssuesList();
        setUpdatedMeta('issues-updated', {
            timestamp: extractTimestamp(data) || Date.now(),
            fromCache: false
        });
    } catch (error) {
        if (error.name === 'AbortError') {
            return;
        }

        if (!isOnline()) {
            applyOfflineCache();
            return;
        }

        console.error('Failed to load repository status', error);
        clearLoadingState(list);

        if (cached?.data) {
            latestData.git = cached.data;
            list.dataset.loaded = 'true';
            renderIssuesList();
            setUpdatedMeta('issues-updated', {
                timestamp: cached.timestamp || Date.now(),
                fromCache: true,
                expired: cached.expired
            });

            const variant = error.name === 'TimeoutError' ? 'warning' : 'error';
            const message = error.name === 'TimeoutError'
                ? 'Repository status request timed out. Showing cached status.'
                : `Unable to load repository status. Showing cached status. (${error.message})`;
            showToast(message, variant);
        } else {
            list.querySelectorAll('.temporary-error').forEach(node => node.remove());

            const notice = createInfoItem('⚠️', 'Unable to load repository status', error.message, 'INFO');
            notice.classList.add('temporary-error');
            list.insertBefore(notice, list.firstChild || null);
            setTimeout(() => {
                if (notice.parentElement === list) {
                    notice.remove();
                }
            }, 8000);

            const variant = error.name === 'TimeoutError' ? 'warning' : 'error';
            const message = error.name === 'TimeoutError'
                ? 'Repository status request timed out. Will retry automatically.'
                : `Unable to load repository status: ${error.message}`;
            showToast(message, variant);

            setUpdatedMeta('issues-updated', {
                message: 'Repository status failed',
                fromCache: false
            });
        }
    }
}

function restoreCachedCards() {
    const offline = !isOnline();

    const statusCache = readCache('status');
    if (statusCache?.data) {
        populateStatus(statusCache.data, {
            fromCache: true,
            timestamp: statusCache.timestamp,
            expired: statusCache.expired,
            offline
        });
    }

    const securityCache = readCache('security');
    if (securityCache?.data) {
        populateSecurity(securityCache.data, {
            fromCache: true,
            timestamp: securityCache.timestamp,
            expired: securityCache.expired,
            offline
        });
    }

    const toolsCache = readCache('tools');
    if (toolsCache?.data) {
        populateTools(toolsCache.data, {
            fromCache: true,
            timestamp: toolsCache.timestamp,
            expired: toolsCache.expired,
            offline
        });
    }

    const deploymentsCache = readCache('deployments');
    if (deploymentsCache?.data) {
        populateDeployments(deploymentsCache.data, {
            fromCache: true,
            timestamp: deploymentsCache.timestamp,
            expired: deploymentsCache.expired,
            offline
        });
    }

    const githubCache = readCache('github');
    if (githubCache?.data) {
        populateGitHub(githubCache.data, {
            fromCache: true,
            timestamp: githubCache.timestamp,
            expired: githubCache.expired,
            offline
        });
    }

    const gitCache = readCache('git');
    if (gitCache?.data) {
        latestData.git = gitCache.data;
        const list = document.getElementById('issues-list');
        if (list) {
            clearLoadingState(list);
            list.dataset.loaded = 'true';
            renderIssuesList();

            if (offline) {
                list.querySelectorAll('.offline-notice').forEach(node => node.remove());
                const notice = createInfoItem('📡', 'Offline mode', 'Showing cached repository status.', 'INFO');
                notice.classList.add('offline-notice');
                list.insertBefore(notice, list.firstChild || null);
            }
        }

        setUpdatedMeta('issues-updated', {
            timestamp: gitCache.timestamp || Date.now(),
            fromCache: true,
            expired: gitCache.expired,
            offline
        });
    }
}

async function refreshScan() {
    if (!isOnline()) {
        showToast('Cannot rescan while offline. Reconnect to run security checks.', 'warning');
        return;
    }

    const card = document.getElementById('issues-card');
    if (card) {
        card.classList.add('active');
    }

    try {
        await Promise.all([loadSecurity(), loadIssues()]);
    } finally {
        setTimeout(() => {
            if (card) {
                card.classList.remove('active');
            }
        }, 600);
    }
}

const rescanButton = document.getElementById('rescan-button');
if (rescanButton) {
    rescanButton.addEventListener('click', refreshScan);
}

document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
        loadStatus();
        loadIssues();
        loadTools();
        loadDeployments();
        loadGitHub();
    }
});

window.addEventListener('beforeunload', stopAutoRefresh);

requestAnimationFrame(() => {
    loadSecurity();
    startAutoRefresh();
});

// Card click effects
document.querySelectorAll('.neo-card').forEach(card => {
    card.addEventListener('click', function(e) {
        if (e.target.tagName !== 'BUTTON') {
            this.classList.toggle('active');
        }
    });
});
