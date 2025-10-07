const fs = require('fs-extra');
const path = require('path');

const isWindows = process.platform === 'win32';

function shouldUpdateMode(currentMode, desiredMode) {
    if (isWindows) {
        return false;
    }

    const current = currentMode & 0o777;
    const desired = desiredMode & 0o777;

    return current !== desired;
}

async function ensureSecureDir(dirPath) {
    await fs.ensureDir(dirPath, { mode: 0o700 });

    if (isWindows) {
        return;
    }

    try {
        const stats = await fs.stat(dirPath);
        if (shouldUpdateMode(stats.mode, 0o700)) {
            await fs.chmod(dirPath, 0o700);
        }
    } catch (error) {
        // Ignore environments that do not support chmod
    }
}

function ensureSecureDirSync(dirPath) {
    fs.ensureDirSync(dirPath, { mode: 0o700 });

    if (isWindows) {
        return;
    }

    try {
        const stats = fs.statSync(dirPath);
        if (shouldUpdateMode(stats.mode, 0o700)) {
            fs.chmodSync(dirPath, 0o700);
        }
    } catch (error) {
        // Ignore environments that do not support chmod
    }
}

async function ensureSecureFile(filePath, options = {}) {
    if (isWindows) {
        return;
    }

    const mode = options.mode ?? 0o600;

    try {
        const stats = await fs.stat(filePath);
        if (shouldUpdateMode(stats.mode, mode)) {
            await fs.chmod(filePath, mode);
        }
    } catch (error) {
        // Ignore missing files or unsupported permission changes
    }
}

function ensureSecureFileSync(filePath, options = {}) {
    if (isWindows) {
        return;
    }

    const mode = options.mode ?? 0o600;

    try {
        const stats = fs.statSync(filePath);
        if (shouldUpdateMode(stats.mode, mode)) {
            fs.chmodSync(filePath, mode);
        }
    } catch (error) {
        // Ignore missing files or unsupported permission changes
    }
}

async function writeSecureFile(filePath, data, options = {}) {
    const { mode = 0o600, encoding = 'utf8' } = options;

    await ensureSecureDir(path.dirname(filePath));
    await fs.writeFile(filePath, data, { encoding });
    await ensureSecureFile(filePath, { mode });
}

function writeSecureFileSync(filePath, data, options = {}) {
    const { mode = 0o600, encoding = 'utf8' } = options;

    ensureSecureDirSync(path.dirname(filePath));
    fs.writeFileSync(filePath, data, { encoding });
    ensureSecureFileSync(filePath, { mode });
}

async function writeSecureJson(filePath, value, options = {}) {
    const { spaces = 2, mode = 0o600 } = options;
    const json = JSON.stringify(value, null, spaces);
    await writeSecureFile(filePath, json + '\n', { mode });
}

function writeSecureJsonSync(filePath, value, options = {}) {
    const { spaces = 2, mode = 0o600 } = options;
    const json = JSON.stringify(value, null, spaces);
    writeSecureFileSync(filePath, json + '\n', { mode });
}

module.exports = {
    ensureSecureDir,
    ensureSecureDirSync,
    ensureSecureFile,
    ensureSecureFileSync,
    writeSecureFile,
    writeSecureFileSync,
    writeSecureJson,
    writeSecureJsonSync
};
