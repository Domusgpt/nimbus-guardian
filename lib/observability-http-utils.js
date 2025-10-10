'use strict';

function normalizeCookie(value) {
    if (typeof value !== 'string' || value.trim().length === 0) {
        return '';
    }

    const trimmed = value.trim();
    if (trimmed.includes('=')) {
        return trimmed;
    }

    return `guardian_session=${trimmed}`;
}

function parseHeaderOptions(option) {
    const entries = Array.isArray(option) ? option : option ? [option] : [];
    const headers = {};
    const warnings = [];

    for (const entry of entries) {
        if (typeof entry !== 'string') {
            warnings.push('Ignoring non-string header entry.');
            continue;
        }

        const separator = entry.indexOf(':');
        if (separator === -1) {
            warnings.push(`Ignoring invalid header "${entry}". Use KEY:VALUE format.`);
            continue;
        }

        const key = entry.slice(0, separator).trim();
        const value = entry.slice(separator + 1).trim();

        if (!key || !value) {
            warnings.push(`Ignoring invalid header "${entry}". Use KEY:VALUE format.`);
            continue;
        }

        headers[key] = value;
    }

    return { headers, warnings };
}

module.exports = {
    normalizeCookie,
    parseHeaderOptions
};
