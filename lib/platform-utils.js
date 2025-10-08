const PLATFORM_ALIASES = new Map([
    ['google cloud (firebase)', 'firebase'],
    ['google cloud firebase', 'firebase'],
    ['google cloud', 'firebase'],
    ['google-cloud', 'firebase'],
    ['google-cloud-firebase', 'firebase'],
    ['firebase', 'firebase'],
    ['gcp', 'firebase'],
    ['aws', 'aws'],
    ['amazon web services', 'aws'],
    ['amazon-web-services', 'aws'],
    ['amazon', 'aws'],
    ['azure', 'azure'],
    ['microsoft azure', 'azure'],
    ['microsoft-azure', 'azure'],
    ['vercel', 'vercel'],
    ['netlify', 'netlify'],
    ['not sure yet', 'unknown'],
    ['not-sure-yet', 'unknown'],
    ['unknown', 'unknown'],
    ['n/a', 'unknown'],
    ['na', 'unknown']
]);

const PLATFORM_LABELS = {
    firebase: 'Google Cloud (Firebase)',
    aws: 'AWS',
    azure: 'Azure',
    vercel: 'Vercel',
    netlify: 'Netlify',
    unknown: 'Not sure yet'
};

function sanitizeSlug(value) {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function toPlatformSlug(value) {
    if (!value) return undefined;

    const normalized = value.toString().trim();
    if (!normalized) return undefined;

    const key = normalized.toLowerCase();
    if (PLATFORM_ALIASES.has(key)) {
        return PLATFORM_ALIASES.get(key);
    }

    return sanitizeSlug(normalized);
}

function toPlatformLabel(slug) {
    if (!slug) return undefined;

    const canonical = toPlatformSlug(slug);
    if (!canonical) return undefined;

    return PLATFORM_LABELS[canonical] || canonical;
}

function derivePlatform(answer) {
    const slug = toPlatformSlug(answer);
    if (!slug) {
        return { slug: undefined, label: undefined };
    }

    const mappedLabel = PLATFORM_LABELS[slug];
    const fallbackLabel = typeof answer === 'string' && answer.trim() ? answer.trim() : slug;

    return {
        slug,
        label: mappedLabel || fallbackLabel
    };
}

module.exports = {
    toPlatformSlug,
    toPlatformLabel,
    derivePlatform
};
