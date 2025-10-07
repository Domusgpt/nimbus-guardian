export function initHolographicDashboard() {
    // Parallax effect on mouse move (reduced intensity)
    const scene = document.getElementById('scene');
    const mouseXDisplay = document.getElementById('mouseX');
    const mouseYDisplay = document.getElementById('mouseY');
    const networkStatusLabel = document.getElementById('network-status');
    const motionStatusLabel = document.getElementById('motion-status');
    const assistantCard = document.getElementById('assistant-card');
    const assistantLog = document.getElementById('assistant-log');
    const assistantForm = document.getElementById('assistant-form');
    const assistantInput = document.getElementById('assistant-input');
    const assistantSendButton = document.getElementById('assistant-send');
    const assistantClearButton = document.getElementById('assistant-clear');
    const assistantStopButton = document.getElementById('assistant-stop');
    const assistantContextButton = document.getElementById('assistant-context');
    const assistantExportButton = document.getElementById('assistant-export');
    const assistantContextStatus = document.getElementById('assistant-context-status');
    const assistantContextPanel = document.getElementById('assistant-context-panel');
    const assistantContextContent = document.getElementById('assistant-context-content');
    const assistantContextClose = document.getElementById('assistant-context-close');
    const assistantSuggestions = document.getElementById('assistant-suggestions');
    const assistantSnippetsToggle = document.getElementById('assistant-snippets-toggle');
    const assistantSnippetsPanel = document.getElementById('assistant-snippets-panel');
    const assistantSnippetsFilters = document.getElementById('assistant-snippets-filters');
    const assistantSnippetsList = document.getElementById('assistant-snippets-list');
    const assistantSnippetsHint = document.getElementById('assistant-snippets-hint');
    const assistantSnippetsSearch = document.getElementById('assistant-snippets-search');
    const assistantSnippetsClear = document.getElementById('assistant-snippets-clear');
    const assistantBadge = document.getElementById('assistant-badge');
    const assistantMeta = document.getElementById('assistant-updated');
    const issuesRescanButton = document.getElementById('issues-rescan');

    const particleElements = [];
    const prefersReducedMotion = typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-reduced-motion: reduce)')
        : { matches: false };
    let parallaxEnabled = !prefersReducedMotion.matches;
    let isCardHovered = false;
    let lastKnownOnline = navigator.onLine !== false;

    function isOnline() {
        return navigator.onLine !== false;
    }

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

    function updateMotionPreference() {
        parallaxEnabled = !prefersReducedMotion.matches;

        if (!parallaxEnabled && scene) {
            scene.style.transform = '';
        }

        if (motionStatusLabel) {
            motionStatusLabel.textContent = parallaxEnabled ? 'Active' : 'Reduced';
            motionStatusLabel.classList.toggle('reduced', !parallaxEnabled);
        }

        if (!parallaxEnabled) {
            mouseXDisplay.textContent = 0;
            mouseYDisplay.textContent = 0;
        }

        document.body.classList.toggle('reduced-motion', !parallaxEnabled);

        particleElements.forEach(particle => {
            if (!particle) return;
            particle.style.animationPlayState = parallaxEnabled ? 'running' : 'paused';
        });
    }

    function updateNetworkStatus({ notify = false } = {}) {
        const online = isOnline();

        if (networkStatusLabel) {
            networkStatusLabel.textContent = online ? 'Online' : 'Offline';
            networkStatusLabel.classList.toggle('offline', !online);
        }

        document.body.classList.toggle('is-offline', !online);

        if (notify && online !== lastKnownOnline) {
            showToast(
                online
                    ? 'Connection restored. Resuming live updates.'
                    : 'You appear to be offline. Data may be stale.',
                online ? 'success' : 'warning'
            );

            if (online) {
                loadStatus();
                loadSecurity();
                loadTools();
                loadDeployments();
                loadGitHub();
                loadIssues();
            } else {
                restoreCachedCards();
            }
        }

        updateAssistantAvailability({ notifyOffline: notify && !online && online !== lastKnownOnline });
        lastKnownOnline = online;
        return online;
    }

    updateMotionPreference();
    restoreCachedCards();
    restoreAssistantHistory();
    updateAssistantAvailability();
    updateNetworkStatus();

    if (typeof prefersReducedMotion.addEventListener === 'function') {
        prefersReducedMotion.addEventListener('change', updateMotionPreference);
    } else if (typeof prefersReducedMotion.addListener === 'function') {
        prefersReducedMotion.addListener(updateMotionPreference);
    }

    window.addEventListener('online', () => updateNetworkStatus({ notify: true }));
    window.addEventListener('offline', () => updateNetworkStatus({ notify: true }));

    // Track card hover state
    document.querySelectorAll('.neo-card').forEach(card => {
        card.addEventListener('mouseenter', () => {
            isCardHovered = true;
        });
        card.addEventListener('mouseleave', () => {
            isCardHovered = false;
        });
    });

    document.addEventListener('mousemove', (e) => {
        if (!parallaxEnabled) {
            mouseXDisplay.textContent = 0;
            mouseYDisplay.textContent = 0;
            return;
        }

        // Reduce parallax intensity from ±20 to ±8 degrees
        const x = (e.clientX / window.innerWidth - 0.5) * 8;
        const y = (e.clientY / window.innerHeight - 0.5) * 8;

        // Only apply parallax when NOT hovering over a card
        if (!isCardHovered) {
            scene.style.transform = `rotateY(${x}deg) rotateX(${-y}deg)`;
        }

        mouseXDisplay.textContent = Math.round(x);
        mouseYDisplay.textContent = Math.round(y);
    });

    // Generate ambient particles
    const particlesContainer = document.getElementById('particles');
    for (let i = 0; i < 50; i++) {
        const particle = document.createElement('div');
        particle.className = 'particle';
        particle.style.left = Math.random() * 100 + '%';
        particle.style.top = Math.random() * 100 + '%';
        particle.style.animationDelay = Math.random() * 10 + 's';
        particle.style.animationDuration = (Math.random() * 10 + 10) + 's';
        particle.style.animationPlayState = parallaxEnabled ? 'running' : 'paused';
        particlesContainer.appendChild(particle);
        particleElements.push(particle);
    }

    const latestData = {
        status: null,
        scan: null,
        tools: null,
        git: null,
        deployments: null,
        github: null
    };

    const inflightRequests = new Map();
    const abortReasons = new WeakMap();
    const refreshTimers = new Map();

    const REFRESH_INTERVALS = {
        status: 60_000,
        tools: 120_000,
        issues: 45_000,
        deployments: 300_000,
        github: 180_000
    };

    const DEFAULT_TIMEOUT = 20_000;
    const CACHE_PREFIX = 'guardian-dashboard:';
    const ASSISTANT_HISTORY_KEY = `${CACHE_PREFIX}assistant-history`;
    const ASSISTANT_DRAFT_HISTORY_KEY = `${CACHE_PREFIX}assistant-drafts`;
    const ASSISTANT_SNIPPET_CATEGORY_KEY = `${CACHE_PREFIX}assistant-snippet-category`;
    const ASSISTANT_HISTORY_LIMIT = 24;
    const ASSISTANT_DRAFT_HISTORY_LIMIT = 50;
    const ASSISTANT_SNIPPET_SOURCE_ORDER = [
        'status',
        'security',
        'tooling',
        'git',
        'deployments',
        'github',
        'context',
        'general'
    ];
    const CACHE_TTL = 1000 * 60 * 60; // 1 hour
    let assistantHistory = [];
    let assistantBusy = false;
    let assistantLastResponseAt = null;
    let assistantContextCache = null;
    let assistantContextDirty = true;
    let assistantContextVisible = false;
    let assistantDraftHistory = [];
    let assistantDraftHistoryIndex = -1;
    let assistantDraftOriginal = '';
    let assistantDraftNavigating = false;
    let assistantSnippetPanelVisible = false;
    let assistantSnippetOptions = [];
    let assistantSnippetFilter = '';
    let assistantSnippetCategory = 'all';
    let assistantSnippetSourceMeta = [];

    assistantSnippetCategory = readAssistantSnippetCategory();
    const TIMESTAMP_FIELDS = [
        'timestamp',
        'updatedAt',
        'generatedAt',
        'scannedAt',
        'completedAt',
        'finishedAt',
        'createdAt'
    ];
    const relativeTimeFormatter = typeof Intl !== 'undefined' && typeof Intl.RelativeTimeFormat === 'function'
        ? new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
        : null;

    function abortRequest(key, { reason } = {}) {
        if (!key) {
            return false;
        }

        const controller = inflightRequests.get(key);
        if (!controller) {
            return false;
        }

        if (reason) {
            abortReasons.set(controller, reason);
        }

        try {
            controller.abort();
            return true;
        } catch (error) {
            console.warn(`Failed to abort request for ${key}`, error);
            return false;
        }
    }

    async function fetchJSON(key, url, options = {}) {
        if (!key) {
            throw new Error('fetchJSON requires a request key');
        }

        if (inflightRequests.has(key)) {
            abortRequest(key, { reason: 'superseded' });
        }

        const controller = new AbortController();
        inflightRequests.set(key, controller);

        const { timeout = DEFAULT_TIMEOUT, ...requestOptions } = options;
        let abortedByTimeout = false;
        const timeoutId = timeout
            ? setTimeout(() => {
                abortedByTimeout = true;
                controller.abort();
            }, timeout)
            : null;

        try {
            const response = await fetch(url, { ...requestOptions, signal: controller.signal });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            const reason = abortReasons.get(controller);
            if (reason) {
                abortReasons.delete(controller);
            }
            if (error.name === 'AbortError' && abortedByTimeout) {
                const timeoutError = new Error(`Request timed out after ${Math.round(timeout / 1000)}s`);
                timeoutError.name = 'TimeoutError';
                throw timeoutError;
            }
            if (error.name === 'AbortError' && reason) {
                error.reason = reason;
            }
            throw error;
        } finally {
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
            abortReasons.delete(controller);
            if (inflightRequests.get(key) === controller) {
                inflightRequests.delete(key);
            }
        }
    }

    function saveCache(key, data) {
        if (!key || typeof localStorage === 'undefined') {
            return;
        }

        try {
            const record = JSON.stringify({ timestamp: Date.now(), data });
            localStorage.setItem(`${CACHE_PREFIX}${key}`, record);
        } catch (error) {
            console.warn(`Failed to cache ${key}`, error);
        }
    }

    function readCache(key) {
        if (!key || typeof localStorage === 'undefined') {
            return null;
        }

        try {
            const raw = localStorage.getItem(`${CACHE_PREFIX}${key}`);
            if (!raw) {
                return null;
            }

            const record = JSON.parse(raw);
            if (!record || typeof record !== 'object') {
                return null;
            }

            const timestamp = typeof record.timestamp === 'number' ? record.timestamp : null;
            const expired = timestamp ? (Date.now() - timestamp) > CACHE_TTL : false;
            return { data: record.data, timestamp, expired };
        } catch (error) {
            console.warn(`Failed to read cache for ${key}`, error);
            return null;
        }
    }

    function formatRelativeTime(date) {
        if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
            return '';
        }

        const diffInSeconds = (date.getTime() - Date.now()) / 1000;
        const divisions = [
            { amount: 60, unit: 'second' },
            { amount: 60, unit: 'minute' },
            { amount: 24, unit: 'hour' },
            { amount: 7, unit: 'day' },
            { amount: 4.34524, unit: 'week' },
            { amount: 12, unit: 'month' },
            { amount: Number.POSITIVE_INFINITY, unit: 'year' }
        ];

        let duration = diffInSeconds;
        let unit = 'second';

        for (const division of divisions) {
            if (Math.abs(duration) < division.amount) {
                unit = division.unit;
                break;
            }
            duration /= division.amount;
        }

        const rounded = Math.round(duration);
        if (relativeTimeFormatter) {
            return relativeTimeFormatter.format(rounded, unit);
        }

        const absolute = Math.abs(rounded);
        const pluralizedUnit = absolute === 1 ? unit : `${unit}s`;
        const suffix = rounded > 0 ? 'from now' : 'ago';
        return `${absolute} ${pluralizedUnit} ${suffix}`;
    }

    function setUpdatedMeta(id, { timestamp = null, fromCache = false, message = '', expired = false, offline = false } = {}) {
        const element = document.getElementById(id);
        if (!element) {
            return;
        }

        const source = offline ? 'offline' : fromCache ? 'cache' : 'live';
        if (source) {
            element.dataset.source = source;
        } else {
            delete element.dataset.source;
        }

        const applyState = (state) => {
            if (state) {
                element.dataset.state = state;
            } else {
                delete element.dataset.state;
            }
        };

        if (message) {
            element.textContent = message;
            applyState(offline ? 'offline' : expired ? 'stale' : '');
            element.removeAttribute('data-timestamp');
            element.removeAttribute('title');
            return;
        }

        let normalizedTimestamp = null;
        if (timestamp instanceof Date) {
            normalizedTimestamp = Number.isNaN(timestamp.getTime()) ? null : timestamp;
        } else if (typeof timestamp === 'number') {
            normalizedTimestamp = new Date(timestamp);
        } else if (timestamp) {
            normalizedTimestamp = parseDateLike(timestamp);
        }

        if (!normalizedTimestamp || Number.isNaN(normalizedTimestamp.getTime())) {
            element.textContent = fromCache ? 'Cached update (time unknown)' : 'Awaiting update';
            applyState(offline ? 'offline' : expired ? 'stale' : '');
            element.removeAttribute('data-timestamp');
            element.removeAttribute('title');
            return;
        }

        const relative = formatRelativeTime(normalizedTimestamp) || 'recently';
        const prefix = offline && fromCache
            ? 'Offline cache'
            : fromCache
                ? 'Cached'
                : 'Updated';
        const suffix = expired ? ' • stale' : '';
        element.textContent = `${prefix} ${relative}${suffix}`;
        element.dataset.timestamp = normalizedTimestamp.toISOString();
        element.title = normalizedTimestamp.toLocaleString();
        applyState(offline ? 'offline' : expired ? 'stale' : '');
    }

    function extractTimestamp(record, fallback) {
        const fallbackDate = fallback instanceof Date
            ? fallback
            : fallback
                ? parseDateLike(fallback)
                : null;
        if (fallbackDate && !Number.isNaN(fallbackDate.getTime())) {
            return fallbackDate;
        }

        if (!record || typeof record !== 'object') {
            return null;
        }

        for (const key of TIMESTAMP_FIELDS) {
            if (key in record) {
                const candidate = parseDateLike(record[key]);
                if (candidate) {
                    return candidate;
                }
            }
        }

        if (record.meta && typeof record.meta === 'object') {
            const nested = extractTimestamp(record.meta);
            if (nested) {
                return nested;
            }
        }

        return null;
    }

    function showToast(message, variant = 'info', duration = 5000) {
        const stack = document.getElementById('toast-stack');
        if (!stack) {
            console.warn('Toast stack missing, falling back to alert:', message);
            if (typeof message === 'string') {
                alert(message);
            }
            return;
        }

        const normalizedVariant = ['success', 'info', 'warning', 'error'].includes((variant || '').toLowerCase())
            ? variant.toLowerCase()
            : 'info';

        const toast = document.createElement('div');
        toast.className = `toast toast-${normalizedVariant}`;
        toast.setAttribute('role', 'status');
        toast.setAttribute('aria-live', 'polite');
        toast.textContent = (message ?? '').toString();

        stack.appendChild(toast);

        requestAnimationFrame(() => {
            toast.classList.add('visible');
        });

        const hide = () => {
            toast.classList.remove('visible');
            setTimeout(() => {
                if (toast.parentElement === stack) {
                    stack.removeChild(toast);
                }
            }, 300);
        };

        const timeoutId = setTimeout(hide, Math.max(2000, duration || 0));

        toast.addEventListener('click', () => {
            clearTimeout(timeoutId);
            hide();
        });
    }

    async function copyTextToClipboard(text) {
        if (typeof text !== 'string') {
            text = text != null ? String(text) : '';
        }

        try {
            if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
                await navigator.clipboard.writeText(text);
                return true;
            }
        } catch (error) {
            console.warn('Async clipboard write failed', error);
        }

        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.top = '-9999px';
        textarea.style.left = '-9999px';

        document.body.appendChild(textarea);
        textarea.select();

        let success = false;
        try {
            success = document.execCommand('copy');
        } catch (error) {
            console.warn('Fallback clipboard copy failed', error);
            success = false;
        }

        document.body.removeChild(textarea);
        return success;
    }

    function scheduleRefresh(key, callback, interval) {
        if (!key || typeof callback !== 'function' || !interval) {
            return;
        }

        if (refreshTimers.has(key)) {
            clearInterval(refreshTimers.get(key));
        }

        const tick = () => {
            if (document.hidden) {
                return;
            }
            callback();
        };

        tick();
        const id = setInterval(tick, interval);
        refreshTimers.set(key, id);
    }

    function stopAutoRefresh() {
        refreshTimers.forEach(id => clearInterval(id));
        refreshTimers.clear();
    }

    function startAutoRefresh() {
        scheduleRefresh('status', loadStatus, REFRESH_INTERVALS.status);
        scheduleRefresh('tools', loadTools, REFRESH_INTERVALS.tools);
        scheduleRefresh('issues', loadIssues, REFRESH_INTERVALS.issues);
        scheduleRefresh('deployments', loadDeployments, REFRESH_INTERVALS.deployments);
        scheduleRefresh('github', loadGitHub, REFRESH_INTERVALS.github);
    }

    function setLoadingState(element, message = 'Loading...') {
        if (!element) return;

        element.classList.add('is-loading');
        element.setAttribute('aria-busy', 'true');

        if (getComputedStyle(element).position === 'static') {
            element.dataset.positionWasStatic = 'true';
            element.style.position = 'relative';
        }

        let overlay = element.querySelector(':scope > .loading-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.className = 'loading-overlay';
            overlay.setAttribute('role', 'status');
            overlay.setAttribute('aria-live', 'polite');

            const spinner = document.createElement('div');
            spinner.className = 'spinner';
            spinner.setAttribute('aria-hidden', 'true');

            const text = document.createElement('p');
            text.className = 'loading-text';

            overlay.append(spinner, text);
            overlay.setAttribute('hidden', '');
            element.appendChild(overlay);
        }

        const textNode = overlay.querySelector('.loading-text');
        if (textNode) {
            textNode.textContent = message;
        }

        overlay.removeAttribute('hidden');
        requestAnimationFrame(() => overlay.classList.add('visible'));
    }

    function clearLoadingState(element) {
        if (!element) return;

        element.removeAttribute('aria-busy');
        element.classList.remove('is-loading');

        const overlay = element.querySelector(':scope > .loading-overlay');
        if (overlay) {
            overlay.classList.remove('visible');
            overlay.setAttribute('hidden', '');
        }

        if (element.dataset.positionWasStatic) {
            element.style.position = '';
            delete element.dataset.positionWasStatic;
        }
    }

    function setBadge(element, text, variant = 'status-good', options = {}) {
        if (!element) return;
        element.textContent = text;
        element.className = `status-badge ${variant}`;

        const { source, state } = options || {};
        if (source) {
            element.dataset.source = source;
        } else {
            delete element.dataset.source;
        }

        if (state) {
            element.dataset.state = state;
        } else {
            delete element.dataset.state;
        }
    }

    function renderMetrics(container, metrics) {
        if (!container) return;
        const fragment = document.createDocumentFragment();

        metrics.forEach(metric => {
            if (!metric) return;

            const row = document.createElement('div');
            row.className = 'metric';

            const label = document.createElement('span');
            label.className = 'metric-label';
            label.textContent = metric.label;

            const value = document.createElement('span');
            value.className = 'metric-value';
            value.textContent = metric.value;

            row.append(label, value);
            fragment.appendChild(row);
        });

        container.appendChild(fragment);
    }

    function titleCase(value = '') {
        return value
            .toString()
            .split(/[_\-\s]+/)
            .filter(Boolean)
            .map(part => part.charAt(0).toUpperCase() + part.slice(1))
            .join(' ');
    }

    function formatToolLabel(tool) {
        if (!tool) return 'Tool';
        const primary = tool.name || tool.provider || tool.command || tool.category || 'Tool';
        const category = tool.category && !primary.toLowerCase().includes(tool.category.toLowerCase())
            ? ` (${titleCase(tool.category)})`
            : '';
        return `${titleCase(primary)}${category}`;
    }

    function slugify(value = '') {
        return value
            .toString()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, '')
            || 'item';
    }

    function pluralize(value, singular, plural = `${singular}s`) {
        return value === 1 ? singular : plural;
    }

    function isLikelyShellCommand(value) {
        if (typeof value !== 'string') return false;
        const trimmed = value.trim();
        if (!trimmed) return false;
        return /^(npm|npx|yarn|pnpm|bun|pip3?|brew|apt(-get)?|go|cargo|dotnet|curl|bash|sh)\b/i.test(trimmed);
    }

    function resolveInstallCommand(tool) {
        if (!tool || typeof tool !== 'object') {
            return null;
        }

        const candidates = [
            tool.install,
            tool.installCommand,
            tool.command,
            tool.cliRequired?.install,
            tool.cliRequired?.command
        ];

        for (const candidate of candidates) {
            if (isLikelyShellCommand(candidate)) {
                return candidate.trim();
            }
        }

        return null;
    }

    function resolveDocsLink(tool) {
        if (!tool || typeof tool !== 'object') {
            return null;
        }

        return tool.docs || tool.documentation || tool.cliRequired?.docs || null;
    }

    function parseDateLike(value) {
        if (!value) return null;
        if (value instanceof Date) {
            return Number.isNaN(value.getTime()) ? null : value;
        }

        const asDate = new Date(value);
        if (!Number.isNaN(asDate.getTime())) {
            return asDate;
        }

        if (typeof value === 'number') {
            const millis = value > 1e12 ? value : value * 1000;
            const numericDate = new Date(millis);
            return Number.isNaN(numericDate.getTime()) ? null : numericDate;
        }

        return null;
    }

    function formatRelativeTime(value) {
        const date = parseDateLike(value);
        if (!date) {
            return null;
        }

        const diffMs = Date.now() - date.getTime();
        const absolute = Math.abs(diffMs);
        const tense = diffMs >= 0 ? 'ago' : 'from now';

        const units = [
            { limit: 60_000, divisor: 1000, unit: 'second' },
            { limit: 3_600_000, divisor: 60_000, unit: 'minute' },
            { limit: 86_400_000, divisor: 3_600_000, unit: 'hour' },
            { limit: 604_800_000, divisor: 86_400_000, unit: 'day' },
            { limit: 2_592_000_000, divisor: 604_800_000, unit: 'week' },
            { limit: Infinity, divisor: 2_592_000_000, unit: 'month' }
        ];

        for (const { limit, divisor, unit } of units) {
            if (absolute < limit) {
                const value = Math.max(1, Math.round(absolute / divisor));
                const plural = value === 1 ? unit : `${unit}s`;
                return `${value} ${plural} ${tense}`;
            }
        }

        return date.toLocaleString();
    }

    function appendTimelineItem(list, titleText, metaText, url) {
        if (!list || !titleText) {
            return false;
        }

        const item = document.createElement('li');
        item.className = 'timeline-item';

        const title = document.createElement('div');
        title.className = 'timeline-title';

        if (url) {
            const link = document.createElement('a');
            link.href = url;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.textContent = titleText;
            title.appendChild(link);
        } else {
            title.textContent = titleText;
        }

        item.appendChild(title);

        if (metaText) {
            const meta = document.createElement('div');
            meta.className = 'timeline-meta';
            meta.textContent = metaText;
            item.appendChild(meta);
        }

        list.appendChild(item);
        return true;
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
                const relative = formatRelativeTime(deployment.createdAt || deployment.ready || deployment.updatedAt);
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

    function getSeverityCounts(issues) {
        const counts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
        (issues || []).forEach(issue => {
            const key = (issue.severity || '').toString().toUpperCase();
            if (counts[key] !== undefined) {
                counts[key] += 1;
            }
        });
        return counts;
    }

    function getSecurityBadge(counts, warningCount) {
        if (counts.CRITICAL > 0) {
            return { text: `${counts.CRITICAL} critical`, variant: 'status-error' };
        }
        if (counts.HIGH > 0) {
            return { text: `${counts.HIGH} high`, variant: 'status-warning' };
        }
        if (counts.MEDIUM > 0 || warningCount > 0) {
            return { text: 'Attention', variant: 'status-warning' };
        }
        return { text: 'Secure', variant: 'status-good' };
    }

    function computeSecureScore(counts, warningCount) {
        const penalty = (counts.CRITICAL * 35) + (counts.HIGH * 20) + (counts.MEDIUM * 10) + (warningCount * 5);
        return Math.max(0, 100 - penalty);
    }

    function createProgressBar(score) {
        const wrapper = document.createElement('div');
        wrapper.className = 'progress-bar';

        const fill = document.createElement('div');
        fill.className = 'progress-fill';
        fill.style.width = `${Math.max(0, Math.min(100, Math.round(score)))}%`;

        const text = document.createElement('div');
        text.className = 'progress-text';
        text.textContent = `${Math.round(Math.max(0, Math.min(100, score)))}% Secure`;

        wrapper.append(fill, text);
        return wrapper;
    }

    function severityToClass(severity = 'INFO') {
        const map = {
            CRITICAL: 'critical',
            HIGH: 'high',
            MEDIUM: 'medium',
            LOW: 'low',
            INFO: 'info',
            SUCCESS: 'success'
        };
        return map[severity] || 'info';
    }

    function severityIcon(severity = 'INFO') {
        const map = {
            CRITICAL: '🔴',
            HIGH: '🟠',
            MEDIUM: '🟡',
            LOW: '🔵',
            INFO: '⚪',
            SUCCESS: '🟢'
        };
        return map[severity] || '⚪';
    }

    function gitStatusSeverity(code = '') {
        const trimmed = code.trim();
        if (!trimmed) return 'INFO';
        if (trimmed.includes('U') || trimmed.includes('D')) return 'HIGH';
        if (trimmed.includes('M') || trimmed.includes('A')) return 'MEDIUM';
        if (trimmed === '??') return 'LOW';
        return 'INFO';
    }

    function createInfoItem(iconSymbol, title, details, severity = 'INFO') {
        const item = document.createElement('li');
        item.className = `issue-item ${severityToClass(severity.toString().toUpperCase())}`;

        const icon = document.createElement('span');
        icon.className = 'issue-icon';
        icon.textContent = iconSymbol || severityIcon(severity);

        const text = document.createElement('div');
        text.className = 'issue-text';
        text.textContent = title;

        if (details) {
            const detailEl = document.createElement('span');
            detailEl.className = 'issue-details';
            detailEl.textContent = details;
            text.appendChild(detailEl);
        }

        item.append(icon, text);
        return item;
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
            button.addEventListener('click', handleAutoFix);
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
        } else if (inflightRequests.has('issues')) {
            fragment.appendChild(createInfoItem('⌛', 'Repository status syncing', 'Git details will appear once the status call completes.', 'INFO'));
            hasItems = true;
        }

        if (!hasItems) {
            fragment.appendChild(createInfoItem('✨', 'Awaiting scan data', 'Trigger a scan to populate issues.', 'INFO'));
        }

        list.appendChild(fragment);
    }

    function renderInlineContent(text = '') {
        const fragment = document.createDocumentFragment();

        if (typeof text !== 'string' || !text.length) {
            if (text) {
                fragment.appendChild(document.createTextNode(String(text)));
            }
            return fragment;
        }

        const pattern = /(`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_|https?:\/\/[^\s]+)/g;
        let lastIndex = 0;
        let match;

        while ((match = pattern.exec(text)) !== null) {
            if (match.index > lastIndex) {
                fragment.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
            }

            const token = match[0];
            let node = null;

            if (token.startsWith('`') && token.endsWith('`')) {
                node = document.createElement('code');
                node.textContent = token.slice(1, -1);
            } else if ((token.startsWith('**') && token.endsWith('**')) || (token.startsWith('__') && token.endsWith('__'))) {
                node = document.createElement('strong');
                node.appendChild(renderInlineContent(token.slice(2, -2)));
            } else if ((token.startsWith('*') && token.endsWith('*')) || (token.startsWith('_') && token.endsWith('_'))) {
                node = document.createElement('em');
                node.appendChild(renderInlineContent(token.slice(1, -1)));
            } else if (/^https?:\/\//i.test(token)) {
                node = document.createElement('a');
                node.href = token;
                node.target = '_blank';
                node.rel = 'noopener noreferrer';
                node.textContent = token;
            }

            if (node) {
                fragment.appendChild(node);
            }

            lastIndex = pattern.lastIndex;
        }

        if (lastIndex < text.length) {
            fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
        }

        return fragment;
    }

    function renderRichContent(text = '') {
        const fragment = document.createDocumentFragment();

        if (typeof text !== 'string') {
            if (text !== null && text !== undefined) {
                fragment.appendChild(document.createTextNode(String(text)));
            }
            return fragment;
        }

        const normalized = text.replace(/\r\n/g, '\n');
        const blocks = normalized.split(/\n{2,}/);

        blocks.forEach(block => {
            const trimmed = block.trim();
            if (!trimmed) {
                return;
            }

            if (/^```/.test(trimmed) && trimmed.endsWith('```')) {
                const lines = trimmed.split('\n');
                const firstLine = lines.shift();
                if (lines.length && lines[lines.length - 1].trim() === '```') {
                    lines.pop();
                }
                const pre = document.createElement('pre');
                if (firstLine) {
                    const language = firstLine.replace(/^```/, '').trim();
                    if (language) {
                        pre.dataset.language = language;
                    }
                }
                const code = document.createElement('code');
                code.textContent = lines.join('\n');
                pre.appendChild(code);
                fragment.appendChild(pre);
                return;
            }

            const lineItems = block.split('\n').filter(line => line.trim().length > 0);
            if (!lineItems.length) {
                return;
            }

            const isBulletList = lineItems.every(line => /^[-*+]\s+/.test(line.trim()));
            const isOrderedList = lineItems.every(line => /^\d+\.\s+/.test(line.trim()));
            const isBlockquote = lineItems.every(line => /^>\s?/.test(line.trim()));

            if (isBulletList || isOrderedList) {
                const list = document.createElement(isOrderedList ? 'ol' : 'ul');
                lineItems.forEach(item => {
                    const li = document.createElement('li');
                    const value = item.replace(isOrderedList ? /^\d+\.\s+/ : /^[-*+]\s+/, '');
                    li.appendChild(renderInlineContent(value));
                    list.appendChild(li);
                });
                fragment.appendChild(list);
                return;
            }

            if (isBlockquote) {
                const quote = document.createElement('blockquote');
                lineItems.forEach((line, index) => {
                    const value = line.replace(/^>\s?/, '');
                    quote.appendChild(renderInlineContent(value));
                    if (index < lineItems.length - 1) {
                        quote.appendChild(document.createElement('br'));
                    }
                });
                fragment.appendChild(quote);
                return;
            }

            const paragraph = document.createElement('p');
            lineItems.forEach((line, index) => {
                paragraph.appendChild(renderInlineContent(line));
                if (index < lineItems.length - 1) {
                    paragraph.appendChild(document.createElement('br'));
                }
            });
            fragment.appendChild(paragraph);
        });

        if (!fragment.childNodes.length && text) {
            const paragraph = document.createElement('p');
            paragraph.appendChild(document.createTextNode(text));
            fragment.appendChild(paragraph);
        }

        return fragment;
    }

    function appendAssistantMessage(role, content, { timestamp = Date.now(), pending = false, tone, meta, classes = [], ephemeral = false } = {}) {
        if (!assistantLog) {
            return null;
        }

        const normalizedRole = ['user', 'assistant', 'system'].includes(role) ? role : 'assistant';
        const message = document.createElement('div');
        message.className = `chat-message chat-${normalizedRole}`;
        if (pending) {
            message.classList.add('pending');
        }
        if (tone === 'error') {
            message.classList.add('error');
        }
        classes.forEach(cls => message.classList.add(cls));

        if (ephemeral) {
            message.dataset.ephemeral = 'true';
        }

        const resolvedTimestamp = parseDateLike(timestamp) || new Date();
        if (resolvedTimestamp && !Number.isNaN(resolvedTimestamp.getTime())) {
            message.dataset.timestamp = resolvedTimestamp.toISOString();
        }

        const text = document.createElement('div');
        text.className = 'chat-message-text';
        text.appendChild(renderRichContent(content));
        message.appendChild(text);

        if (meta) {
            const metaEl = document.createElement('div');
            metaEl.className = 'chat-message-meta';
            metaEl.textContent = meta;
            message.appendChild(metaEl);
        }

        if (normalizedRole === 'assistant' && !pending) {
            const actions = document.createElement('div');
            actions.className = 'chat-message-actions';

            const copyButton = document.createElement('button');
            copyButton.type = 'button';
            copyButton.className = 'holo-icon-button';
            copyButton.textContent = 'Copy';
            copyButton.setAttribute('aria-label', 'Copy assistant reply');
            copyButton.addEventListener('click', async () => {
                const content = text.innerText || text.textContent || '';
                if (!content) {
                    showToast('Nothing to copy from this reply yet.', 'warning', 3000);
                    return;
                }

                const copied = await copyTextToClipboard(content);
                if (copied) {
                    showToast('Assistant reply copied to clipboard.', 'success', 2500);
                } else {
                    showToast('Unable to copy reply automatically. Please copy manually.', 'warning', 4000);
                }
            });

            actions.appendChild(copyButton);
            message.appendChild(actions);
        }

        assistantLog.appendChild(message);
        assistantLog.scrollTop = assistantLog.scrollHeight;
        return message;
    }

    function appendAssistantIntro() {
        if (!assistantLog || assistantLog.dataset.introShown === 'true') {
            return;
        }

        assistantLog.dataset.introShown = 'true';
        appendAssistantMessage('assistant', 'Hi! I\'m Guardian. I can explain scan results, recommend tools, or plan your next deployment.', {
            meta: 'Ready',
            classes: ['intro'],
            ephemeral: true
        });
    }

    function readAssistantHistory() {
        if (typeof localStorage === 'undefined') {
            return [];
        }

        try {
            const raw = localStorage.getItem(ASSISTANT_HISTORY_KEY);
            if (!raw) {
                return [];
            }

            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) {
                return [];
            }

            return parsed
                .filter(entry => entry && typeof entry.role === 'string' && typeof entry.content === 'string')
                .map(entry => ({
                    role: ['user', 'assistant'].includes(entry.role) ? entry.role : 'assistant',
                    content: entry.content,
                    timestamp: entry.timestamp || Date.now(),
                    provider: entry.provider || null
                }));
        } catch (error) {
            console.warn('Failed to read assistant history', error);
            return [];
        }
    }

    function persistAssistantHistory() {
        if (typeof localStorage === 'undefined') {
            return;
        }

        try {
            assistantHistory = assistantHistory.slice(-ASSISTANT_HISTORY_LIMIT);
            const serializable = assistantHistory.map(entry => ({
                role: entry.role,
                content: entry.content,
                timestamp: entry.timestamp,
                provider: entry.provider || null
            }));
            localStorage.setItem(ASSISTANT_HISTORY_KEY, JSON.stringify(serializable));
        } catch (error) {
            console.warn('Failed to persist assistant history', error);
        }
    }

    function readAssistantDraftHistory() {
        if (typeof localStorage === 'undefined') {
            return [];
        }

        try {
            const raw = localStorage.getItem(ASSISTANT_DRAFT_HISTORY_KEY);
            if (!raw) {
                return [];
            }

            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) {
                return [];
            }

            return parsed
                .map(item => (typeof item === 'string' ? item.trim() : ''))
                .filter(item => item)
                .slice(-ASSISTANT_DRAFT_HISTORY_LIMIT);
        } catch (error) {
            console.warn('Failed to read assistant drafts', error);
            return [];
        }
    }

    function persistAssistantDraftHistory() {
        if (typeof localStorage === 'undefined') {
            return;
        }

        try {
            const payload = JSON.stringify(
                assistantDraftHistory.slice(-ASSISTANT_DRAFT_HISTORY_LIMIT)
            );
            localStorage.setItem(ASSISTANT_DRAFT_HISTORY_KEY, payload);
        } catch (error) {
            console.warn('Failed to persist assistant drafts', error);
        }
    }

    function readAssistantSnippetCategory() {
        if (typeof localStorage === 'undefined') {
            return 'all';
        }

        try {
            const raw = localStorage.getItem(ASSISTANT_SNIPPET_CATEGORY_KEY);
            if (!raw) {
                return 'all';
            }

            return normalizeAssistantSnippetCategory(raw);
        } catch (error) {
            console.warn('Failed to read assistant snippet category', error);
            return 'all';
        }
    }

    function persistAssistantSnippetCategory(value) {
        if (typeof localStorage === 'undefined') {
            return;
        }

        try {
            localStorage.setItem(
                ASSISTANT_SNIPPET_CATEGORY_KEY,
                normalizeAssistantSnippetCategory(value)
            );
        } catch (error) {
            console.warn('Failed to persist assistant snippet category', error);
        }
    }

    function rememberAssistantDraft(entry) {
        if (!entry || typeof entry !== 'string') {
            return;
        }

        const trimmed = entry.trim();
        if (!trimmed) {
            return;
        }

        assistantDraftHistory = assistantDraftHistory.filter(item => item !== trimmed);
        assistantDraftHistory.push(trimmed);

        if (assistantDraftHistory.length > ASSISTANT_DRAFT_HISTORY_LIMIT) {
            assistantDraftHistory = assistantDraftHistory.slice(-ASSISTANT_DRAFT_HISTORY_LIMIT);
        }

        persistAssistantDraftHistory();
    }

    function showAssistantDraftFromHistory(index) {
        if (!assistantInput) {
            return;
        }

        if (index < 0 || index >= assistantDraftHistory.length) {
            return;
        }

        assistantDraftNavigating = true;
        assistantInput.value = assistantDraftHistory[index];
        handleAssistantInputChange();
        assistantDraftNavigating = false;

        try {
            assistantInput.focus({ preventScroll: true });
        } catch (error) {
            assistantInput.focus();
        }

        const length = assistantInput.value.length;
        requestAnimationFrame(() => {
            try {
                assistantInput.setSelectionRange(length, length);
            } catch (error) {
                // Ignore selection issues (e.g., unsupported inputs)
            }
        });
    }

    function exportAssistantTranscript() {
        if (!assistantHistory.length) {
            showToast('There is no assistant conversation to export yet.', 'info');
            return;
        }

        try {
            const now = new Date();
            const lines = [
                '# Guardian Assistant Transcript',
                '',
                `Generated: ${now.toLocaleString()}`,
                `Entries: ${assistantHistory.length}`,
                ''
            ];

            assistantHistory.forEach((entry, index) => {
                let speaker = 'You';
                if (entry.role === 'assistant') {
                    speaker = 'Guardian';
                } else if (entry.role === 'system') {
                    speaker = 'System';
                }
                const timestamp = parseDateLike(entry.timestamp);
                const formattedTime = timestamp
                    ? timestamp.toLocaleString()
                    : 'Unknown time';

                lines.push(`## ${index + 1}. ${speaker} — ${formattedTime}`);
                lines.push('');
                lines.push(entry.content);
                lines.push('');
            });

            const context = (() => {
                try {
                    return getAssistantContext();
                } catch (error) {
                    console.warn('Failed to gather assistant context for export', error);
                    return null;
                }
            })();

            if (context && Object.keys(context).length) {
                lines.push('---');
                lines.push('### Project context snapshot');
                lines.push('');
                try {
                    lines.push('```json');
                    lines.push(JSON.stringify(context, null, 2));
                    lines.push('```');
                } catch (error) {
                    console.warn('Failed to serialize assistant context', error);
                }
            }

            if (typeof Blob === 'undefined' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
                throw new Error('This browser cannot export transcripts.');
            }

            const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
            const safeTimestamp = now.toISOString().replace(/[:.]/g, '-');
            const filename = `guardian-transcript-${safeTimestamp}.md`;

            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            setTimeout(() => {
                if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
                    URL.revokeObjectURL(link.href);
                }
                link.remove();
            }, 0);

            showToast('Guardian transcript downloaded.', 'success');
        } catch (error) {
            console.error('Failed to export assistant transcript', error);
            showToast(`Export failed: ${error.message}`, 'error');
        }
    }

    function markAssistantContextDirty() {
        assistantContextDirty = true;
    }

    function getAssistantContext({ force = false } = {}) {
        if (force) {
            assistantContextDirty = true;
        }

        if (assistantContextDirty || !assistantContextCache) {
            assistantContextCache = computeAssistantContext();
            assistantContextDirty = false;
        }

        return assistantContextCache;
    }

    function computeAssistantSuggestions() {
        const suggestions = [];
        const seen = new Set();
        const add = (value) => {
            if (!value || typeof value !== 'string') {
                return;
            }
            const trimmed = value.trim();
            if (!trimmed || seen.has(trimmed)) {
                return;
            }
            seen.add(trimmed);
            suggestions.push(trimmed);
        };

        const context = getAssistantContext();
        const info = context?.projectInfo || {};
        const security = info.security || {};
        const issues = security.issues || {};
        const totalIssues = Object.values(issues).reduce((sum, count) => (
            typeof count === 'number' ? sum + count : sum
        ), 0);

        if (totalIssues > 0) {
            add('What are the top security vulnerabilities we should fix first?');
        } else if (typeof security.warnings === 'number' && security.warnings > 0) {
            add('Explain the warnings from the latest security scan.');
        } else if (security && Object.keys(security).length) {
            add('Confirm our current security posture and any remaining risks.');
        }

        if (info.tooling?.missing && info.tooling.missing.length) {
            add('How do I install or configure the missing tools Guardian detected?');
        }

        if (
            (info.repository?.status && info.repository.status.length) ||
            (typeof info.uncommittedChanges === 'number' && info.uncommittedChanges > 0)
        ) {
            add('Walk me through cleaning up the repository changes and pending work.');
        }

        if (Array.isArray(info.deployments) && info.deployments.length) {
            add('Summarize the most recent deployment results and next steps.');
        }

        if (info.github && (info.github.name || info.github.owner)) {
            add('Review the GitHub repository insights and highlight anything actionable.');
        }

        if (assistantHistory.some(entry => entry.role === 'assistant')) {
            add('Summarize the key points from our last conversation.');
        }

        if (!suggestions.length) {
            add('Give me an overview of the project status right now.');
        }

        if (suggestions.length < 5) {
            add('What should I prioritize next to improve this project?');
        }

        return suggestions.slice(0, 6);
    }

    function computeAssistantSnippets(context = getAssistantContext()) {
        const snippets = [];
        const info = context?.projectInfo;

        if (!info || typeof info !== 'object' || !Object.keys(info).length) {
            return snippets;
        }

        const addSnippet = (snippet) => {
            if (!snippet || typeof snippet.text !== 'string') {
                return;
            }

            const trimmed = snippet.text.trim();
            if (!trimmed) {
                return;
            }

            snippets.push({
                id: snippet.id || `snippet-${snippets.length}`,
                label: snippet.label || 'Project insight',
                description: snippet.description || '',
                source: snippet.source || '',
                text: trimmed
            });
        };

        if (
            info.name ||
            info.branch ||
            typeof info.uncommittedChanges === 'number' ||
            info.dependencies ||
            info.experienceLevel
        ) {
            const projectName = info.name || 'This project';
            const branchText = info.branch ? ` on the ${info.branch} branch` : '';
            const highlightParts = [];

            if (typeof info.uncommittedChanges === 'number' && info.uncommittedChanges > 0) {
                highlightParts.push(
                    `${info.uncommittedChanges} uncommitted ${pluralize(info.uncommittedChanges, 'change')}`
                );
            }

            if (info.dependencies) {
                const runtime = typeof info.dependencies.runtime === 'number' ? info.dependencies.runtime : null;
                const dev = typeof info.dependencies.dev === 'number' ? info.dependencies.dev : null;
                const dependencyParts = [];

                if (runtime && runtime > 0) {
                    dependencyParts.push(`${runtime} runtime ${pluralize(runtime, 'dependency')}`);
                }

                if (dev && dev > 0) {
                    dependencyParts.push(`${dev} dev ${pluralize(dev, 'dependency')}`);
                }

                if (dependencyParts.length) {
                    highlightParts.push(`Dependencies: ${dependencyParts.join(' • ')}`);
                }
            }

            if (info.experienceLevel) {
                highlightParts.push(`${titleCase(info.experienceLevel)} experience level`);
            }

            const highlightText = highlightParts.length
                ? `${highlightParts.join('. ')}.`
                : 'No outstanding local issues flagged.';

            const text = `Project snapshot: ${projectName}${branchText}. ${highlightText}`;
            addSnippet({
                id: 'status-overview',
                label: 'Project snapshot',
                description: 'Name, branch, and local highlights',
                source: 'Status',
                text
            });
        }

        if (info.security) {
            const counts = info.security.issues || {};
            const severityOrder = ['critical', 'high', 'medium', 'low'];
            const severityParts = [];

            severityOrder.forEach(severity => {
                const value = counts[severity];
                if (typeof value === 'number' && value > 0) {
                    severityParts.push(`${value} ${titleCase(severity)} ${pluralize(value, 'issue')}`);
                }
            });

            const warnings = typeof info.security.warnings === 'number' ? info.security.warnings : null;
            const relative = info.security.lastScan ? formatRelativeTime(info.security.lastScan) : null;
            const lastScan = relative
                || (info.security.lastScan
                    ? (() => {
                        const parsed = parseDateLike(info.security.lastScan);
                        return parsed ? `at ${parsed.toLocaleString()}` : null;
                    })()
                    : null);

            const textParts = [];
            textParts.push(
                severityParts.length
                    ? `Open issues: ${severityParts.join(', ')}`
                    : 'No open security issues detected'
            );

            if (warnings && warnings > 0) {
                textParts.push(`${warnings} ${pluralize(warnings, 'warning')} awaiting review`);
            }

            if (lastScan) {
                textParts.push(`Last scan ${lastScan}`);
            }

            const text = `Security scan summary: ${textParts.join('. ')}.`;
            addSnippet({
                id: 'security-summary',
                label: 'Security summary',
                description: 'Outstanding risks and last scan time',
                source: 'Security',
                text
            });
        }

        if (info.tooling && (info.tooling.detected?.length || info.tooling.missing?.length)) {
            const detected = Array.isArray(info.tooling.detected) ? info.tooling.detected : [];
            const missing = Array.isArray(info.tooling.missing) ? info.tooling.missing : [];
            const textParts = [];

            if (missing.length) {
                const preview = missing.slice(0, 4);
                const remainder = missing.length - preview.length;
                const summary = remainder > 0
                    ? `${preview.join(', ')}, plus ${remainder} more`
                    : preview.join(', ');
                textParts.push(`Missing tools: ${summary}`);
            }

            if (detected.length) {
                const preview = detected.slice(0, 4);
                const remainder = detected.length - preview.length;
                const summary = remainder > 0
                    ? `${preview.join(', ')}…`
                    : preview.join(', ');
                textParts.push(`Detected: ${summary}`);
            }

            if (textParts.length) {
                const text = `Tooling overview: ${textParts.join('. ')}.`;
                addSnippet({
                    id: 'tooling-overview',
                    label: 'Tooling overview',
                    description: 'Detected and missing tools',
                    source: 'Tooling',
                    text
                });
            }
        }

        if (info.repository) {
            const branch = info.repository.branch ? `Branch ${info.repository.branch}` : null;
            const statusItems = Array.isArray(info.repository.status)
                ? info.repository.status.slice(0, 3)
                : [];
            const commitsRaw = Array.isArray(info.repository.recentCommits)
                ? info.repository.recentCommits.slice(0, 2)
                : [];
            const commitSummaries = commitsRaw
                .map(commit => {
                    if (!commit) return null;
                    if (typeof commit === 'string') {
                        return commit;
                    }
                    const hash = commit.hash ? commit.hash.substring(0, 7) : '';
                    const message = commit.message || commit.description || 'Commit';
                    return hash ? `${hash} ${message}` : message;
                })
                .filter(Boolean);

            const textParts = [];

            if (branch) {
                textParts.push(branch);
            }

            if (statusItems.length) {
                textParts.push(`Working tree: ${statusItems.join(', ')}`);
            }

            if (commitSummaries.length) {
                textParts.push(`Recent commits: ${commitSummaries.join(' • ')}`);
            }

            if (textParts.length) {
                const text = `Repository status: ${textParts.join('. ')}.`;
                addSnippet({
                    id: 'repository-status',
                    label: 'Repository status',
                    description: 'Branch health and latest commits',
                    source: 'Git',
                    text
                });
            }
        }

        if (Array.isArray(info.deployments) && info.deployments.length) {
            const providerCount = info.deployments.length;
            const primary = info.deployments[0] || {};
            const providerName = primary.platform
                ? titleCase(primary.platform)
                : primary.provider
                    ? titleCase(primary.provider)
                    : 'Deployment';
            const recent = Array.isArray(primary.recent) ? primary.recent[0] : null;
            const state = recent?.state ? titleCase(recent.state) : null;
            const relative = recent?.createdAt ? formatRelativeTime(recent.createdAt) : null;
            const detailParts = [];

            if (state) {
                detailParts.push(state);
            }

            if (relative) {
                detailParts.push(relative);
            }

            if (providerCount > 1) {
                detailParts.push(`${providerCount} providers tracked`);
            }

            if (!detailParts.length) {
                detailParts.push('Awaiting recent deployment activity');
            }

            const text = `Deployments: ${providerName} — ${detailParts.join(' • ')}.`;
            addSnippet({
                id: 'deployment-status',
                label: 'Deployment status',
                description: 'Latest provider activity',
                source: 'Deployments',
                text
            });
        }

        if (info.github && (info.github.name || info.github.owner || info.github.stars !== undefined)) {
            const repoName = info.github.owner && info.github.name
                ? `${info.github.owner}/${info.github.name}`
                : info.github.name || 'Repository';
            const textParts = [repoName];

            if (info.github.visibility) {
                textParts.push(`${titleCase(info.github.visibility)} visibility`);
            }

            if (typeof info.github.stars === 'number' && info.github.stars >= 0) {
                textParts.push(`${info.github.stars} ${pluralize(info.github.stars, 'star')}`);
            }

            const text = `GitHub insights: ${textParts.join(' • ')}.`;
            addSnippet({
                id: 'github-overview',
                label: 'GitHub insights',
                description: 'Repository visibility and stars',
                source: 'GitHub',
                text
            });
        }

        if (context && Object.keys(context).length) {
            try {
                const serialized = JSON.stringify(context, null, 2);
                addSnippet({
                    id: 'context-json',
                    label: 'Attach context snapshot',
                    description: 'Share the structured project context with Guardian',
                    source: 'Context',
                    text: `Project context:\n${serialized}`
                });
            } catch (error) {
                console.warn('Failed to serialize assistant context for snippets', error);
            }
        }

        return snippets;
    }

    function normalizeAssistantSnippetFilter(value = '') {
        if (typeof value !== 'string') {
            return '';
        }

        return value.replace(/\s+/g, ' ').trim();
    }

    function focusAssistantSnippetSearch({ select = false } = {}) {
        if (!assistantSnippetsSearch || assistantSnippetsSearch.disabled) {
            return false;
        }

        try {
            assistantSnippetsSearch.focus({ preventScroll: true });
        } catch (error) {
            assistantSnippetsSearch.focus();
        }

        if (select) {
            try {
                assistantSnippetsSearch.select();
            } catch (error) {
                // Ignore selection issues on unsupported browsers
            }
        }

        return true;
    }

    function getAssistantSnippetButtons() {
        if (!assistantSnippetsList) {
            return [];
        }

        return Array.from(assistantSnippetsList.querySelectorAll('.chat-snippet-button'));
    }

    function focusAssistantSnippetButton(index) {
        const buttons = getAssistantSnippetButtons();

        if (!buttons.length) {
            focusAssistantSnippetSearch();
            return;
        }

        const clamped = Math.max(0, Math.min(index, buttons.length - 1));
        const button = buttons[clamped];

        if (!button) {
            return;
        }

        try {
            button.focus({ preventScroll: true });
        } catch (error) {
            button.focus();
        }
    }

    function getAssistantSnippetFilterButtons() {
        if (!assistantSnippetsFilters) {
            return [];
        }

        return Array.from(assistantSnippetsFilters.querySelectorAll('.chat-snippet-filter'));
    }

    function focusAssistantSnippetFilterButton(index) {
        const buttons = getAssistantSnippetFilterButtons();

        if (!buttons.length) {
            return false;
        }

        const total = buttons.length;
        const normalizedIndex = ((index % total) + total) % total;
        const button = buttons[normalizedIndex];

        buttons.forEach((candidate, candidateIndex) => {
            candidate.tabIndex = candidateIndex === normalizedIndex ? 0 : -1;
        });

        if (!button) {
            return false;
        }

        try {
            button.focus({ preventScroll: true });
        } catch (error) {
            button.focus();
        }

        return true;
    }

    function focusAssistantSnippetFilterByKey(key) {
        const buttons = getAssistantSnippetFilterButtons();

        if (!buttons.length) {
            return false;
        }

        const normalized = normalizeAssistantSnippetCategory(key);
        const targetIndex = buttons.findIndex((button) => (
            normalizeAssistantSnippetCategory(button.dataset.filter) === normalized
        ));

        if (targetIndex === -1) {
            return false;
        }

        return focusAssistantSnippetFilterButton(targetIndex);
    }

    function handleAssistantSnippetFilterKeydown(event) {
        const button = event.target.closest('button.chat-snippet-filter');
        if (!button) {
            return;
        }

        const buttons = getAssistantSnippetFilterButtons();
        const currentIndex = buttons.indexOf(button);

        if (currentIndex === -1) {
            return;
        }

        switch (event.key) {
            case 'ArrowRight':
            case 'ArrowDown': {
                event.preventDefault();
                const nextIndex = (currentIndex + 1) % buttons.length;
                focusAssistantSnippetFilterButton(nextIndex);
                break;
            }
            case 'ArrowLeft':
            case 'ArrowUp': {
                event.preventDefault();
                const previousIndex = (currentIndex - 1 + buttons.length) % buttons.length;
                focusAssistantSnippetFilterButton(previousIndex);
                break;
            }
            case 'Home': {
                event.preventDefault();
                focusAssistantSnippetFilterButton(0);
                break;
            }
            case 'End': {
                event.preventDefault();
                focusAssistantSnippetFilterButton(buttons.length - 1);
                break;
            }
            case 'Enter':
            case ' ': // Space
            case 'Spacebar': {
                event.preventDefault();
                setAssistantSnippetCategory(button.dataset.filter || 'all');
                break;
            }
            case 'Escape': {
                event.preventDefault();
                event.stopPropagation();
                toggleAssistantSnippetPanel(false);
                break;
            }
            default:
                break;
        }
    }

    function handleAssistantSnippetButtonKeydown(event) {
        const buttons = getAssistantSnippetButtons();
        const currentIndex = buttons.indexOf(event.currentTarget);

        if (currentIndex === -1) {
            return;
        }

        switch (event.key) {
            case 'ArrowDown':
            case 'ArrowRight': {
                event.preventDefault();
                const nextIndex = currentIndex + 1 >= buttons.length ? 0 : currentIndex + 1;
                focusAssistantSnippetButton(nextIndex);
                break;
            }
            case 'ArrowUp':
            case 'ArrowLeft': {
                event.preventDefault();
                if (currentIndex === 0) {
                    focusAssistantSnippetSearch();
                } else {
                    focusAssistantSnippetButton(currentIndex - 1);
                }
                break;
            }
            case 'Home': {
                event.preventDefault();
                focusAssistantSnippetButton(0);
                break;
            }
            case 'End': {
                event.preventDefault();
                focusAssistantSnippetButton(buttons.length - 1);
                break;
            }
            case 'Escape': {
                event.preventDefault();
                event.stopPropagation();
                toggleAssistantSnippetPanel(false);
                break;
            }
            default:
                break;
        }
    }

    function handleAssistantSnippetSearchKeydown(event) {
        if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
            event.preventDefault();
            focusAssistantSnippetButton(0);
            return;
        }

        if (event.key === 'Escape' && assistantSnippetFilter) {
            event.preventDefault();
            event.stopPropagation();
            setAssistantSnippetFilter('');
            focusAssistantSnippetSearch({ select: false });
        }
    }

    function setAssistantSnippetFilter(value, { silent = false } = {}) {
        const normalized = normalizeAssistantSnippetFilter(value);

        if (assistantSnippetFilter === normalized) {
            return;
        }

        assistantSnippetFilter = normalized;

        if (assistantSnippetsSearch && assistantSnippetsSearch.value !== normalized) {
            assistantSnippetsSearch.value = normalized;
        }

        if (!silent) {
            updateAssistantSnippets({ recompute: false });
        }
    }

    function normalizeAssistantSnippetSource(value) {
        if (typeof value === 'string') {
            const normalized = value.trim().toLowerCase();
            return normalized || 'general';
        }

        return 'general';
    }

    function normalizeAssistantSnippetCategory(value) {
        if (typeof value === 'string') {
            const normalized = value.trim().toLowerCase();
            return normalized || 'all';
        }

        return 'all';
    }

    function assistantSnippetSourceOrderIndex(key) {
        const normalized = normalizeAssistantSnippetSource(key);
        const index = ASSISTANT_SNIPPET_SOURCE_ORDER.indexOf(normalized);
        if (index !== -1) {
            return index;
        }

        const code = normalized ? normalized.charCodeAt(0) || 0 : 0;
        return ASSISTANT_SNIPPET_SOURCE_ORDER.length + code;
    }

    function computeAssistantSnippetSources() {
        const grouped = new Map();

        assistantSnippetOptions.forEach((snippet) => {
            const key = normalizeAssistantSnippetSource(snippet?.source);
            const label = snippet && typeof snippet.source === 'string' && snippet.source.trim()
                ? snippet.source.trim()
                : 'General';

            const entry = grouped.get(key) || { key, label, count: 0 };
            entry.label = entry.label || label;
            entry.count += 1;
            grouped.set(key, entry);
        });

        return Array.from(grouped.values()).sort((a, b) => {
            const orderA = assistantSnippetSourceOrderIndex(a.key);
            const orderB = assistantSnippetSourceOrderIndex(b.key);

            if (orderA === orderB) {
                return a.label.localeCompare(b.label);
            }

            return orderA - orderB;
        });
    }

    function getAssistantSnippetCategoryInfo(key = assistantSnippetCategory) {
        if (key === 'all') {
            return {
                key: 'all',
                label: 'All',
                count: assistantSnippetOptions.length
            };
        }

        const normalized = normalizeAssistantSnippetCategory(key);
        const match = assistantSnippetSourceMeta.find((entry) => entry.key === normalized);

        if (match) {
            return match;
        }

        return {
            key: normalized,
            label: titleCase(normalized.replace(/[-_]+/g, ' ')),
            count: 0
        };
    }

    function renderAssistantSnippetFilters(hasSnippets, totalCount) {
        if (!assistantSnippetsFilters) {
            return;
        }

        const previouslyFocusedButton = assistantSnippetsFilters.contains(document.activeElement)
            ? document.activeElement.closest('button.chat-snippet-filter')
            : null;
        const previouslyFocusedKey = previouslyFocusedButton
            ? normalizeAssistantSnippetCategory(previouslyFocusedButton.dataset.filter || 'all')
            : null;

        assistantSnippetsFilters.innerHTML = '';

        if (!hasSnippets) {
            assistantSnippetsFilters.setAttribute('hidden', '');
            assistantSnippetsFilters.dataset.hasFilters = 'false';
            return;
        }

        assistantSnippetsFilters.dataset.hasFilters = 'true';
        assistantSnippetsFilters.removeAttribute('hidden');

        const fragment = document.createDocumentFragment();
        const options = [
            { key: 'all', label: 'All', count: totalCount },
            ...assistantSnippetSourceMeta
        ];

        options.forEach((option) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'chat-snippet-filter';
            if (option.key === assistantSnippetCategory) {
                button.classList.add('is-active');
            }
            button.dataset.filter = option.key;
            button.setAttribute('aria-pressed', option.key === assistantSnippetCategory ? 'true' : 'false');
            button.tabIndex = option.key === assistantSnippetCategory ? 0 : -1;

            const label = document.createElement('span');
            label.textContent = option.label;
            const count = document.createElement('span');
            count.className = 'chat-snippet-filter-count';
            count.textContent = option.count;
            button.append(label, count);

            if (option.key === 'all') {
                button.title = option.count === 1
                    ? 'Show all 1 insight'
                    : `Show all ${option.count} insights`;
            } else {
                const noun = pluralize(option.count, 'insight');
                button.title = option.count === 1
                    ? `Show the ${option.label} ${noun}`
                    : `Show ${option.count} ${option.label} ${noun}`;
            }

            fragment.appendChild(button);
        });

        assistantSnippetsFilters.appendChild(fragment);

        if (assistantSnippetPanelVisible && previouslyFocusedKey) {
            requestAnimationFrame(() => {
                if (!focusAssistantSnippetFilterByKey(previouslyFocusedKey)) {
                    focusAssistantSnippetFilterByKey(assistantSnippetCategory);
                }
            });
        }
    }

    function setAssistantSnippetCategory(value, { silent = false, persist = true } = {}) {
        const normalized = normalizeAssistantSnippetCategory(value);

        if (assistantSnippetCategory === normalized) {
            return;
        }

        assistantSnippetCategory = normalized;

        if (persist) {
            persistAssistantSnippetCategory(normalized);
        }

        if (!silent) {
            updateAssistantSnippets({ recompute: false });

            if (assistantSnippetPanelVisible && assistantSnippetsFilters) {
                requestAnimationFrame(() => {
                    if (!focusAssistantSnippetFilterByKey(normalized)) {
                        focusAssistantSnippetFilterByKey('all');
                    }
                });
            }
        }
    }

    function getFilteredAssistantSnippets() {
        let filtered = assistantSnippetOptions.slice();

        if (assistantSnippetCategory && assistantSnippetCategory !== 'all') {
            filtered = filtered.filter((snippet) => (
                normalizeAssistantSnippetSource(snippet?.source) === assistantSnippetCategory
            ));
        }

        if (!assistantSnippetFilter) {
            return filtered;
        }

        const terms = assistantSnippetFilter.toLowerCase().split(' ').filter(Boolean);

        return filtered.filter((snippet) => {
            const haystack = [
                snippet.label,
                snippet.description,
                snippet.source,
                snippet.text
            ]
                .filter(Boolean)
                .join(' ')
                .toLowerCase();

            return terms.every((term) => haystack.includes(term));
        });
    }

    function updateAssistantSnippets({ recompute = true } = {}) {
        if (!assistantSnippetsToggle) {
            return;
        }

        if (recompute) {
            const context = getAssistantContext();
            assistantSnippetOptions = computeAssistantSnippets(context);
        }

        const hasSnippets = assistantSnippetOptions.length > 0;

        if (hasSnippets) {
            assistantSnippetSourceMeta = computeAssistantSnippetSources();
            const availableKeys = assistantSnippetSourceMeta.map((entry) => entry.key);
            if (
                assistantSnippetCategory &&
                assistantSnippetCategory !== 'all' &&
                !availableKeys.includes(assistantSnippetCategory)
            ) {
                setAssistantSnippetCategory('all', { silent: true });
            }
        } else {
            assistantSnippetSourceMeta = [];
        }

        if (!hasSnippets && assistantSnippetFilter) {
            assistantSnippetFilter = '';
            if (assistantSnippetsSearch) {
                assistantSnippetsSearch.value = '';
            }
        }

        renderAssistantSnippetFilters(hasSnippets, assistantSnippetOptions.length);

        const visibleSnippets = hasSnippets ? getFilteredAssistantSnippets() : [];
        const hasVisibleSnippets = visibleSnippets.length > 0;

        assistantSnippetsToggle.disabled = assistantBusy || !hasSnippets;
        assistantSnippetsToggle.dataset.hasSnippets = hasSnippets ? 'true' : 'false';
        assistantSnippetsToggle.classList.toggle('is-empty', !hasSnippets);
        if (!hasSnippets) {
            assistantSnippetsToggle.classList.remove('is-active');
        }
        assistantSnippetsToggle.setAttribute('aria-expanded', assistantSnippetPanelVisible ? 'true' : 'false');
        assistantSnippetsToggle.title = hasSnippets
            ? 'Insert a project insight into your prompt'
            : isOnline()
                ? 'Project insights will appear once context is ready.'
                : 'Project insights will resume when connectivity returns.';

        if (assistantSnippetsSearch) {
            assistantSnippetsSearch.disabled = !hasSnippets;
            assistantSnippetsSearch.placeholder = hasSnippets
                ? 'Filter insights'
                : 'No insights available yet';

            if (assistantSnippetsSearch.value !== assistantSnippetFilter) {
                assistantSnippetsSearch.value = assistantSnippetFilter;
            }
        }

        if (assistantSnippetsClear) {
            const showClear = Boolean(assistantSnippetFilter) && hasSnippets;
            assistantSnippetsClear.hidden = !showClear;
            assistantSnippetsClear.disabled = !showClear;
        }

        if (!assistantSnippetsPanel || !assistantSnippetsList) {
            return;
        }

        assistantSnippetsList.innerHTML = '';

        if (hasSnippets && hasVisibleSnippets) {
            const fragment = document.createDocumentFragment();
            visibleSnippets.forEach((snippet, index) => {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'chat-snippet-button';
                button.dataset.snippetId = snippet.id || `snippet-${index}`;
                button.setAttribute('role', 'menuitem');

                const label = document.createElement('span');
                label.className = 'chat-snippet-label';
                label.textContent = snippet.label || 'Project insight';
                button.appendChild(label);

                if (snippet.description) {
                    const description = document.createElement('span');
                    description.className = 'chat-snippet-description';
                    description.textContent = snippet.description;
                    button.appendChild(description);
                }

                if (snippet.source) {
                    const source = document.createElement('span');
                    source.className = 'chat-snippet-source';
                    source.textContent = snippet.source;
                    button.appendChild(source);
                }

                button.addEventListener('click', () => insertAssistantSnippet(snippet));
                button.addEventListener('keydown', handleAssistantSnippetButtonKeydown);
                fragment.appendChild(button);
            });
            assistantSnippetsList.appendChild(fragment);
        } else {
            const empty = document.createElement('p');
            empty.className = 'chat-snippet-empty';

            if (!hasSnippets) {
                empty.textContent = isOnline()
                    ? 'Project insights are still loading.'
                    : 'Project insights unavailable while offline.';
            } else if (assistantSnippetFilter) {
                const categoryInfo = assistantSnippetCategory !== 'all'
                    ? getAssistantSnippetCategoryInfo()
                    : null;
                empty.textContent = categoryInfo
                    ? `No ${categoryInfo.label} insights match “${assistantSnippetFilter}”.`
                    : `No insights match “${assistantSnippetFilter}”.`;
            } else if (assistantSnippetCategory && assistantSnippetCategory !== 'all') {
                const categoryInfo = getAssistantSnippetCategoryInfo();
                empty.textContent = `No ${categoryInfo.label} insights available yet.`;
            } else {
                empty.textContent = 'Project insights unavailable.';
            }

            assistantSnippetsList.appendChild(empty);
        }

        if (assistantSnippetsHint) {
            if (!hasSnippets) {
                assistantSnippetsHint.textContent = '';
            } else if (assistantSnippetFilter) {
                if (assistantSnippetCategory && assistantSnippetCategory !== 'all') {
                    const categoryInfo = getAssistantSnippetCategoryInfo();
                    assistantSnippetsHint.textContent = hasVisibleSnippets
                        ? `${visibleSnippets.length} ${categoryInfo.label} ${pluralize(visibleSnippets.length, 'insight')} match “${assistantSnippetFilter}”.`
                        : `No ${categoryInfo.label} insights match “${assistantSnippetFilter}”.`;
                } else {
                    assistantSnippetsHint.textContent = hasVisibleSnippets
                        ? `${visibleSnippets.length} of ${assistantSnippetOptions.length} insights match “${assistantSnippetFilter}”.`
                        : 'Try different keywords to find a matching insight.';
                }
            } else if (assistantSnippetCategory && assistantSnippetCategory !== 'all') {
                const categoryInfo = getAssistantSnippetCategoryInfo();
                assistantSnippetsHint.textContent = hasVisibleSnippets
                    ? `Showing ${visibleSnippets.length} ${categoryInfo.label} ${pluralize(visibleSnippets.length, 'insight')} out of ${categoryInfo.count}.`
                    : `No ${categoryInfo.label} insights available yet.`;
            } else {
                assistantSnippetsHint.textContent = isOnline()
                    ? 'Snippets refresh automatically with project data.'
                    : 'Offline — using cached project insights.';
            }
        }

        if (!hasSnippets && assistantSnippetPanelVisible) {
            toggleAssistantSnippetPanel(false);
        } else if (assistantSnippetPanelVisible) {
            assistantSnippetsPanel.removeAttribute('hidden');
        } else {
            assistantSnippetsPanel.setAttribute('hidden', '');
        }
    }

    function toggleAssistantSnippetPanel(force) {
        if (!assistantSnippetsPanel || !assistantSnippetsToggle) {
            return;
        }

        const hasSnippets = assistantSnippetOptions.length > 0;
        const shouldOpen = typeof force === 'boolean' ? force : assistantSnippetsPanel.hidden;

        if (shouldOpen) {
            if (!hasSnippets || assistantBusy) {
                return;
            }

            assistantSnippetPanelVisible = true;
            assistantSnippetsPanel.removeAttribute('hidden');
            assistantSnippetsToggle.classList.add('is-active');
            assistantSnippetsToggle.setAttribute('aria-expanded', 'true');

            requestAnimationFrame(() => {
                if (focusAssistantSnippetSearch({ select: Boolean(assistantSnippetFilter) })) {
                    return;
                }

                const buttons = getAssistantSnippetButtons();

                if (buttons.length) {
                    focusAssistantSnippetButton(0);
                    return;
                }

                try {
                    assistantSnippetsPanel.focus({ preventScroll: true });
                } catch (error) {
                    if (typeof assistantSnippetsPanel.focus === 'function') {
                        assistantSnippetsPanel.focus();
                    }
                }
            });
        } else {
            assistantSnippetPanelVisible = false;
            assistantSnippetsPanel.setAttribute('hidden', '');
            assistantSnippetsToggle.classList.remove('is-active');
            assistantSnippetsToggle.setAttribute('aria-expanded', 'false');
        }
    }

    function insertAssistantSnippet(snippet) {
        if (!assistantInput || !snippet || !snippet.text) {
            return;
        }

        const text = snippet.text.trim();
        if (!text) {
            return;
        }

        const value = assistantInput.value;
        const start = typeof assistantInput.selectionStart === 'number'
            ? assistantInput.selectionStart
            : value.length;
        const end = typeof assistantInput.selectionEnd === 'number'
            ? assistantInput.selectionEnd
            : value.length;

        const before = value.slice(0, start);
        const after = value.slice(end);

        const needsLeadingSpace = before && !/\s$/.test(before);
        const needsTrailingSpace = after && !/^\s/.test(after);

        const prefix = needsLeadingSpace ? ' ' : '';
        const suffix = needsTrailingSpace ? ' ' : '';

        assistantInput.value = `${before}${prefix}${text}${suffix}${after}`;
        const cursorPosition = (before + prefix + text).length;

        handleAssistantInputChange();
        toggleAssistantSnippetPanel(false);

        try {
            assistantInput.focus({ preventScroll: true });
        } catch (error) {
            assistantInput.focus();
        }

        requestAnimationFrame(() => {
            try {
                assistantInput.setSelectionRange(cursorPosition, cursorPosition);
            } catch (error) {
                // Ignore selection issues on unsupported browsers
            }
        });

        const label = snippet.label ? snippet.label.toLowerCase() : 'project insight';
        showToast(`Inserted ${label} into your prompt.`, 'info', 2600);
    }

    function handleAssistantSuggestion(message, { submit = false } = {}) {
        if (!assistantInput) {
            return;
        }

        assistantInput.value = message;
        handleAssistantInputChange();

        try {
            assistantInput.focus({ preventScroll: true });
        } catch (error) {
            assistantInput.focus();
        }

        if (submit && assistantForm && !assistantBusy && isOnline()) {
            assistantForm.requestSubmit();
        }
    }

    function updateAssistantSuggestions() {
        if (!assistantSuggestions) {
            return;
        }

        const items = computeAssistantSuggestions();
        assistantSuggestions.innerHTML = '';

        if (!items.length) {
            assistantSuggestions.hidden = true;
            assistantSuggestions.classList.add('is-empty');
            assistantSuggestions.dataset.hasSuggestions = 'false';
            return;
        }

        assistantSuggestions.hidden = false;
        assistantSuggestions.classList.remove('is-empty');
        assistantSuggestions.dataset.hasSuggestions = 'true';

        const disabled = assistantBusy || !isOnline();

        items.forEach((suggestion) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'chat-suggestion';
            button.textContent = suggestion;
            button.disabled = disabled;
            button.title = disabled
                ? 'Reconnect to use this prompt.'
                : 'Click to insert this prompt. Ctrl/Cmd+Click to send immediately.';
            button.addEventListener('click', (event) => {
                if (button.disabled) {
                    return;
                }

                const submit = event.metaKey || event.ctrlKey;
                handleAssistantSuggestion(suggestion, { submit });
            });

            assistantSuggestions.appendChild(button);
        });
    }

    function toggleAssistantOfflineNotice(online) {
        if (!assistantLog) {
            return;
        }

        const existing = assistantLog.querySelector('.chat-message.offline-notice');
        if (!online) {
            if (!existing) {
                appendAssistantMessage('system', 'Offline — Guardian will respond once reconnected.', {
                    classes: ['offline-notice'],
                    ephemeral: true,
                    meta: null
                });
            }
        } else if (existing) {
            existing.remove();
        }
    }

    function updateAssistantControls(online = isOnline()) {
        if (assistantSendButton) {
            assistantSendButton.disabled = assistantBusy || !online;
            assistantSendButton.classList.toggle('is-busy', assistantBusy);
        }

        if (assistantInput) {
            assistantInput.disabled = assistantBusy;
            assistantInput.placeholder = online
                ? 'Ask Guardian for help with scans, tooling, or deployment strategy…'
                : 'Reconnect to ask Guardian new questions…';
        }

        if (assistantClearButton) {
            assistantClearButton.disabled = assistantBusy || assistantHistory.length === 0;
        }

        if (assistantStopButton) {
            if (assistantBusy && online) {
                assistantStopButton.hidden = false;
                assistantStopButton.disabled = false;
            } else {
                assistantStopButton.hidden = true;
                assistantStopButton.disabled = true;
            }
        }

        if (assistantExportButton) {
            const hasHistory = assistantHistory.length > 0;
            assistantExportButton.disabled = !hasHistory;
            assistantExportButton.title = hasHistory
                ? 'Download the Guardian transcript'
                : 'Start a conversation to enable exports.';
        }

        if (assistantCard) {
            assistantCard.classList.toggle('offline', !online);
        }

        if (assistantBusy && assistantSnippetPanelVisible) {
            toggleAssistantSnippetPanel(false);
        }
    }

    function updateAssistantAvailability(options = {}) {
        const online = isOnline();
        const { notifyOffline = false } = options;

        toggleAssistantOfflineNotice(online);

        if (!assistantBadge || !assistantMeta) {
            updateAssistantControls(online);
            updateAssistantContextStatus();
            return;
        }

        if (!online) {
            setBadge(assistantBadge, 'Offline', 'status-warning', { source: 'offline', state: 'offline' });
            setUpdatedMeta('assistant-updated', {
                message: 'Offline – assistant paused',
                offline: true,
                fromCache: true
            });
            if (notifyOffline) {
                showToast('Guardian assistant is offline. Replies will resume when you reconnect.', 'warning');
            }
        } else if (assistantBusy) {
            setBadge(assistantBadge, 'Thinking…', 'status-warning', { source: 'live' });
            setUpdatedMeta('assistant-updated', { message: 'Generating guidance…' });
        } else {
            const lastAssistantEntry = assistantHistory.slice().reverse().find(entry => entry.role === 'assistant');
            if (lastAssistantEntry) {
                const ts = parseDateLike(lastAssistantEntry.timestamp) || new Date();
                assistantLastResponseAt = ts;
                setUpdatedMeta('assistant-updated', { timestamp: ts, fromCache: false });
            } else {
                setUpdatedMeta('assistant-updated', { message: 'Ask anything about your project' });
            }
            setBadge(assistantBadge, 'Ready', 'status-good', { source: 'live' });
        }

        updateAssistantControls(online);
        updateAssistantContextStatus();
        updateAssistantSnippets();
        updateAssistantSuggestions();
    }

    function restoreAssistantHistory() {
        if (!assistantLog) {
            return;
        }

        assistantLog.innerHTML = '';
        delete assistantLog.dataset.introShown;

        assistantDraftHistory = readAssistantDraftHistory();
        assistantDraftHistoryIndex = -1;
        assistantDraftNavigating = false;
        assistantDraftOriginal = assistantInput ? assistantInput.value : '';

        assistantHistory = readAssistantHistory();
        assistantLastResponseAt = null;

        if (assistantHistory.length) {
            assistantHistory.forEach(entry => {
                const meta = entry.provider ? `via ${titleCase(entry.provider)}` : null;
                appendAssistantMessage(entry.role, entry.content, {
                    timestamp: entry.timestamp,
                    meta
                });

                if (entry.role === 'assistant') {
                    const ts = parseDateLike(entry.timestamp);
                    if (ts && (!assistantLastResponseAt || ts > assistantLastResponseAt)) {
                        assistantLastResponseAt = ts;
                    }
                }
            });
        } else {
            appendAssistantIntro();
        }

        updateAssistantAvailability();
        handleAssistantInputChange();
        updateAssistantSuggestions();
    }

    function computeAssistantContext() {
        const context = {};
        const projectInfo = {};

        const statusRecord = latestData.status || readCache('status')?.data || null;
        if (statusRecord) {
            projectInfo.name = statusRecord.projectName || statusRecord.package?.name || 'Guardian Project';
            if (statusRecord.package?.version) {
                projectInfo.version = statusRecord.package.version;
            }
            if (typeof statusRecord.git?.uncommitted === 'number') {
                projectInfo.uncommittedChanges = statusRecord.git.uncommitted;
            }
            if (statusRecord.git?.branch) {
                projectInfo.branch = statusRecord.git.branch;
            }
            if (statusRecord.experienceLevel) {
                projectInfo.experienceLevel = statusRecord.experienceLevel;
            }
            if (statusRecord.package) {
                projectInfo.dependencies = {
                    runtime: statusRecord.package.dependencies ?? 0,
                    dev: statusRecord.package.devDependencies ?? 0
                };
            }
        }

        const scanRecord = latestData.scan || readCache('security')?.data || null;
        if (scanRecord) {
            const counts = getSeverityCounts(scanRecord.issues);
            projectInfo.security = {
                issues: counts,
                warnings: Array.isArray(scanRecord.warnings) ? scanRecord.warnings.length : 0,
                lastScan: (() => {
                    const ts = extractTimestamp(scanRecord);
                    return ts ? ts.toISOString() : null;
                })()
            };
        }

        const toolsRecord = latestData.tools || readCache('tools')?.data || null;
        if (toolsRecord) {
            projectInfo.tooling = {
                detected: Array.isArray(toolsRecord.detected)
                    ? toolsRecord.detected.map(formatToolLabel).slice(0, 10)
                    : [],
                missing: Array.isArray(toolsRecord.missing)
                    ? toolsRecord.missing.map(formatToolLabel).slice(0, 10)
                    : []
            };
        }

        const gitRecord = latestData.git || readCache('git')?.data || null;
        if (gitRecord) {
            projectInfo.repository = {
                branch: gitRecord.branch || null,
                status: Array.isArray(gitRecord.status) ? gitRecord.status.slice(0, 6) : [],
                recentCommits: Array.isArray(gitRecord.commits) ? gitRecord.commits.slice(0, 3) : []
            };
        }

        const deploymentsRecord = (latestData.deployments && latestData.deployments.length)
            ? latestData.deployments
            : (readCache('deployments')?.data || []);
        if (Array.isArray(deploymentsRecord) && deploymentsRecord.length) {
            projectInfo.deployments = deploymentsRecord.slice(0, 3).map(entry => ({
                platform: entry.platform || entry.provider || null,
                recent: Array.isArray(entry.deployments)
                    ? entry.deployments.slice(0, 2).map(dep => {
                        const ts = extractTimestamp(dep);
                        return {
                            name: dep.name || dep.project || dep.target || 'Deployment',
                            state: dep.state || dep.readyState || null,
                            createdAt: ts ? ts.toISOString() : null
                        };
                    })
                    : []
            }));
        }

        const githubRecord = latestData.github || readCache('github')?.data || null;
        if (githubRecord && !githubRecord.error) {
            projectInfo.github = {
                name: githubRecord.name || githubRecord.repo || null,
                owner: githubRecord.owner || githubRecord.organization || null,
                stars: githubRecord.stargazerCount,
                visibility: githubRecord.isPrivate === undefined ? null : (githubRecord.isPrivate ? 'private' : 'public')
            };
        }

        if (Object.keys(projectInfo).length) {
            context.projectInfo = projectInfo;
        }

        return context;
    }

    function renderAssistantContext(context = getAssistantContext()) {
        if (!assistantContextContent) {
            return;
        }

        assistantContextContent.innerHTML = '';

        const info = context?.projectInfo;

        const createSection = (title, nodes = []) => {
            if (!nodes.length) {
                return null;
            }

            const section = document.createElement('section');
            section.className = 'chat-context-section';
            const heading = document.createElement('h4');
            heading.textContent = title;
            section.appendChild(heading);
            nodes.forEach(node => section.appendChild(node));
            return section;
        };

        const createPair = (label, value) => {
            if (value === null || value === undefined || value === '') {
                return null;
            }

            const row = document.createElement('div');
            row.className = 'chat-context-pair';
            const labelEl = document.createElement('span');
            labelEl.textContent = label;
            const valueEl = document.createElement('span');
            valueEl.textContent = value;
            row.append(labelEl, valueEl);
            return row;
        };

        const createList = (items = []) => {
            if (!items.length) {
                return null;
            }

            const list = document.createElement('ul');
            list.className = 'chat-context-list';
            items.forEach(item => {
                const li = document.createElement('li');
                li.textContent = item;
                list.appendChild(li);
            });
            return list;
        };

        if (info && Object.keys(info).length) {
            const overviewPairs = [];
            overviewPairs.push(createPair('Project', info.name));
            overviewPairs.push(createPair('Version', info.version));
            overviewPairs.push(createPair('Branch', info.branch));
            if (typeof info.uncommittedChanges === 'number') {
                overviewPairs.push(createPair('Uncommitted', `${info.uncommittedChanges}`));
            }
            if (info.dependencies && (info.dependencies.runtime !== undefined || info.dependencies.dev !== undefined)) {
                const runtime = info.dependencies.runtime ?? 0;
                const dev = info.dependencies.dev ?? 0;
                overviewPairs.push(createPair('Dependencies', `${runtime} runtime / ${dev} dev`));
            }
            overviewPairs.push(createPair('Experience', info.experienceLevel ? titleCase(info.experienceLevel) : null));
            const overviewNodes = overviewPairs.filter(Boolean);
            const overviewSection = createSection('Overview', overviewNodes);
            if (overviewSection) {
                assistantContextContent.appendChild(overviewSection);
            }

            if (info.security) {
                const severityEntries = Object.entries(info.security.issues || {})
                    .filter(([, count]) => typeof count === 'number' && count > 0)
                    .map(([key, count]) => `${titleCase(key.toLowerCase())}: ${count}`);
                const list = createList(severityEntries);
                const securityPairs = [];
                if (typeof info.security.warnings === 'number' && info.security.warnings > 0) {
                    securityPairs.push(createPair('Warnings', `${info.security.warnings}`));
                }
                if (info.security.lastScan) {
                    const ts = parseDateLike(info.security.lastScan);
                    const relative = ts ? formatRelativeTime(ts) : null;
                    const display = relative || new Date(info.security.lastScan).toLocaleString();
                    securityPairs.push(createPair('Last scan', display));
                }
                const nodes = [...securityPairs.filter(Boolean)];
                if (list) {
                    nodes.push(list);
                }
                const securitySection = createSection('Security', nodes);
                if (securitySection) {
                    assistantContextContent.appendChild(securitySection);
                }
            }

            if (info.tooling && (Array.isArray(info.tooling.detected) || Array.isArray(info.tooling.missing))) {
                const detected = (info.tooling.detected || []).slice(0, 8);
                const missing = (info.tooling.missing || []).slice(0, 8);
                const nodes = [];
                if (detected.length) {
                    const list = createList(detected.map(item => `Detected: ${item}`));
                    if (list) {
                        nodes.push(list);
                    }
                }
                if (missing.length) {
                    const list = createList(missing.map(item => `Missing: ${item}`));
                    if (list) {
                        nodes.push(list);
                    }
                }
                const toolingSection = createSection('Tooling', nodes);
                if (toolingSection) {
                    assistantContextContent.appendChild(toolingSection);
                }
            }

            if (info.repository) {
                const repoNodes = [];
                repoNodes.push(createPair('Branch', info.repository.branch));
                if (Array.isArray(info.repository.status) && info.repository.status.length) {
                    const list = createList(info.repository.status.slice(0, 6));
                    if (list) {
                        repoNodes.push(list);
                    }
                }
                if (Array.isArray(info.repository.recentCommits) && info.repository.recentCommits.length) {
                    const commits = info.repository.recentCommits.slice(0, 3).map(commit => {
                        if (typeof commit === 'string') {
                            return commit;
                        }
                        const hash = commit.hash ? commit.hash.substring(0, 7) : '';
                        const message = commit.message || commit.description || 'Commit';
                        return hash ? `${hash} — ${message}` : message;
                    });
                    const list = createList(commits);
                    if (list) {
                        repoNodes.push(list);
                    }
                }
                const repoSection = createSection('Repository', repoNodes.filter(Boolean));
                if (repoSection) {
                    assistantContextContent.appendChild(repoSection);
                }
            }

            if (Array.isArray(info.deployments) && info.deployments.length) {
                const items = info.deployments.slice(0, 3).map(entry => {
                    const platform = entry.platform ? titleCase(entry.platform) : 'Deployment';
                    const recent = Array.isArray(entry.recent) ? entry.recent[0] : null;
                    if (!recent) {
                        return platform;
                    }
                    const ts = recent.createdAt ? parseDateLike(recent.createdAt) : null;
                    const relative = ts ? formatRelativeTime(ts) : null;
                    const state = recent.state ? titleCase(recent.state) : null;
                    const detailParts = [state, relative].filter(Boolean);
                    return detailParts.length ? `${platform}: ${detailParts.join(' • ')}` : platform;
                });
                const deploymentsSection = createSection('Deployments', [createList(items.filter(Boolean))].filter(Boolean));
                if (deploymentsSection) {
                    assistantContextContent.appendChild(deploymentsSection);
                }
            }

            if (info.github) {
                const githubNodes = [];
                const repoName = info.github.owner && info.github.name
                    ? `${info.github.owner}/${info.github.name}`
                    : info.github.name;
                githubNodes.push(createPair('Repository', repoName));
                if (info.github.visibility) {
                    githubNodes.push(createPair('Visibility', titleCase(info.github.visibility)));
                }
                if (info.github.stars !== undefined && info.github.stars !== null) {
                    githubNodes.push(createPair('Stars', `${info.github.stars}`));
                }
                const githubSection = createSection('GitHub', githubNodes.filter(Boolean));
                if (githubSection) {
                    assistantContextContent.appendChild(githubSection);
                }
            }
        }

        if (!assistantContextContent.childElementCount) {
            const empty = document.createElement('div');
            empty.className = 'chat-context-empty';
            empty.textContent = 'Project context will appear once status, scans, or tooling data has loaded.';
            assistantContextContent.appendChild(empty);
        }

        if (!isOnline()) {
            const notice = document.createElement('div');
            notice.className = 'chat-context-empty';
            notice.textContent = 'Offline — showing cached project context when available.';
            assistantContextContent.appendChild(notice);
        }
    }

    function updateAssistantContextStatus() {
        const context = getAssistantContext();
        const info = context?.projectInfo;
        const segments = new Set();

        if (info) {
            if (info.name || info.version || info.branch || typeof info.uncommittedChanges === 'number') {
                segments.add('Status');
            }
            if (info.security) {
                segments.add('Security');
            }
            if (info.tooling && ((info.tooling.detected && info.tooling.detected.length) || (info.tooling.missing && info.tooling.missing.length))) {
                segments.add('Tooling');
            }
            if (info.repository && (
                (info.repository.branch) ||
                (Array.isArray(info.repository.status) && info.repository.status.length) ||
                (Array.isArray(info.repository.recentCommits) && info.repository.recentCommits.length)
            )) {
                segments.add('Git');
            }
            if (Array.isArray(info.deployments) && info.deployments.length) {
                segments.add('Deployments');
            }
            if (info.github && (info.github.name || info.github.owner)) {
                segments.add('GitHub');
            }
        }

        const hasContext = segments.size > 0;

        if (assistantContextStatus) {
            let summary = hasContext
                ? `Context: ${Array.from(segments).join(' • ')}`
                : 'Context: awaiting data';
            if (hasContext && !isOnline()) {
                summary += ' (cached)';
            }
            assistantContextStatus.textContent = summary;
            assistantContextStatus.classList.toggle('is-empty', !hasContext);
        }

        if (assistantContextButton) {
            assistantContextButton.dataset.hasContext = hasContext ? 'true' : 'false';
            const baseLabel = hasContext ? 'View context' : 'Context pending';
            assistantContextButton.textContent = assistantContextVisible ? 'Hide context' : baseLabel;
            assistantContextButton.setAttribute('aria-expanded', assistantContextVisible ? 'true' : 'false');
            assistantContextButton.classList.toggle('is-empty', !hasContext);
            assistantContextButton.disabled = false;
        }

        if (assistantContextPanel && !assistantContextPanel.hidden) {
            renderAssistantContext(context);
        }

        updateAssistantSuggestions();
        updateAssistantSnippets();
    }

    function toggleAssistantContextPanel(force) {
        if (!assistantContextPanel || !assistantContextButton) {
            return;
        }

        const shouldShow = typeof force === 'boolean' ? force : assistantContextPanel.hidden;
        assistantContextPanel.hidden = !shouldShow;
        assistantContextVisible = shouldShow && !assistantContextPanel.hidden;

        if (!assistantContextPanel.hidden) {
            renderAssistantContext(getAssistantContext());
            assistantContextPanel.scrollTop = 0;
        }

        assistantContextVisible = !assistantContextPanel.hidden;
        assistantContextButton.setAttribute('aria-expanded', assistantContextVisible ? 'true' : 'false');
        updateAssistantContextStatus();
    }

    function clearAssistantConversation() {
        assistantHistory = [];
        assistantLastResponseAt = null;
        persistAssistantHistory();

        if (assistantLog) {
            assistantLog.innerHTML = '';
            delete assistantLog.dataset.introShown;
        }

        if (assistantInput) {
            assistantDraftNavigating = false;
            assistantDraftHistoryIndex = -1;
            assistantInput.value = '';
            handleAssistantInputChange();
        } else {
            assistantDraftNavigating = false;
            assistantDraftHistoryIndex = -1;
            assistantDraftOriginal = '';
        }

        appendAssistantIntro();
        showToast('Assistant history cleared.', 'info');
        updateAssistantAvailability();
        updateAssistantSuggestions();
    }

    function handleAssistantInputResize() {
        if (!assistantInput) {
            return;
        }

        assistantInput.style.height = 'auto';
        const computed = window.getComputedStyle(assistantInput);
        const maxHeight = parseFloat(computed.maxHeight) || 200;
        const newHeight = Math.min(maxHeight, assistantInput.scrollHeight + 2);
        assistantInput.style.height = `${newHeight}px`;
    }

    function handleAssistantInputChange() {
        if (!assistantInput) {
            return;
        }

        handleAssistantInputResize();

        if (!assistantDraftNavigating) {
            assistantDraftOriginal = assistantInput.value;
            assistantDraftHistoryIndex = -1;
        }
    }

    function handleAssistantInputKeydown(event) {
        if (!assistantInput) {
            return;
        }

        const hasModifier = event.altKey || event.ctrlKey || event.metaKey;

        if (!hasModifier && !event.shiftKey) {
            if (event.key === 'ArrowUp') {
                if (!assistantDraftHistory.length) {
                    return;
                }

                event.preventDefault();

                if (assistantDraftHistoryIndex === -1) {
                    assistantDraftOriginal = assistantInput.value;
                    assistantDraftHistoryIndex = assistantDraftHistory.length - 1;
                } else if (assistantDraftHistoryIndex > 0) {
                    assistantDraftHistoryIndex -= 1;
                }

                if (assistantDraftHistoryIndex >= 0) {
                    showAssistantDraftFromHistory(assistantDraftHistoryIndex);
                }
                return;
            }

            if (event.key === 'ArrowDown') {
                if (assistantDraftHistoryIndex === -1) {
                    return;
                }

                event.preventDefault();

                if (assistantDraftHistoryIndex < assistantDraftHistory.length - 1) {
                    assistantDraftHistoryIndex += 1;
                    showAssistantDraftFromHistory(assistantDraftHistoryIndex);
                } else {
                    assistantDraftHistoryIndex = -1;
                    assistantDraftNavigating = true;
                    assistantInput.value = assistantDraftOriginal || '';
                    handleAssistantInputChange();
                    assistantDraftNavigating = false;

                    try {
                        assistantInput.focus({ preventScroll: true });
                    } catch (error) {
                        assistantInput.focus();
                    }

                    const length = assistantInput.value.length;
                    requestAnimationFrame(() => {
                        try {
                            assistantInput.setSelectionRange(length, length);
                        } catch (error) {
                            // ignore caret positioning failures
                        }
                    });
                }
                return;
            }
        }

        if (event.key === 'Enter' && !event.shiftKey && !event.altKey && !event.metaKey) {
            const trimmed = assistantInput.value.trim();
            if (!trimmed) {
                return;
            }
            event.preventDefault();
            if (assistantForm) {
                if (typeof assistantForm.requestSubmit === 'function') {
                    assistantForm.requestSubmit();
                } else {
                    const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
                    assistantForm.dispatchEvent(submitEvent);
                }
            }
        }
    }

    async function handleAssistantSubmit(event) {
        event.preventDefault();

        if (!assistantInput || assistantBusy) {
            return;
        }

        const question = assistantInput.value.trim();
        if (!question) {
            return;
        }

        if (!isOnline()) {
            showToast('You are offline. Reconnect to ask Guardian for help.', 'warning');
            updateAssistantAvailability();
            return;
        }

        assistantBusy = true;
        updateAssistantAvailability();

        if (assistantLog) {
            assistantLog.querySelectorAll('.chat-message.intro').forEach(node => node.remove());
        }

        toggleAssistantOfflineNotice(true);

        const timestamp = Date.now();
        appendAssistantMessage('user', question, { timestamp });
        assistantHistory.push({ role: 'user', content: question, timestamp });
        persistAssistantHistory();
        rememberAssistantDraft(question);

        assistantInput.value = '';
        handleAssistantInputChange();

        const pending = appendAssistantMessage('assistant', 'Guardian is thinking…', { pending: true });

        try {
            const payload = { message: question };
            const context = getAssistantContext({ force: true });
            if (context && Object.keys(context).length) {
                payload.context = context;
            }

            const result = await fetchJSON('chat', '/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                timeout: 60_000
            });

            const reply = result?.response || result?.message;
            if (!reply) {
                throw new Error('Assistant returned an empty response.');
            }

            if (pending && pending.parentElement === assistantLog) {
                pending.remove();
            }

            const providerName = result?.provider ? titleCase(result.provider) : null;
            const responseTimestamp = Date.now();

            appendAssistantMessage('assistant', reply, {
                timestamp: responseTimestamp,
                meta: providerName ? `via ${providerName}` : null
            });

            assistantHistory.push({
                role: 'assistant',
                content: reply,
                timestamp: responseTimestamp,
                provider: result?.provider || null
            });
            persistAssistantHistory();

            assistantLastResponseAt = new Date(responseTimestamp);
            setUpdatedMeta('assistant-updated', { timestamp: assistantLastResponseAt });
            showToast('Guardian assistant replied.', 'success');
        } catch (error) {
            if (pending && pending.parentElement === assistantLog) {
                pending.remove();
            }

            if (error.name === 'AbortError') {
                if (error.reason === 'user-cancel') {
                    const canceledAt = Date.now();
                    appendAssistantMessage('system', 'Canceled the Guardian reply.', { tone: 'warning', timestamp: canceledAt });
                    assistantHistory.push({
                        role: 'system',
                        content: 'Canceled the Guardian reply.',
                        timestamp: canceledAt
                    });
                    persistAssistantHistory();
                    showToast('Canceled the Guardian reply.', 'warning');
                }
                return;
            }

            appendAssistantMessage('assistant', `Unable to respond: ${error.message}`, { tone: 'error' });
            const variant = error.name === 'TimeoutError' ? 'warning' : 'error';
            showToast(`Assistant error: ${error.message}`, variant);
        } finally {
            assistantBusy = false;
            updateAssistantAvailability();
        }
    }

    function handleAssistantStop() {
        if (!assistantBusy) {
            showToast('No Guardian reply is active right now.', 'info');
            return;
        }

        const aborted = abortRequest('chat', { reason: 'user-cancel' });
        if (!aborted) {
            showToast('Guardian reply is already wrapping up. Please wait a moment.', 'info');
            return;
        }

        if (assistantStopButton) {
            assistantStopButton.disabled = true;
        }
    }

    function populateStatus(data, { fromCache = false, timestamp, expired = false, offline = false } = {}) {
        const content = document.getElementById('status-content');
        const badge = document.getElementById('status-badge');
        if (!content) {
            return;
        }

        latestData.status = data || null;
        markAssistantContextDirty();
        updateAssistantContextStatus();

        clearLoadingState(content);
        removeOfflineNotice(content);
        content.innerHTML = '';

        const projectNameLabel = document.getElementById('project-name');

        if (!data) {
            if (projectNameLabel && !projectNameLabel.textContent) {
                projectNameLabel.textContent = 'Guardian Project';
            }

            const message = document.createElement('p');
            message.className = 'muted-text';
            message.textContent = offline
                ? 'Offline — reconnect to refresh project status.'
                : fromCache
                    ? 'Cached project status unavailable.'
                    : 'No project status available yet.';
            content.appendChild(message);

            setBadge(badge, offline ? 'Offline' : 'Pending', 'status-warning', {
                source: offline ? 'offline' : fromCache ? 'cache' : 'live',
                state: offline ? 'offline' : expired ? 'stale' : ''
            });

            setUpdatedMeta('status-updated', {
                message: offline
                    ? 'Offline – awaiting status data'
                    : 'Awaiting project status',
                fromCache,
                offline,
                expired
            });

            content.dataset.loaded = 'true';
            if (badge) {
                badge.dataset.loaded = 'true';
            }
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

        setBadge(badge, badgeText, badgeVariant, {
            source: offline ? 'offline' : fromCache ? 'cache' : 'live',
            state: offline ? 'offline' : expired ? 'stale' : ''
        });

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

        latestData.scan = data || null;
        markAssistantContextDirty();
        updateAssistantContextStatus();

        if (!data) {
            const message = document.createElement('p');
            message.className = 'muted-text';
            message.textContent = offline
                ? 'Offline — no cached security scan available.'
                : 'Security scan has not run yet.';
            content.appendChild(message);

            setBadge(badge, offline ? 'Offline' : 'Pending', 'status-warning', {
                source: offline ? 'offline' : fromCache ? 'cache' : 'live',
                state: offline ? 'offline' : expired ? 'stale' : ''
            });

            setUpdatedMeta('security-updated', {
                message: offline
                    ? 'Offline – scan unavailable'
                    : 'Scan not run yet',
                fromCache,
                offline,
                expired
            });

            content.dataset.loaded = 'true';
            if (badge) {
                badge.dataset.loaded = 'true';
            }

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

        setBadge(badge, badgeInfo.text, badgeInfo.variant, {
            source: offline ? 'offline' : fromCache ? 'cache' : 'live',
            state: offline ? 'offline' : expired ? 'stale' : ''
        });

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

        latestData.tools = data || null;
        markAssistantContextDirty();
        updateAssistantContextStatus();

        clearLoadingState(content);
        removeOfflineNotice(content);
        content.innerHTML = '';

        if (!data) {
            const message = document.createElement('p');
            message.className = 'muted-text';
            message.textContent = offline
                ? 'Offline — no cached tooling insights available.'
                : 'Tool detection has not run yet.';
            content.appendChild(message);

            setBadge(badge, offline ? 'Offline' : 'Pending', 'status-warning', {
                source: offline ? 'offline' : fromCache ? 'cache' : 'live',
                state: offline ? 'offline' : expired ? 'stale' : ''
            });

            setUpdatedMeta('tools-updated', {
                message: offline
                    ? 'Offline – awaiting tool signals'
                    : 'Awaiting tool signals',
                fromCache,
                offline,
                expired
            });

            content.dataset.loaded = 'true';
            if (badge) {
                badge.dataset.loaded = 'true';
            }
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
                    label.textContent = formatToolLabel(tool);

                    const installCommand = resolveInstallCommand(tool);
                    const docsLink = resolveDocsLink(tool);
                    let action;

                    if (installCommand) {
                        action = document.createElement('button');
                        action.type = 'button';
                        action.className = 'holo-button compact';
                        action.textContent = 'Install';
                        action.dataset.command = installCommand;
                        action.dataset.tool = formatToolLabel(tool);
                        action.addEventListener('click', handleInstallTool);
                    } else if (docsLink) {
                        action = document.createElement('a');
                        action.className = 'holo-button compact';
                        action.textContent = 'Docs';
                        action.href = docsLink;
                        action.target = '_blank';
                        action.rel = 'noopener noreferrer';
                    } else {
                        action = document.createElement('button');
                        action.type = 'button';
                        action.className = 'holo-button compact';
                        action.textContent = 'Manual';
                        action.disabled = true;
                        action.title = 'Review details below to install manually.';
                    }

                    row.append(label, action);
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

        setBadge(badge, badgeText, badgeVariant, {
            source: offline ? 'offline' : fromCache ? 'cache' : 'live',
            state: offline ? 'offline' : expired ? 'stale' : ''
        });

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
        markAssistantContextDirty();
        updateAssistantContextStatus();

        let derivedTimestamp = null;
        entries.forEach(entry => {
            const candidate = extractTimestamp(entry);
            if (candidate && (!derivedTimestamp || candidate > derivedTimestamp)) {
                derivedTimestamp = candidate;
            }
        });

        if (!entries.length) {
            const message = document.createElement('p');
            message.className = 'muted-text';
            message.textContent = offline
                ? 'Offline — deployment history will resume when reconnected.'
                : fromCache
                    ? 'No cached deployment providers detected.'
                    : 'No deployment providers detected yet.';
            content.appendChild(message);

            setBadge(badge, 'No data', 'status-warning', {
                source: offline ? 'offline' : fromCache ? 'cache' : 'live',
                state: offline ? 'offline' : expired ? 'stale' : ''
            });
        } else {
            const providers = entries.length;
            setBadge(badge, `${providers} provider${providers === 1 ? '' : 's'}`, 'status-good', {
                source: offline ? 'offline' : fromCache ? 'cache' : 'live',
                state: offline ? 'offline' : expired ? 'stale' : ''
            });

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

        setUpdatedMeta('deployments-updated', {
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
        markAssistantContextDirty();
        updateAssistantContextStatus();

        if (!data || data.error) {
            const note = document.createElement('p');
            note.className = 'muted-text';
            note.textContent = data?.error
                ? data.error
                : offline
                    ? 'Offline — repository insights unavailable.'
                    : fromCache
                        ? 'Cached repository insights unavailable.'
                        : 'Repository information unavailable.';
            content.appendChild(note);

            setBadge(badge, data?.error ? 'Unavailable' : offline ? 'Offline' : 'Pending', 'status-warning', {
                source: offline ? 'offline' : fromCache ? 'cache' : 'live',
                state: offline ? 'offline' : expired ? 'stale' : ''
            });

            setUpdatedMeta('github-updated', {
                message: offline
                    ? 'Offline – repository insights unavailable'
                    : 'Awaiting repository insights',
                fromCache,
                offline,
                expired
            });

            content.dataset.loaded = 'true';
            if (badge) {
                badge.dataset.loaded = 'true';
            }
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

        setBadge(badge, badgeText, badgeVariant, {
            source: offline ? 'offline' : fromCache ? 'cache' : 'live',
            state: offline ? 'offline' : expired ? 'stale' : ''
        });

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
            latestData.status = cached?.data || null;
            markAssistantContextDirty();
            updateAssistantContextStatus();
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
                latestData.status = null;
                markAssistantContextDirty();
                updateAssistantContextStatus();
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
                markAssistantContextDirty();
                updateAssistantContextStatus();
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
                    markAssistantContextDirty();
                    updateAssistantContextStatus();
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
            latestData.tools = cached?.data || null;
            markAssistantContextDirty();
            updateAssistantContextStatus();
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
                latestData.tools = null;
                markAssistantContextDirty();
                updateAssistantContextStatus();
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
                latestData.deployments = [];
                markAssistantContextDirty();
                updateAssistantContextStatus();
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
                latestData.github = null;
                markAssistantContextDirty();
                updateAssistantContextStatus();
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
                    latestData.github = null;
                    markAssistantContextDirty();
                    updateAssistantContextStatus();
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
                markAssistantContextDirty();
                updateAssistantContextStatus();
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
                latestData.git = null;
                markAssistantContextDirty();
                updateAssistantContextStatus();
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
            markAssistantContextDirty();
            updateAssistantContextStatus();
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
                markAssistantContextDirty();
                updateAssistantContextStatus();
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
            markAssistantContextDirty();
            updateAssistantContextStatus();
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

        updateAssistantContextStatus();
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

    async function handleInstallTool(event) {
        event.stopPropagation();

        const button = event.currentTarget;
        if (!button || button.dataset.state === 'busy') {
            return;
        }

        const command = button.dataset.command;
        const toolName = button.dataset.tool || 'Tool';

        if (!command) {
            showToast(`No automated install available for ${toolName}.`, 'warning');
            return;
        }

        if (!isOnline()) {
            showToast(`Cannot install ${toolName} while offline.`, 'warning');
            return;
        }

        const originalText = button.textContent;
        button.dataset.state = 'busy';
        button.dataset.originalText = originalText;
        button.textContent = 'Installing...';
        button.disabled = true;
        button.classList.add('is-busy');
        button.setAttribute('aria-busy', 'true');

        let succeeded = false;
        let aborted = false;

        try {
            const key = `install-${slugify(toolName)}`;
            const result = await fetchJSON(key, '/api/install-tool', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tool: toolName, command }),
                timeout: 120_000
            });

            if (result?.success) {
                succeeded = true;
                showToast(`${toolName} installed successfully.`, 'success');
                try {
                    await loadTools();
                } catch (refreshError) {
                    console.error('Tool installed but refresh failed', refreshError);
                    showToast('Tool installed, but refreshing tool insights failed.', 'warning');
                }
            } else {
                const reason = result?.message || 'Installation failed.';
                throw new Error(reason);
            }
        } catch (error) {
            if (error.name === 'AbortError') {
                aborted = true;
            } else {
                console.error(`Failed to install ${toolName}`, error);
                const variant = error.name === 'TimeoutError' ? 'warning' : 'error';
                const message = error.name === 'TimeoutError'
                    ? `Installing ${toolName} timed out.`
                    : `Unable to install ${toolName}: ${error.message}`;
                showToast(message, variant);
            }
        } finally {
            if (!button.isConnected) {
                return;
            }

            button.removeAttribute('aria-busy');
            button.classList.remove('is-busy');

            if (succeeded) {
                button.textContent = 'Installed';
                button.disabled = true;
                button.dataset.state = 'done';
            } else {
                const storedOriginal = button.dataset.originalText;
                button.textContent = storedOriginal || originalText;
                button.disabled = false;
                delete button.dataset.state;
            }

            delete button.dataset.originalText;

            if (!succeeded && aborted) {
                // No toast for aborts; just reset state quietly
                return;
            }
        }
    }

    async function handleAutoFix(event) {
        event.stopPropagation();

        const button = event.currentTarget;
        if (!button || button.dataset.state === 'busy') {
            return;
        }

        const issueId = button.dataset.issueId;
        if (!issueId) {
            showToast('Unable to determine which issue to auto-fix.', 'error');
            return;
        }

        const issueLabel = button.dataset.issueLabel || issueId;
        const originalText = button.textContent;

        if (!isOnline()) {
            showToast(`Cannot auto-fix ${issueLabel} while offline.`, 'warning');
            return;
        }

        button.dataset.state = 'busy';
        button.dataset.originalText = originalText;
        button.textContent = 'Fixing...';
        button.disabled = true;
        button.classList.add('is-busy');
        button.setAttribute('aria-busy', 'true');

        let succeeded = false;

        try {
            const result = await fetchJSON(`fix-${issueId}`, '/api/fix', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ issueId }),
                timeout: 60_000
            });

            if (result?.success) {
                succeeded = true;
                const detail = result.message ? `: ${result.message}` : '';
                showToast(`Auto-fix applied to ${issueLabel}${detail}`, 'success');
                try {
                    await refreshScan();
                } catch (refreshError) {
                    console.error('Auto-fix applied but refresh failed', refreshError);
                    showToast('Auto-fix applied, but refreshing data failed. Please rescan manually.', 'warning');
                }
            } else {
                const reason = result?.message || 'No auto-fix available for this issue.';
                throw new Error(reason);
            }
        } catch (error) {
            if (error.name === 'AbortError') {
                return;
            }
            console.error(`Auto-fix failed for ${issueId}`, error);
            const variant = error.name === 'TimeoutError' ? 'warning' : 'error';
            const message = error.name === 'TimeoutError'
                ? `Auto-fix timed out for ${issueLabel}.`
                : `Auto-fix failed for ${issueLabel}: ${error.message}`;
            showToast(message, variant);
        } finally {
            if (!button.isConnected) {
                return;
            }

            button.removeAttribute('aria-busy');
            button.classList.remove('is-busy');
            delete button.dataset.state;

            const storedOriginal = button.dataset.originalText;
            delete button.dataset.originalText;

            if (succeeded) {
                button.textContent = 'Fixed';
                button.disabled = true;
            } else {
                button.textContent = storedOriginal || originalText;
                button.disabled = false;
            }
        }
    }

    if (assistantForm) {
        assistantForm.addEventListener('submit', handleAssistantSubmit);
    }

    if (assistantClearButton) {
        assistantClearButton.addEventListener('click', clearAssistantConversation);
    }

    if (assistantStopButton) {
        assistantStopButton.addEventListener('click', handleAssistantStop);
    }

    if (assistantContextButton) {
        assistantContextButton.addEventListener('click', () => toggleAssistantContextPanel());
    }

    if (assistantSnippetsToggle) {
        assistantSnippetsToggle.addEventListener('click', () => {
            if (assistantSnippetPanelVisible) {
                toggleAssistantSnippetPanel(false);
            } else {
                updateAssistantSnippets();
                toggleAssistantSnippetPanel(true);
            }
        });
    }

    if (assistantSnippetsSearch) {
        assistantSnippetsSearch.addEventListener('input', (event) => {
            setAssistantSnippetFilter(event.target.value);
        });
        assistantSnippetsSearch.addEventListener('keydown', handleAssistantSnippetSearchKeydown);
    }

    if (assistantSnippetsClear) {
        assistantSnippetsClear.addEventListener('click', () => {
            setAssistantSnippetFilter('');
            focusAssistantSnippetSearch({ select: true });
        });
    }

    if (assistantSnippetsFilters) {
        assistantSnippetsFilters.addEventListener('click', (event) => {
            const button = event.target.closest('button.chat-snippet-filter');
            if (!button || button.disabled) {
                return;
            }

            const category = button.dataset.filter || 'all';
            setAssistantSnippetCategory(category);
        });
        assistantSnippetsFilters.addEventListener('keydown', handleAssistantSnippetFilterKeydown);
    }

    if (assistantContextClose) {
        assistantContextClose.addEventListener('click', () => toggleAssistantContextPanel(false));
    }

    if (assistantExportButton) {
        assistantExportButton.addEventListener('click', exportAssistantTranscript);
    }

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && assistantContextVisible && assistantContextPanel && !assistantContextPanel.hidden) {
            toggleAssistantContextPanel(false);
        }

        if (event.key === 'Escape' && assistantSnippetPanelVisible) {
            toggleAssistantSnippetPanel(false);
        }
    });

    document.addEventListener('click', (event) => {
        if (!assistantSnippetPanelVisible) {
            return;
        }

        if (!assistantSnippetsPanel || !assistantSnippetsToggle) {
            return;
        }

        if (assistantSnippetsPanel.contains(event.target) || assistantSnippetsToggle.contains(event.target)) {
            return;
        }

        toggleAssistantSnippetPanel(false);
    });

    if (assistantInput) {
        handleAssistantInputChange();
        assistantInput.addEventListener('input', handleAssistantInputChange);
        assistantInput.addEventListener('keydown', handleAssistantInputKeydown);
        assistantInput.addEventListener('focus', () => toggleAssistantSnippetPanel(false));
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

    if (issuesRescanButton) {
        issuesRescanButton.addEventListener('click', () => {
            void refreshScan();
        });
    }

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
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initHolographicDashboard, { once: true });
} else {
    initHolographicDashboard();
}
