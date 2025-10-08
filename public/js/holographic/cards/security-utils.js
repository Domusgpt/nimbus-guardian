export function getSeverityCounts(issues) {
    const counts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
    (issues || []).forEach(issue => {
        const key = (issue?.severity || '').toString().toUpperCase();
        if (Object.prototype.hasOwnProperty.call(counts, key)) {
            counts[key] += 1;
        }
    });
    return counts;
}

export function getSecurityBadge(counts, warningCount = 0) {
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

export function computeSecureScore(counts, warningCount = 0) {
    const penalty = (counts.CRITICAL * 35) + (counts.HIGH * 20) + (counts.MEDIUM * 10) + (warningCount * 5);
    return Math.max(0, 100 - penalty);
}

export function severityToClass(severity = 'INFO') {
    const map = {
        CRITICAL: 'critical',
        HIGH: 'high',
        MEDIUM: 'medium',
        LOW: 'low',
        INFO: 'info',
        SUCCESS: 'success'
    };
    const key = severity?.toString().toUpperCase();
    return map[key] || 'info';
}

export function severityIcon(severity = 'INFO') {
    const map = {
        CRITICAL: '🔴',
        HIGH: '🟠',
        MEDIUM: '🟡',
        LOW: '🔵',
        INFO: '⚪',
        SUCCESS: '🟢'
    };
    const key = severity?.toString().toUpperCase();
    return map[key] || '⚪';
}

export function gitStatusSeverity(code = '') {
    const trimmed = code.trim();
    if (!trimmed) return 'INFO';
    if (trimmed.includes('U') || trimmed.includes('D')) return 'HIGH';
    if (trimmed.includes('M') || trimmed.includes('A')) return 'MEDIUM';
    if (trimmed === '??') return 'LOW';
    return 'INFO';
}

export function createProgressBar(score) {
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

export function createInfoItem(iconSymbol, title, details, severity = 'INFO') {
    const item = document.createElement('li');
    item.className = `issue-item ${severityToClass(severity)}`;

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
