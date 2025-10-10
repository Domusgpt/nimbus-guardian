'use strict';

const fs = require('node:fs');
const path = require('node:path');

const fsp = fs.promises;

class ObservabilityLogSink {
    constructor(options = {}) {
        const {
            filePath,
            maxBytes = 1024 * 1024,
            maxFiles = 5,
            fileMode = 0o600,
            now = () => Date.now(),
            logger = console
        } = options;

        if (typeof filePath !== 'string' || filePath.trim().length === 0) {
            throw new Error('ObservabilityLogSink requires a filePath option');
        }

        this.filePath = path.resolve(filePath.trim());
        this.directory = path.dirname(this.filePath);
        this.maxBytes = Number.isFinite(maxBytes) && maxBytes > 0 ? maxBytes : null;
        this.maxFiles = Number.isInteger(maxFiles) && maxFiles > 0 ? maxFiles : 1;
        this.fileMode = fileMode;
        this.now = typeof now === 'function' ? now : () => Date.now();
        this.logger = logger || console;
        this._ensureDirPromise = null;
    }

    async writeSnapshot(snapshot = {}) {
        const entry = this._decorateSnapshot(snapshot);
        const payload = `${JSON.stringify(entry)}\n`;

        try {
            await this._ensureDirectory();
            await this._rotateIfNeeded(Buffer.byteLength(payload, 'utf8'));
            await fsp.appendFile(this.filePath, payload, { encoding: 'utf8', mode: this.fileMode });
        } catch (error) {
            this.logger?.warn?.('Failed to persist observability snapshot', error);
            throw error;
        }
    }

    getTelemetry() {
        return {
            filePath: this.filePath,
            directory: this.directory,
            maxBytes: this.maxBytes,
            maxFiles: this.maxFiles
        };
    }

    _decorateSnapshot(snapshot) {
        const receivedAt = this._timestamp();
        if (!snapshot || typeof snapshot !== 'object') {
            return { receivedAt };
        }

        if (snapshot.receivedAt) {
            return { ...snapshot };
        }

        return { ...snapshot, receivedAt };
    }

    _timestamp() {
        try {
            const value = this.now();
            if (value instanceof Date) {
                return value.toISOString();
            }
            if (typeof value === 'number') {
                return new Date(value).toISOString();
            }
            if (typeof value === 'string') {
                return value;
            }
        } catch {
            // fall through to default timestamp
        }

        return new Date().toISOString();
    }

    async _ensureDirectory() {
        if (this._ensureDirPromise) {
            return this._ensureDirPromise;
        }

        this._ensureDirPromise = (async () => {
            await fsp.mkdir(this.directory, { recursive: true, mode: 0o700 });
        })();

        try {
            await this._ensureDirPromise;
        } catch (error) {
            this._ensureDirPromise = null;
            throw error;
        }
    }

    async _rotateIfNeeded(incomingBytes) {
        if (!this.maxBytes) {
            return;
        }

        let stats;
        try {
            stats = await fsp.stat(this.filePath);
        } catch (error) {
            if (error && error.code === 'ENOENT') {
                return;
            }
            throw error;
        }

        if (!stats || stats.size + incomingBytes <= this.maxBytes) {
            return;
        }

        const limit = Math.max(1, this.maxFiles);
        const pruneTarget = `${this.filePath}.${limit}`;
        await fsp.rm(pruneTarget, { force: true }).catch(() => {});

        for (let index = limit - 1; index >= 1; index -= 1) {
            const source = `${this.filePath}.${index}`;
            const destination = `${this.filePath}.${index + 1}`;
            try {
                await fsp.rename(source, destination);
            } catch (error) {
                if (!error || error.code !== 'ENOENT') {
                    throw error;
                }
            }
        }

        try {
            await fsp.rename(this.filePath, `${this.filePath}.1`);
        } catch (error) {
            if (!error || error.code !== 'ENOENT') {
                throw error;
            }
        }
    }
}

module.exports = ObservabilityLogSink;
