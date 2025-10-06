#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs-extra');
const os = require('os');
const path = require('path');

const GuardianEngine = require('./guardian-engine');
const setup = require('./setup');
const { readConfig } = require('./lib/config-utils');

async function run() {
    const answers = {
        projectName: 'regression-project',
        experience: 'advanced',
        cloudProvider: 'Google Cloud (Firebase)',
        aiProvider: 'claude'
    };

    // Case 1: Fresh config produced by setup helper
    const freshDir = await fs.mkdtemp(path.join(os.tmpdir(), 'guardian-config-fresh-'));
    const freshConfigDir = path.join(freshDir, '.guardian');
    await fs.ensureDir(freshConfigDir);

    const freshConfig = setup.createConfigFromAnswers(answers);
    await fs.writeJson(path.join(freshConfigDir, 'config.json'), freshConfig, { spaces: 2 });

    const normalizedFresh = await readConfig(freshDir);
    assert.ok(normalizedFresh, 'Fresh config should load');
    assert.strictEqual(normalizedFresh.experienceLevel, answers.experience, 'experienceLevel should match wizard answer');
    assert.strictEqual(normalizedFresh.preferredProvider, answers.aiProvider, 'preferredProvider should match wizard answer');
    assert.strictEqual(normalizedFresh.platform, answers.cloudProvider, 'platform should match wizard answer');

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
    assert.strictEqual(normalizedLegacy.platform, answers.cloudProvider, 'Legacy config should normalize platform');

    const engineFromLegacy = new GuardianEngine(legacyDir, normalizedLegacy);
    assert.strictEqual(engineFromLegacy.config.experienceLevel, answers.experience, 'GuardianEngine should normalize legacy experience');
    assert.strictEqual(engineFromLegacy.ai.config.preferredProvider, answers.aiProvider, 'GuardianEngine should normalize legacy preferred provider');

    await fs.remove(freshDir);
    await fs.remove(legacyDir);

    console.log('✅ GuardianEngine respects config from setup and legacy files');
}

run().catch(error => {
    console.error('❌ Guardian config regression failed');
    console.error(error);
    process.exit(1);
});
