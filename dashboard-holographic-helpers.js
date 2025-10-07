export function titleCase(value = '') {
    return value
        .toString()
        .split(/[_\-\s]+/)
        .filter(Boolean)
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
}

export function slugify(value = '') {
    return value
        .toString()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '')
        || 'item';
}

export function pluralize(value, singular, plural = `${singular}s`) {
    return value === 1 ? singular : plural;
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

export function parseDateLike(value) {
    if (!value) return null;
    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : value;
    }

    if (typeof value === 'number') {
        const millis = value > 1e12 ? value : value * 1000;
        const numericDate = new Date(millis);
        return Number.isNaN(numericDate.getTime()) ? null : numericDate;
    }

    const asDate = new Date(value);
    if (!Number.isNaN(asDate.getTime())) {
        return asDate;
    }

    return null;
}

export function formatRelativeTime(value, now = Date.now()) {
    const date = parseDateLike(value);
    if (!date) {
        return null;
    }

    const diffMs = now - date.getTime();
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
            const magnitude = Math.max(1, Math.round(absolute / divisor));
            const plural = magnitude === 1 ? unit : `${unit}s`;
            return `${magnitude} ${plural} ${tense}`;
        }
    }

    return date.toLocaleString();
}

export function getSeverityCounts(issues) {
    const counts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
    (issues || []).forEach(issue => {
        const key = (issue?.severity || '').toString().toUpperCase();
        if (counts[key] !== undefined) {
            counts[key] += 1;
        }
    });
    return counts;
}

export function getSecurityBadge(counts, warningCount) {
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

export function computeSecureScore(counts, warningCount) {
    const penalty = (counts.CRITICAL * 35) + (counts.HIGH * 20) + (counts.MEDIUM * 10) + (warningCount * 5);
    return Math.max(0, 100 - penalty);
}

export function gitStatusSeverity(code = '') {
    const trimmed = code.trim();
    if (!trimmed) return 'INFO';
    if (trimmed.includes('U') || trimmed.includes('D')) return 'HIGH';
    if (trimmed.includes('M') || trimmed.includes('A')) return 'MEDIUM';
    if (trimmed === '??') return 'LOW';
    return 'INFO';
}
