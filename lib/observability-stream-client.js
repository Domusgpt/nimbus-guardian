'use strict';

const { TextDecoder } = require('node:util');
const fetch = require('node-fetch');

const { normalizeCookie } = require('./observability-http-utils');

const decoder = new TextDecoder('utf8');

class ObservabilityStreamClient {
    constructor(options = {}) {
        const {
            url = 'http://localhost:3333/api/observability/stream',
            headers = {},
            fetchImpl = fetch,
            logger = console
        } = options;

        this.url = url;
        this.baseHeaders = { ...headers };
        this.fetchImpl = typeof fetchImpl === 'function' ? fetchImpl : fetch;
        this.logger = logger;
        this.abortController = null;
        this.currentBody = null;
    }

    async start(options = {}) {
        if (this.abortController) {
            throw new Error('Stream already active');
        }

        const {
            cookie,
            onConnect,
            onData,
            onHeartbeat,
            onComment
        } = options;

        this.abortController = new AbortController();
        const controller = this.abortController;

        const headers = {
            Accept: 'text/event-stream',
            ...this.baseHeaders
        };

        if (cookie) {
            headers.Cookie = normalizeCookie(cookie);
        }

        let response;
        try {
            response = await this.fetchImpl(this.url, {
                headers,
                signal: controller.signal
            });
        } catch (error) {
            this.abortController = null;
            throw error;
        }

        if (!response || !response.ok) {
            this.abortController = null;
            const status = response?.status ?? 'unknown';
            const statusText = response?.statusText ?? 'Stream request failed';
            throw new Error(`Observability stream request failed (${status}): ${statusText}`);
        }

        onConnect?.(response);

        this.currentBody = response.body;

        try {
            await this._consumeStream(response.body, {
                onData,
                onHeartbeat,
                onComment,
                signal: controller.signal
            });
        } finally {
            this.currentBody = null;
            this.abortController = null;
        }
    }

    stop() {
        if (this.abortController && !this.abortController.signal.aborted) {
            this.abortController.abort();
        }

        if (this.currentBody) {
            try {
                this.currentBody.destroy();
            } catch {
                // Ignore cleanup errors.
            }
        }
    }

    async _consumeStream(stream, handlers) {
        return new Promise((resolve, reject) => {
            let buffer = '';
            let ended = false;

            const cleanup = () => {
                if (ended) {
                    return;
                }
                ended = true;
                stream.off('data', handleChunk);
                stream.off('error', handleError);
                stream.off('end', handleEnd);
                stream.off('close', handleEnd);
                handlers.signal?.removeEventListener?.('abort', handleAbort);
            };

            const handleAbort = () => {
                cleanup();
                resolve();
            };

            const handleError = (error) => {
                cleanup();
                reject(error);
            };

            const handleEnd = () => {
                if (buffer.trim().length > 0) {
                    this._handleFrame(buffer, handlers);
                    buffer = '';
                }
                cleanup();
                resolve();
            };

            const handleChunk = (chunk) => {
                buffer += typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true });
                processBuffer();
            };

            const processBuffer = () => {
                let separatorIndex;
                while ((separatorIndex = buffer.indexOf('\n\n')) !== -1) {
                    const frame = buffer.slice(0, separatorIndex);
                    buffer = buffer.slice(separatorIndex + 2);
                    if (frame.trim().length === 0) {
                        continue;
                    }
                    this._handleFrame(frame, handlers);
                }
            };

            stream.on('data', handleChunk);
            stream.on('error', handleError);
            stream.on('end', handleEnd);
            stream.on('close', handleEnd);

            if (handlers.signal) {
                if (handlers.signal.aborted) {
                    handleAbort();
                    return;
                }
                handlers.signal.addEventListener('abort', handleAbort, { once: true });
            }
        });
    }

    _handleFrame(frame, handlers) {
        const lines = frame.split(/\r?\n/);
        const dataLines = [];

        for (const rawLine of lines) {
            if (!rawLine) {
                continue;
            }

            if (rawLine.startsWith(':')) {
                handlers.onHeartbeat?.(rawLine.slice(1).trim());
                handlers.onComment?.(rawLine.slice(1).trim());
                continue;
            }

            if (rawLine.startsWith('data:')) {
                dataLines.push(rawLine.slice(5).trimStart());
            }
        }

        if (dataLines.length === 0) {
            return;
        }

        const payload = dataLines.join('\n');
        if (!payload) {
            return;
        }

        try {
            const parsed = JSON.parse(payload);
            handlers.onData?.(parsed);
        } catch (error) {
            this.logger?.warn?.('Failed to parse observability payload', error);
        }
    }
}

module.exports = ObservabilityStreamClient;
