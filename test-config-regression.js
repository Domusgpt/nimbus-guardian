#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs-extra');
const os = require('os');
const path = require('path');

const GuardianEngine = require('./guardian-engine');
const setup = require('./setup');
const { readConfig } = require('./lib/config-utils');

const ENV_KEYS = [
    'PROJECT_NAME',
    'EXPERIENCE_LEVEL',
    'PREFERRED_PROVIDER',
    'AI_PROVIDER',
    'PLATFORM',
    'CLOUD_PROVIDER',
    'CLAUDE_API_KEY',
    'GEMINI_API_KEY'
];

function snapshotEnv(keys) {
    return keys.reduce((acc, key) => {
        if (Object.prototype.hasOwnProperty.call(process.env, key)) {
            acc[key] = process.env[key];
        } else {
            acc[key] = undefined;
        }
        return acc;
    }, {});
}

function restoreEnv(snapshot) {
    for (const [key, value] of Object.entries(snapshot)) {
        if (value === undefined) {
            delete process.env[key];
        } else {
            process.env[key] = value;
        }
    }
}

async function run() {
    const originalEnv = snapshotEnv(ENV_KEYS);

    const answers = {
        projectName: 'regression-project',
        experience: 'advanced',
        cloudProvider: 'Google Cloud (Firebase)',
        aiProvider: 'claude'
    };
    const expectedPlatformSlug = 'firebase';

    try {
        // Case 1: Fresh config produced by setup helper
        const freshDir = await fs.mkdtemp(path.join(os.tmpdir(), 'guardian-config-fresh-'));
        const freshConfigDir = path.join(freshDir, '.guardian');
        await fs.ensureDir(freshConfigDir);

        const freshConfig = setup.createConfigFromAnswers(answers);
        assert.strictEqual(freshConfig.platform, expectedPlatformSlug, 'setup should store normalized platform slug');
        assert.strictEqual(freshConfig.cloudProvider, answers.cloudProvider, 'setup should keep legacy cloudProvider label');
        await fs.writeJson(path.join(freshConfigDir, 'config.json'), freshConfig, { spaces: 2 });

        const normalizedFresh = await readConfig(freshDir);
        assert.ok(normalizedFresh, 'Fresh config should load');
        assert.strictEqual(normalizedFresh.experienceLevel, answers.experience, 'experienceLevel should match wizard answer');
        assert.strictEqual(normalizedFresh.preferredProvider, answers.aiProvider, 'preferredProvider should match wizard answer');
        assert.strictEqual(normalizedFresh.platform, expectedPlatformSlug, 'platform should be normalized to slug');
        assert.strictEqual(normalizedFresh.cloudProvider, answers.cloudProvider, 'cloudProvider should retain human label');

        const engineFromFresh = new GuardianEngine(freshDir, normalizedFresh);
        assert.strictEqual(engineFromFresh.config.experienceLevel, answers.experience, 'GuardianEngine config should include experienceLevel');
        assert.strictEqual(engineFromFresh.ai.config.preferredProvider, answers.aiProvider, 'GuardianEngine AI should honor preferred provider');

        // Case 2: Legacy config missing the new keys
        const legacyDir = await fs.mkdtemp(path.join(os.tmpdir(), 'guardian-config-legacy-'));
        const legacyConfigDir = path.join(legacyDir, '.guardian');
        await fs.ensureDir(legacyConfigDir);

        const legacyConfig = { ...freshConfig };
        delete legacyConfig.experienceLevel;
        delete legacyConfig.preferredProvider;
        delete legacyConfig.platform;
        await fs.writeJson(path.join(legacyConfigDir, 'config.json'), legacyConfig, { spaces: 2 });

        const normalizedLegacy = await readConfig(legacyDir);
        assert.ok(normalizedLegacy, 'Legacy config should load');
        assert.strictEqual(normalizedLegacy.experienceLevel, answers.experience, 'Legacy config should normalize experienceLevel');
        assert.strictEqual(normalizedLegacy.preferredProvider, answers.aiProvider, 'Legacy config should normalize preferredProvider');
        assert.strictEqual(normalizedLegacy.platform, expectedPlatformSlug, 'Legacy config should normalize platform slug');
        assert.strictEqual(normalizedLegacy.cloudProvider, answers.cloudProvider, 'Legacy config should preserve cloudProvider label');

        const engineFromLegacy = new GuardianEngine(legacyDir, normalizedLegacy);
        assert.strictEqual(engineFromLegacy.config.experienceLevel, answers.experience, 'GuardianEngine should normalize legacy experience');
        assert.strictEqual(engineFromLegacy.ai.config.preferredProvider, answers.aiProvider, 'GuardianEngine should normalize legacy preferred provider');

        // Case 3: Environment fallback for missing config fields
        restoreEnv(originalEnv);

        const envDir = await fs.mkdtemp(path.join(os.tmpdir(), 'guardian-config-env-'));
        const envConfigDir = path.join(envDir, '.guardian');
        await fs.ensureDir(envConfigDir);

        await fs.writeJson(path.join(envConfigDir, 'config.json'), { projectName: answers.projectName }, { spaces: 2 });

        const envFile = `PROJECT_NAME=${answers.projectName}
EXPERIENCE_LEVEL=${answers.experience}
PREFERRED_PROVIDER=${answers.aiProvider}
PLATFORM=${expectedPlatformSlug}

AI_PROVIDER=${answers.aiProvider}
CLOUD_PROVIDER=${answers.cloudProvider}
`;
        await fs.writeFile(path.join(envConfigDir, '.env'), envFile);

        const normalizedEnv = await readConfig(envDir);
        assert.ok(normalizedEnv, 'Environment-backed config should load');
        assert.strictEqual(normalizedEnv.projectName, answers.projectName, 'Environment should provide projectName');
        assert.strictEqual(normalizedEnv.experienceLevel, answers.experience, 'Environment should provide experienceLevel');
        assert.strictEqual(normalizedEnv.preferredProvider, answers.aiProvider, 'Environment should provide preferredProvider');
        assert.strictEqual(normalizedEnv.platform, expectedPlatformSlug, 'Environment should provide platform slug');
        assert.strictEqual(normalizedEnv.cloudProvider, answers.cloudProvider, 'Environment should provide cloudProvider label');

        const engineFromEnv = new GuardianEngine(envDir, normalizedEnv);
        assert.strictEqual(engineFromEnv.ai.config.preferredProvider, answers.aiProvider, 'GuardianEngine should honor provider from environment');

        await fs.remove(freshDir);
        await fs.remove(legacyDir);
        await fs.remove(envDir);

        console.log('✅ GuardianEngine respects config from setup, legacy files, and environment fallbacks');
    } finally {
        restoreEnv(originalEnv);
    }
}

run().catch(error => {
    console.error('❌ Guardian config regression failed');
    console.error(error);
    process.exit(1);
});
