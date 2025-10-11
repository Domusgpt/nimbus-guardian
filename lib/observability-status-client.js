'use strict';

const fetch = require('node-fetch');

class ObservabilityStatusClient {
    constructor(options = {}) {
        const {
            url = 'http://localhost:3333/api/observability',
            headers = {},
            fetchImpl = fetch,
            timeoutMs = 5000,
            logger = console,
            historyUrl = null
        } = options;

        if (typeof url !== 'string' || url.trim().length === 0) {
            throw new Error('ObservabilityStatusClient requires a url option');
        }

        this.url = url;
        this.baseHeaders = { ...headers };
        this.fetchImpl = typeof fetchImpl === 'function' ? fetchImpl : fetch;
        this.timeoutMs = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 5000;
        this.logger = logger || console;
        this.historyUrl = this._resolveHistoryUrl(historyUrl);
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

    async fetchHistory(options = {}) {
        if (!this.historyUrl) {
            throw new Error('Observability history URL is not configured');
        }

        const { cookie = null, headers = {}, limit = null } = options;

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

        let requestUrl;
        try {
            const parsed = new URL(this.historyUrl);
            if (Number.isFinite(limit) && limit > 0) {
                parsed.searchParams.set('limit', String(Math.floor(limit)));
            }
            requestUrl = parsed.toString();
        } catch {
            requestUrl = this.historyUrl;
            if (Number.isFinite(limit) && limit > 0) {
                const separator = requestUrl.includes('?') ? '&' : '?';
                requestUrl = `${requestUrl}${separator}limit=${Math.floor(limit)}`;
            }
        }

        let response;
        try {
            response = await this.fetchImpl(requestUrl, {
                method: 'GET',
                headers: requestHeaders,
                timeout: this.timeoutMs
            });
        } catch (error) {
            this.logger?.warn?.('Observability history request failed', error);
            throw new Error(`Observability history request failed: ${error?.message || 'Unknown error'}`);
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
            throw new Error(`Observability history responded with ${status} (${statusText}).${detail}`.trim());
        }

        if (response.status === 204) {
            return [];
        }

        let body;
        try {
            body = await response.json();
        } catch (error) {
            throw new Error(`Observability history response was not valid JSON: ${error?.message || 'Unknown error'}`);
        }

        if (Array.isArray(body)) {
            return { history: body, overview: null };
        }

        if (body && Array.isArray(body.history)) {
            const overview = body.overview && typeof body.overview === 'object'
                ? body.overview
                : null;
            return { history: body.history, overview };
        }

        throw new Error('Observability history response did not contain an array');
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

    _resolveHistoryUrl(historyUrl) {
        if (typeof historyUrl === 'string' && historyUrl.trim().length > 0) {
            return historyUrl.trim();
        }

        try {
            const base = new URL(this.url);
            const normalizedPath = base.pathname.endsWith('/')
                ? base.pathname.slice(0, -1)
                : base.pathname;
            base.pathname = `${normalizedPath}/history`;
            base.search = '';
            base.hash = '';
            return base.toString();
        } catch {
            if (typeof this.url === 'string' && this.url.trim().length > 0) {
                const normalized = this.url.replace(/\/+$/, '');
                return `${normalized}/history`;
            }
        }

        return null;
    }
}

module.exports = ObservabilityStatusClient;
