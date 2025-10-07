const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');
const fs = require('fs-extra');

const {
    loadConfig,
    saveConfig,
    getConfigPaths
} = require('../lib/config-service');

async function createTempProject(t) {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'guardian-config-'));
    t.after(async () => {
        await fs.remove(dir);
    });
    return dir;
}

test('loadConfig creates default config when missing', async (t) => {
    const projectDir = await createTempProject(t);
    const config = await loadConfig(projectDir, { createIfMissing: true });

    assert.equal(config.experienceLevel, 'intermediate');
    assert.ok(config.projectName);

    const { configPath } = getConfigPaths(projectDir);
    const persisted = await fs.readJson(configPath);
    assert.equal(persisted.experienceLevel, 'intermediate');
    assert.equal(persisted.projectName, config.projectName);
});

test('saveConfig strips secrets and normalizes experience', async (t) => {
    const projectDir = await createTempProject(t);
    await saveConfig(projectDir, {
        experienceLevel: 'ADVANCED',
        claudeApiKey: 'secret-1',
        geminiApiKey: 'secret-2'
    });

    const { configPath } = getConfigPaths(projectDir);
    const persisted = await fs.readJson(configPath);
    assert.equal(persisted.experienceLevel, 'advanced');
    assert.ok(!Object.prototype.hasOwnProperty.call(persisted, 'claudeApiKey'));
    assert.ok(!Object.prototype.hasOwnProperty.call(persisted, 'geminiApiKey'));
});

test('loadConfig hydrates API keys from .env and exposes metadata', async (t) => {
    const projectDir = await createTempProject(t);
    const { configDir, envPath } = getConfigPaths(projectDir);
    await fs.ensureDir(configDir);
    await fs.writeFile(envPath, 'CLAUDE_API_KEY=abc\nGEMINI_API_KEY=def\n');

    const config = await loadConfig(projectDir, { createIfMissing: true });

    assert.equal(config.claudeApiKey, 'abc');
    assert.equal(config.geminiApiKey, 'def');
    assert.ok(config.__meta);
    assert.deepEqual(config.__meta.warnings, []);
});

test('loadConfig recovers from corrupted JSON and informs caller', async (t) => {
    const projectDir = await createTempProject(t);
    const { configDir, configPath } = getConfigPaths(projectDir);
    await fs.ensureDir(configDir);
    await fs.writeFile(configPath, '{invalid-json');

    const config = await loadConfig(projectDir, { createIfMissing: true });

    assert.equal(config.experienceLevel, 'intermediate');
    assert.ok(config.__meta);
    assert.equal(config.__meta.warnings.length, 1);
    assert.match(config.__meta.warnings[0], /Recovered from corrupted/);

    const backups = await fs.readdir(configDir);
    const backupFile = backups.find((name) => name.startsWith('config.json.corrupted-'));
    assert.ok(backupFile, 'should create corrupted backup file');
});

test('loadConfig migrates legacy experience property', async (t) => {
    const projectDir = await createTempProject(t);
    const { configDir, configPath } = getConfigPaths(projectDir);
    await fs.ensureDir(configDir);
    await fs.writeJson(configPath, { experience: 'beginner' });

    const config = await loadConfig(projectDir);

    assert.equal(config.experienceLevel, 'beginner');
    const persisted = await fs.readJson(configPath);
    assert.equal(persisted.experienceLevel, 'beginner');
    assert.ok(!Object.prototype.hasOwnProperty.call(persisted, 'experience'));
});
