'use strict';

const http = require('node:http');
const https = require('node:https');
const { URL } = require('node:url');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class ObservabilityWebhookSink {
    constructor(options = {}) {
        const {
            url,
            method = 'POST',
            headers = {},
            timeoutMs = 5000,
            maxRetries = 2,
            logger = console,
            request = null,
            now = () => Date.now(),
            backoffMs = 250,
            batchMaxItems = 1,
            batchMaxWaitMs = 0,
            batchMaxBytes = 0
        } = options;

        if (typeof url !== 'string' || url.trim().length === 0) {
            throw new Error('ObservabilityWebhookSink requires a url option');
        }

        this.url = new URL(url);
        this.method = typeof method === 'string' && method.trim().length > 0
            ? method.trim().toUpperCase()
            : 'POST';
        this.headers = this._normalizeHeaders(headers);
        this.timeoutMs = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 5000;
        this.maxRetries = Number.isInteger(maxRetries) && maxRetries >= 0 ? maxRetries : 2;
        this.backoffMs = Number.isFinite(backoffMs) && backoffMs >= 0 ? backoffMs : 250;
        this.logger = logger || console;
        this.requestImpl = typeof request === 'function' ? request : this._defaultRequest;
        this.now = typeof now === 'function' ? now : () => Date.now();

        this.batchMaxItems = Number.isInteger(batchMaxItems) && batchMaxItems > 0 ? batchMaxItems : 1;
        this.batchMaxWaitMs = Number.isFinite(batchMaxWaitMs) && batchMaxWaitMs >= 0 ? batchMaxWaitMs : 0;
        this.batchMaxBytes = Number.isFinite(batchMaxBytes) && batchMaxBytes > 0 ? batchMaxBytes : 0;

        this.queue = [];
        this.queueBytes = 0;
        this.flushTimer = null;
        this.flushPromise = null;

        this.metrics = {
            deliveredEntries: 0,
            deliveredBatches: 0,
            failedEntries: 0,
            failedBatches: 0,
            lastSuccessAt: null,
            lastFailureAt: null,
            lastStatusCode: null,
            lastErrorMessage: null
        };
    }

    async deliver(snapshot = {}) {
        const payload = this._decoratePayload(snapshot);
        return this._enqueue(payload);
    }

    async flush() {
        if (this.queue.length === 0) {
            return this.flushPromise ?? null;
        }
        return this._flushQueue();
    }

    _decoratePayload(snapshot) {
        const sentAt = this._timestamp();
        if (!snapshot || typeof snapshot !== 'object') {
            return { sentAt };
        }

        if (snapshot.sentAt) {
            return { ...snapshot };
        }

        return { ...snapshot, sentAt };
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
            // ignore timestamp errors
        }

        return new Date().toISOString();
    }

    _normalizeHeaders(headers) {
        if (!headers || typeof headers !== 'object') {
            return {};
        }

        return Object.entries(headers).reduce((acc, [key, value]) => {
            if (!key || typeof key !== 'string') {
                return acc;
            }

            const trimmedKey = key.trim();
            if (!trimmedKey) {
                return acc;
            }

            if (typeof value === 'undefined' || value === null) {
                return acc;
            }

            acc[trimmedKey.toLowerCase()] = String(value);
            return acc;
        }, {});
    }

    _isSuccess(statusCode) {
        return Number.isInteger(statusCode) && statusCode >= 200 && statusCode < 300;
    }

    _shouldRetry(statusCode) {
        if (!Number.isInteger(statusCode)) {
            return true;
        }
        return statusCode === 408 || (statusCode >= 500 && statusCode < 600);
    }

    _enqueue(payload) {
        const entry = this._createQueueEntry(payload);

        if (this.batchMaxItems === 1 && this.batchMaxWaitMs === 0 && this.batchMaxBytes === 0) {
            this.queueBytes = 0;
            const sendPromise = this._sendEntries([entry]);
            sendPromise.catch(() => {});
            return entry.promise;
        }

        this.queue.push(entry);
        this.queueBytes += entry.size;

        if (this.queue.length >= this.batchMaxItems) {
            this._flushQueue().catch(() => {});
        } else if (this.batchMaxBytes > 0 && this.queueBytes >= this.batchMaxBytes) {
            this._flushQueue().catch(() => {});
        } else {
            this._ensureFlushTimer();
        }

        return entry.promise;
    }

    _createQueueEntry(payload) {
        const serialized = JSON.stringify(payload);
        let resolve;
        let reject;
        const promise = new Promise((res, rej) => {
            resolve = res;
            reject = rej;
        });

        return {
            payload,
            promise,
            resolve,
            reject,
            size: Buffer.byteLength(serialized, 'utf8')
        };
    }

    _ensureFlushTimer() {
        if (this.batchMaxWaitMs <= 0 || this.flushTimer) {
            return;
        }

        this.flushTimer = setTimeout(() => {
            this.flushTimer = null;
            this._flushQueue().catch(() => {});
        }, this.batchMaxWaitMs);
        this.flushTimer.unref?.();
    }

    _flushQueue() {
        if (this.queue.length === 0) {
            return this.flushPromise ?? Promise.resolve();
        }

        if (this.flushTimer) {
            clearTimeout(this.flushTimer);
            this.flushTimer = null;
        }

        if (this.flushPromise) {
            return this.flushPromise;
        }

        const entries = this.queue;
        this.queue = [];
        this.queueBytes = 0;

        this.flushPromise = this._sendEntries(entries)
            .finally(() => {
                this.flushPromise = null;
                if (this.queue.length > 0) {
                    this._flushQueue();
                }
            });

        return this.flushPromise;
    }

    async _sendEntries(entries) {
        if (!Array.isArray(entries) || entries.length === 0) {
            return null;
        }

        const isBatch = entries.length > 1;
        const bodyPayload = isBatch
            ? {
                type: 'fingerprints-batch',
                sentAt: this._timestamp(),
                count: entries.length,
                entries: entries.map((entry) => entry.payload)
            }
            : entries[0].payload;

        const body = JSON.stringify(bodyPayload);
        const headers = {
            'content-type': 'application/json',
            'accept': 'application/json',
            'content-length': Buffer.byteLength(body, 'utf8'),
            ...this.headers
        };

        let attempt = 0;
        let lastError = null;

        while (attempt <= this.maxRetries) {
            try {
                const response = await this.requestImpl({
                    url: this.url,
                    method: this.method,
                    headers,
                    timeoutMs: this.timeoutMs,
                    body
                });

                if (this._isSuccess(response?.statusCode)) {
                    for (const entry of entries) {
                        entry.resolve?.(response);
                    }
                    this._recordSuccess(entries.length, response?.statusCode ?? null);
                    return response;
                }

                if (!this._shouldRetry(response?.statusCode)) {
                    const error = new Error(`Observability webhook responded with status ${response?.statusCode ?? 'unknown'}`);
                    error.response = response;
                    this._recordFailure(entries.length, response?.statusCode ?? null, error);
                    throw error;
                }

                lastError = new Error(`Observability webhook retryable status ${response.statusCode}`);
            } catch (error) {
                lastError = error;
            }

            attempt += 1;
            if (attempt > this.maxRetries) {
                break;
            }

            const delay = this.backoffMs * attempt;
            try {
                await sleep(delay);
            } catch {
                // ignore sleep interruptions
            }
        }

        const failure = lastError || new Error('Observability webhook delivery failed');

        for (const entry of entries) {
            entry.reject?.(failure);
        }

        this.logger?.warn?.('Observability webhook delivery failed', failure);
        if (!failure?.__observabilityRecorded) {
            this._recordFailure(entries.length, failure?.response?.statusCode ?? null, failure);
        }
        throw failure;
    }

    _defaultRequest(options) {
        const { url, method, headers, timeoutMs, body } = options;
        const requestOptions = {
            method,
            headers,
            protocol: url.protocol,
            hostname: url.hostname,
            port: url.port || (url.protocol === 'https:' ? 443 : 80),
            path: `${url.pathname}${url.search}`
        };

        const transport = url.protocol === 'https:' ? https : http;

        return new Promise((resolve, reject) => {
            const req = transport.request(requestOptions, (res) => {
                const chunks = [];
                res.on('data', (chunk) => chunks.push(chunk));
                res.on('end', () => {
                    resolve({
                        statusCode: res.statusCode,
                        headers: res.headers,
                        body: Buffer.concat(chunks).toString('utf8')
                    });
                });
            });

            req.on('error', reject);

            if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
                req.setTimeout(timeoutMs, () => {
                    req.destroy(new Error('Request timed out'));
                });
            }

            if (body) {
                req.write(body);
            }

            req.end();
        });
    }

    getTelemetry() {
        return {
            endpoint: {
                protocol: this.url.protocol,
                hostname: this.url.hostname,
                port: this.url.port ? Number(this.url.port) : null,
                pathname: this.url.pathname,
                hasAuth: Boolean(this.url.username || this.url.password)
            },
            method: this.method,
            batching: {
                maxItems: this.batchMaxItems,
                maxWaitMs: this.batchMaxWaitMs,
                maxBytes: this.batchMaxBytes
            },
            queue: {
                pendingEntries: this.queue.length,
                pendingBytes: this.queueBytes,
                flushInFlight: Boolean(this.flushPromise)
            },
            delivery: { ...this.metrics }
        };
    }

    _recordSuccess(entryCount, statusCode) {
        this.metrics.deliveredEntries += entryCount;
        this.metrics.deliveredBatches += 1;
        this.metrics.lastSuccessAt = this._timestamp();
        this.metrics.lastStatusCode = statusCode ?? null;
        this.metrics.lastErrorMessage = null;
    }

    _recordFailure(entryCount, statusCode, error) {
        this.metrics.failedEntries += entryCount;
        this.metrics.failedBatches += 1;
        this.metrics.lastFailureAt = this._timestamp();
        this.metrics.lastStatusCode = statusCode ?? null;
        this.metrics.lastErrorMessage = error?.message ?? null;
        if (error && typeof error === 'object') {
            error.__observabilityRecorded = true;
        }
    }
}

module.exports = ObservabilityWebhookSink;
