const fs = require('fs-extra');
const path = require('path');
const dotenv = require('dotenv');

function normalizeConfig(config = {}) {
    const normalized = { ...(config || {}) };

    if (!normalized.experienceLevel && normalized.experience) {
        normalized.experienceLevel = normalized.experience;
    }
    if (!normalized.preferredProvider && normalized.aiProvider) {
        normalized.preferredProvider = normalized.aiProvider;
    }
    if (!normalized.platform && normalized.cloudProvider) {
        normalized.platform = normalized.cloudProvider;
    }

    if (!normalized.projectName && process.env.PROJECT_NAME) {
        normalized.projectName = process.env.PROJECT_NAME;
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
    if (!normalized.claudeApiKey && process.env.CLAUDE_API_KEY) {
        normalized.claudeApiKey = process.env.CLAUDE_API_KEY;
    }
    if (!normalized.geminiApiKey && process.env.GEMINI_API_KEY) {
        normalized.geminiApiKey = process.env.GEMINI_API_KEY;
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
