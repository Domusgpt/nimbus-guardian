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
            backoffMs = 250
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
    }

    async deliver(snapshot = {}) {
        const payload = this._decoratePayload(snapshot);
        const body = JSON.stringify(payload);
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
                    return response;
                }

                if (!this._shouldRetry(response?.statusCode)) {
                    const error = new Error(`Observability webhook responded with status ${response?.statusCode ?? 'unknown'}`);
                    error.response = response;
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

        this.logger?.warn?.('Observability webhook delivery failed', lastError);
        throw lastError || new Error('Observability webhook delivery failed');
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
}

module.exports = ObservabilityWebhookSink;
