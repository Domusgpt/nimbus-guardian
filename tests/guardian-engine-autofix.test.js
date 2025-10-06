const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs-extra');
const os = require('os');
const path = require('path');

const GuardianEngine = require('../guardian-engine');

const TMP_PREFIX = 'guardian-engine-autofix-';

async function createTempProject() {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), TMP_PREFIX));
    await fs.writeFile(path.join(tmpDir, '.gitignore'), 'node_modules/\n');
    return tmpDir;
}

test('autoFix performs a scan when issues have not been analyzed', async (t) => {
    const projectDir = await createTempProject();
    t.after(async () => {
        await fs.remove(projectDir);
    });

    const engine = new GuardianEngine(projectDir, { experienceLevel: 'beginner' });
    const result = await engine.autoFix('gitignore-missing');

    assert.equal(result.success, true, 'expected gitignore auto-fix to succeed');

    const gitignore = await fs.readFile(path.join(projectDir, '.gitignore'), 'utf8');
    assert.ok(gitignore.includes('.env'), 'expected .env pattern to be added to .gitignore');
});
