import { parseDateLike } from '../../shared/time.js';

export function titleCase(value = '') {
    return value
        .toString()
        .split(/[_\-\s]+/)
        .filter(Boolean)
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
}

export function isLikelyShellCommand(value) {
    if (typeof value !== 'string') return false;
    const trimmed = value.trim();
    if (!trimmed) return false;
    return /^(npm|npx|yarn|pnpm|bun|pip3?|brew|apt(-get)?|go|cargo|dotnet|curl|bash|sh)\b/i.test(trimmed);
}

export function resolveInstallCommand(tool) {
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

export function resolveDocsLink(tool) {
    if (!tool || typeof tool !== 'object') {
        return null;
    }

    return tool.docs || tool.documentation || tool.cliRequired?.docs || null;
}

export function formatToolLabel(tool) {
    if (!tool) return 'Tool';
    const primary = tool.name || tool.provider || tool.command || tool.category || 'Tool';
    const category = tool.category && !primary.toLowerCase().includes(tool.category.toLowerCase())
        ? ` (${titleCase(tool.category)})`
        : '';
    return `${titleCase(primary)}${category}`;
}

export function formatRelativeTimeValue(value, { now = Date.now, parser = parseDateLike } = {}) {
    const date = parser(value);
    if (!date) {
        return null;
    }

    const diffMs = now() - date.getTime();
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
            const amount = Math.max(1, Math.round(absolute / divisor));
            const plural = amount === 1 ? unit : `${unit}s`;
            return `${amount} ${plural} ${tense}`;
        }
    }

    return date.toLocaleString();
}

export function appendTimelineItem(list, titleText, metaText, url) {
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
