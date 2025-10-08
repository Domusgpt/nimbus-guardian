const fs = require('fs-extra');
const path = require('path');
const dotenv = require('dotenv');
const { toPlatformSlug, toPlatformLabel } = require('./platform-utils');

const EXPERIENCE_ALIASES = new Map([
    ['beginner', 'beginner'],
    ['novice', 'beginner'],
    ['newbie', 'beginner'],
    ['intermediate', 'intermediate'],
    ['mid', 'intermediate'],
    ['experienced', 'advanced'],
    ['advanced', 'advanced'],
    ['expert', 'advanced']
]);

const PROVIDER_ALIASES = new Map([
    ['claude', 'claude'],
    ['anthropic', 'claude'],
    ['gemini', 'gemini'],
    ['google', 'gemini'],
    ['google ai', 'gemini'],
    ['both', 'both'],
    ['either', 'both'],
    ['all', 'both']
]);

function normalizeExperience(value) {
    if (!value) return undefined;

    const normalized = value.toString().trim();
    if (!normalized) return undefined;

    const key = normalized.toLowerCase();
    if (EXPERIENCE_ALIASES.has(key)) {
        return EXPERIENCE_ALIASES.get(key);
    }

    return normalized.toLowerCase();
}

function normalizeProvider(value) {
    if (!value) return undefined;

    const normalized = value.toString().trim();
    if (!normalized) return undefined;

    const key = normalized.toLowerCase();
    if (PROVIDER_ALIASES.has(key)) {
        return PROVIDER_ALIASES.get(key);
    }

    return normalized.toLowerCase();
}

function normalizeConfig(config = {}) {
    const normalized = { ...(config || {}) };

    // Harmonize new config fields with legacy aliases
    if (!normalized.experienceLevel && normalized.experience) {
        normalized.experienceLevel = normalizeExperience(normalized.experience);
    } else if (normalized.experienceLevel) {
        normalized.experienceLevel = normalizeExperience(normalized.experienceLevel);
    }

    if (!normalized.preferredProvider && normalized.aiProvider) {
        normalized.preferredProvider = normalizeProvider(normalized.aiProvider);
    } else if (normalized.preferredProvider) {
        normalized.preferredProvider = normalizeProvider(normalized.preferredProvider);
    }

    if (normalized.platform) {
        const slug = toPlatformSlug(normalized.platform);
        if (slug) {
            normalized.platform = slug;
        }
    }

    if (!normalized.platform && normalized.cloudProvider) {
        const slug = toPlatformSlug(normalized.cloudProvider);
        if (slug) {
            normalized.platform = slug;
        }
    }

    // Environment fallbacks
    if (!normalized.projectName && process.env.PROJECT_NAME) {
        normalized.projectName = process.env.PROJECT_NAME;
    }

    if (!normalized.experienceLevel) {
        const envExperience = normalizeExperience(process.env.EXPERIENCE_LEVEL || process.env.EXPERIENCE);
        if (envExperience) {
            normalized.experienceLevel = envExperience;
        }
    }

    if (!normalized.preferredProvider) {
        const envProvider = normalizeProvider(process.env.PREFERRED_PROVIDER || process.env.AI_PROVIDER);
        if (envProvider) {
            normalized.preferredProvider = envProvider;
        }
    }

    if (!normalized.platform) {
        const envPlatform = toPlatformSlug(process.env.PLATFORM);
        if (envPlatform) {
            normalized.platform = envPlatform;
        }
    }

    if (!normalized.platform) {
        const envCloud = toPlatformSlug(process.env.CLOUD_PROVIDER);
        if (envCloud) {
            normalized.platform = envCloud;
        }
    }

    if (!normalized.claudeApiKey && process.env.CLAUDE_API_KEY) {
        normalized.claudeApiKey = process.env.CLAUDE_API_KEY;
    }

    if (!normalized.geminiApiKey && process.env.GEMINI_API_KEY) {
        normalized.geminiApiKey = process.env.GEMINI_API_KEY;
    }

    // Ensure legacy aliases remain populated
    if (normalized.experienceLevel && !normalized.experience) {
        normalized.experience = normalized.experienceLevel;
    }

    if (normalized.preferredProvider && !normalized.aiProvider) {
        normalized.aiProvider = normalized.preferredProvider;
    }

    if (normalized.platform) {
        const label = toPlatformLabel(normalized.platform);
        if (!normalized.cloudProvider || normalized.cloudProvider === normalized.platform) {
            normalized.cloudProvider = label;
        }
    } else if (normalized.cloudProvider) {
        const slug = toPlatformSlug(normalized.cloudProvider);
        if (slug) {
            normalized.platform = slug;
        }
    }

    for (const key of Object.keys(normalized)) {
        if (normalized[key] === undefined) {
            delete normalized[key];
        }
    }

    return Object.keys(normalized).length > 0 ? normalized : null;
}

async function readConfig(projectPath) {
    await loadGuardianEnv(projectPath);

    const configPath = path.join(projectPath, '.guardian', 'config.json');

    try {
        const config = await fs.readJson(configPath);
        return normalizeConfig(config);
    } catch {
        return normalizeConfig({});
    }
}

async function loadGuardianEnv(projectPath) {
    const envPath = path.join(projectPath, '.guardian', '.env');

    try {
        if (await fs.pathExists(envPath)) {
            dotenv.config({ path: envPath, override: true });
        }
    } catch {
        // Ignore env loading errors - config reading should continue
    }
}

module.exports = {
    normalizeConfig,
    readConfig
};
