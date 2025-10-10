'use strict';

const fetch = require('node-fetch');

class ObservabilityStatusClient {
    constructor(options = {}) {
        const {
            url = 'http://localhost:3333/api/observability',
            headers = {},
            fetchImpl = fetch,
            timeoutMs = 5000,
            logger = console
        } = options;

        if (typeof url !== 'string' || url.trim().length === 0) {
            throw new Error('ObservabilityStatusClient requires a url option');
        }

        this.url = url;
        this.baseHeaders = { ...headers };
        this.fetchImpl = typeof fetchImpl === 'function' ? fetchImpl : fetch;
        this.timeoutMs = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 5000;
        this.logger = logger || console;
    }

    async fetchStatus(options = {}) {
        const { cookie = null, headers = {} } = options;

        const requestHeaders = {
            Accept: 'application/json',
            ...this.baseHeaders,
            ...headers
        };

        const normalizedCookie = this._normalizeCookie(
            cookie
            ?? headers.Cookie
            ?? headers.cookie
            ?? this.baseHeaders.Cookie
            ?? this.baseHeaders.cookie
            ?? null
        );
        if (normalizedCookie) {
            requestHeaders.Cookie = normalizedCookie;
            if (Object.prototype.hasOwnProperty.call(requestHeaders, 'cookie')) {
                delete requestHeaders.cookie;
            }
        }

        let response;
        try {
            response = await this.fetchImpl(this.url, {
                method: 'GET',
                headers: requestHeaders,
                timeout: this.timeoutMs
            });
        } catch (error) {
            this.logger?.warn?.('Observability status request failed', error);
            throw new Error(`Observability status request failed: ${error?.message || 'Unknown error'}`);
        }

        if (!response || !response.ok) {
            const status = response?.status ?? 'unknown';
            const statusText = response?.statusText ?? 'Request failed';
            let detail = '';
            try {
                const text = await response.text();
                if (text) {
                    detail = ` Response body: ${text}`;
                }
            } catch {
                // ignore body read failures
            }
            throw new Error(`Observability status responded with ${status} (${statusText}).${detail}`.trim());
        }

        if (response.status === 204) {
            return null;
        }

        try {
            return await response.json();
        } catch (error) {
            throw new Error(`Observability status response was not valid JSON: ${error?.message || 'Unknown error'}`);
        }
    }

    _normalizeCookie(value) {
        if (typeof value !== 'string') {
            return '';
        }

        const trimmed = value.trim();
        if (trimmed.length === 0) {
            return '';
        }

        if (trimmed.includes('=')) {
            return trimmed;
        }

        return `guardian_session=${trimmed}`;
    }
}

module.exports = ObservabilityStatusClient;
