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
            historyUrl = null,
            incidentsUrl = null
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
        this.incidentsUrl = this._resolveIncidentsUrl(incidentsUrl);
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

    async fetchIncidents(options = {}) {
        if (!this.incidentsUrl) {
            throw new Error('Observability incidents URL is not configured');
        }

        const {
            cookie = null,
            headers = {},
            limit = null,
            statuses = null,
            status = null,
            sinks = null,
            sink = null,
            open = null
        } = options;

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

        const normalizedLimit = Number.isFinite(limit) && limit > 0
            ? Math.floor(limit)
            : null;

        const statusFilters = this._normalizeListOption(statuses ?? status);
        const sinkFilters = this._normalizeListOption(sinks ?? sink);
        const openFilter = this._normalizeBooleanOption(open);

        let requestUrl;
        try {
            const parsed = new URL(this.incidentsUrl);
            if (normalizedLimit !== null) {
                parsed.searchParams.set('limit', String(normalizedLimit));
            }
            for (const value of statusFilters) {
                parsed.searchParams.append('status', value);
            }
            for (const value of sinkFilters) {
                parsed.searchParams.append('sink', value);
            }
            if (openFilter !== null) {
                parsed.searchParams.set('open', openFilter ? 'true' : 'false');
            }
            requestUrl = parsed.toString();
        } catch {
            const params = [];
            if (normalizedLimit !== null) {
                params.push(`limit=${encodeURIComponent(String(normalizedLimit))}`);
            }
            for (const value of statusFilters) {
                params.push(`status=${encodeURIComponent(value)}`);
            }
            for (const value of sinkFilters) {
                params.push(`sink=${encodeURIComponent(value)}`);
            }
            if (openFilter !== null) {
                params.push(`open=${openFilter ? 'true' : 'false'}`);
            }

            const query = params.join('&');
            if (query) {
                const separator = this.incidentsUrl.includes('?') ? '&' : '?';
                requestUrl = `${this.incidentsUrl}${separator}${query}`;
            } else {
                requestUrl = this.incidentsUrl;
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
            this.logger?.warn?.('Observability incidents request failed', error);
            throw new Error(`Observability incidents request failed: ${error?.message || 'Unknown error'}`);
        }

        if (!response || !response.ok) {
            const statusCode = response?.status ?? 'unknown';
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
            throw new Error(`Observability incidents responded with ${statusCode} (${statusText}).${detail}`.trim());
        }

        if (response.status === 204) {
            return {
                generatedAt: null,
                total: 0,
                filters: {
                    statuses: statusFilters,
                    sinks: sinkFilters,
                    open: openFilter,
                    limit: normalizedLimit
                },
                matched: {
                    total: 0,
                    open: 0,
                    closed: 0
                },
                records: []
            };
        }

        try {
            return await response.json();
        } catch (error) {
            throw new Error(`Observability incidents response was not valid JSON: ${error?.message || 'Unknown error'}`);
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

    _resolveIncidentsUrl(incidentsUrl) {
        if (typeof incidentsUrl === 'string' && incidentsUrl.trim().length > 0) {
            return incidentsUrl.trim();
        }

        try {
            const base = new URL(this.url);
            const normalizedPath = base.pathname.endsWith('/')
                ? base.pathname.slice(0, -1)
                : base.pathname;
            base.pathname = `${normalizedPath}/incidents`;
            base.search = '';
            base.hash = '';
            return base.toString();
        } catch {
            if (typeof this.url === 'string' && this.url.trim().length > 0) {
                const normalized = this.url.replace(/\/+$/, '');
                return `${normalized}/incidents`;
            }
        }

        return null;
    }

    _normalizeListOption(value) {
        if (value === null || value === undefined) {
            return [];
        }

        const list = Array.isArray(value) ? value : [value];
        const normalized = [];

        for (const entry of list) {
            if (typeof entry !== 'string') {
                continue;
            }

            const parts = entry.split(',');
            for (const part of parts) {
                const trimmed = part.trim();
                if (trimmed.length > 0) {
                    normalized.push(trimmed);
                }
            }
        }

        return [...new Set(normalized)];
    }

    _normalizeBooleanOption(value) {
        if (value === null || value === undefined) {
            return null;
        }

        if (typeof value === 'boolean') {
            return value;
        }

        if (typeof value === 'number') {
            return value !== 0;
        }

        if (typeof value === 'string') {
            const normalized = value.trim().toLowerCase();
            if (!normalized) {
                return null;
            }

            if (['true', '1', 'yes', 'open', 'only-open'].includes(normalized)) {
                return true;
            }

            if (['false', '0', 'no', 'closed', 'only-closed'].includes(normalized)) {
                return false;
            }
        }

        return null;
    }
}

module.exports = ObservabilityStatusClient;
