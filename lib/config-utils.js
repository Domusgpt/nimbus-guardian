const fs = require('fs-extra');
const path = require('path');

function normalizeConfig(config = {}) {
    if (!config) return null;

    const normalized = { ...config };

    if (!normalized.experienceLevel && normalized.experience) {
        normalized.experienceLevel = normalized.experience;
    }
    if (!normalized.preferredProvider && normalized.aiProvider) {
        normalized.preferredProvider = normalized.aiProvider;
    }
    if (!normalized.platform && normalized.cloudProvider) {
        normalized.platform = normalized.cloudProvider;
    }

    if (!normalized.experienceLevel && process.env.EXPERIENCE_LEVEL) {
        normalized.experienceLevel = process.env.EXPERIENCE_LEVEL;
    }
    if (!normalized.preferredProvider && (process.env.PREFERRED_PROVIDER || process.env.AI_PROVIDER)) {
        normalized.preferredProvider = process.env.PREFERRED_PROVIDER || process.env.AI_PROVIDER;
    }
    if (!normalized.platform && (process.env.PLATFORM || process.env.CLOUD_PROVIDER)) {
        normalized.platform = process.env.PLATFORM || process.env.CLOUD_PROVIDER;
    }

    if (normalized.experienceLevel && !normalized.experience) {
        normalized.experience = normalized.experienceLevel;
    }
    if (normalized.preferredProvider && !normalized.aiProvider) {
        normalized.aiProvider = normalized.preferredProvider;
    }
    if (normalized.platform && !normalized.cloudProvider) {
        normalized.cloudProvider = normalized.platform;
    }

    return normalized;
}

async function readConfig(projectPath) {
    const configPath = path.join(projectPath, '.guardian', 'config.json');

    try {
        const config = await fs.readJson(configPath);
        return normalizeConfig(config);
    } catch {
        return null;
    }
}

module.exports = {
    normalizeConfig,
    readConfig
};
