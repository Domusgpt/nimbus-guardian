const fs = require('fs-extra');
const path = require('path');
const dotenv = require('dotenv');

const VALID_EXPERIENCE_LEVELS = new Set(['beginner', 'intermediate', 'advanced']);
const loadedEnvFiles = new Set();

function getConfigPaths(projectPath = process.cwd()) {
    const configDir = path.join(projectPath, '.guardian');
    return {
        projectPath,
        configDir,
        configPath: path.join(configDir, 'config.json'),
        envPath: path.join(configDir, '.env')
    };
}

function sanitizeConfigInput(data = {}) {
    const sanitized = { ...data };
    delete sanitized.experience;
    delete sanitized.claudeApiKey;
    delete sanitized.geminiApiKey;
    return sanitized;
}

function normalizeExperienceLevel(value) {
    if (!value) {
        return 'intermediate';
    }

    const normalized = value.toString().trim().toLowerCase();
    return VALID_EXPERIENCE_LEVELS.has(normalized) ? normalized : 'intermediate';
}

function normalizeConfigData(raw = {}, projectPath) {
    const normalized = sanitizeConfigInput(raw);
    let changed = false;

    if (normalized.experienceLevel) {
        const experienceLevel = normalizeExperienceLevel(normalized.experienceLevel);
        if (experienceLevel !== normalized.experienceLevel) {
            normalized.experienceLevel = experienceLevel;
            changed = true;
        }
    } else if (normalized.experience) {
        normalized.experienceLevel = normalizeExperienceLevel(normalized.experience);
        delete normalized.experience;
        changed = true;
    } else {
        normalized.experienceLevel = 'intermediate';
        changed = true;
    }

    if (!normalized.projectName && projectPath) {
        normalized.projectName = path.basename(projectPath);
        changed = true;
    }

    return { config: normalized, changed };
}

async function loadEnvironment(projectPath) {
    const { envPath } = getConfigPaths(projectPath);

    if (!(await fs.pathExists(envPath))) {
        return {};
    }

    if (!loadedEnvFiles.has(envPath)) {
        dotenv.config({ path: envPath });
        loadedEnvFiles.add(envPath);
    }

    try {
        const contents = await fs.readFile(envPath);
        return dotenv.parse(contents);
    } catch {
        return {};
    }
}

async function loadConfig(projectPath = process.cwd(), options = {}) {
    const { createIfMissing = false } = options;
    const { configPath, configDir } = getConfigPaths(projectPath);

    let rawConfig;
    if (await fs.pathExists(configPath)) {
        rawConfig = await fs.readJson(configPath);
    } else if (createIfMissing) {
        rawConfig = {};
        await fs.ensureDir(configDir);
    } else {
        await loadEnvironment(projectPath);
        return null;
    }

    const { config: normalized, changed } = normalizeConfigData(rawConfig, projectPath);

    if (changed) {
        await fs.writeJson(configPath, normalized, { spaces: 2 });
    }

    const envValues = await loadEnvironment(projectPath);

    return {
        ...normalized,
        claudeApiKey: normalized.claudeApiKey || envValues.CLAUDE_API_KEY || process.env.CLAUDE_API_KEY,
        geminiApiKey: normalized.geminiApiKey || envValues.GEMINI_API_KEY || process.env.GEMINI_API_KEY
    };
}

async function saveConfig(projectPath = process.cwd(), data = {}) {
    const { configPath, configDir } = getConfigPaths(projectPath);
    await fs.ensureDir(configDir);

    let existing = {};
    if (await fs.pathExists(configPath)) {
        existing = await fs.readJson(configPath);
    }

    const merged = { ...existing, ...sanitizeConfigInput(data) };
    const { config: normalized } = normalizeConfigData(merged, projectPath);

    await fs.writeJson(configPath, normalized, { spaces: 2 });
    return normalized;
}

module.exports = {
    getConfigPaths,
    loadConfig,
    saveConfig,
    loadEnvironment,
    normalizeExperienceLevel
};
