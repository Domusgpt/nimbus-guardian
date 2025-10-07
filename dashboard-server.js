#!/usr/bin/env node

/**
 * Interactive Dashboard Server - Project Management Hub
 * A Paul Phillips Manifestation - Paul@clearseassolutions.com
 * "The Revolution Will Not be in a Structured Format" © 2025
 *
 * Web-based dashboard for managing projects, deployments, and cloud infrastructure
 */

const http = require('http');
const fs = require('fs-extra');
const path = require('path');
const { execSync } = require('child_process');
const crypto = require('crypto');
const GuardianEngine = require('./guardian-engine');
const ToolDetector = require('./tool-detector');
const AIAssistant = require('./ai-assistant');
const { loadConfig: loadGuardianConfig } = require('./lib/config-service');
const SessionManager = require('./lib/session-manager');

class HttpError extends Error {
    constructor(statusCode, message) {
        super(message);
        this.name = 'HttpError';
        this.statusCode = statusCode;
    }
}

const normalizeToolId = (value) => {
    return value
        ? value
            .toString()
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
        : null;
};

const normalizeOrigin = (origin) => {
    if (!origin) return origin;
    return origin.endsWith('/') ? origin.slice(0, -1) : origin;
};

const SAFE_TOOL_INSTALLERS = Object.freeze({
    'firebase-tools': {
        command: 'npm install -g firebase-tools',
        displayName: 'Firebase CLI',
        description: 'Installs the Firebase CLI globally using npm.',
        successMessage: 'Firebase CLI installed successfully.'
    },
    'vercel': {
        command: 'npm install -g vercel',
        displayName: 'Vercel CLI',
        description: 'Installs the Vercel CLI globally using npm.',
        successMessage: 'Vercel CLI installed successfully.'
    },
    'netlify-cli': {
        command: 'npm install -g netlify-cli',
        displayName: 'Netlify CLI',
        description: 'Installs the Netlify CLI globally using npm.',
        successMessage: 'Netlify CLI installed successfully.'
    },
    'supabase': {
        command: 'npm install -g supabase',
        displayName: 'Supabase CLI',
        description: 'Installs the Supabase CLI globally using npm.',
        successMessage: 'Supabase CLI installed successfully.'
    }
});

class DashboardServer {
    constructor(port = 3333) {
        this.port = port;
        this.projectPath = process.cwd();
        this.config = null;
        this.configWarnings = [];
        this.cache = {};
        this.sessionManager = new SessionManager();
        this.sessionCookieName = 'guardian_session';
        this.allowedOrigins = new Set([
            `http://localhost:${this.port}`,
            `http://127.0.0.1:${this.port}`,
            `http://[::1]:${this.port}`
        ].map(normalizeOrigin));
    }

    async start() {
        await this.loadConfig();

        const server = http.createServer(async (req, res) => {
            await this.handleRequest(req, res);
        });

        server.listen(this.port, () => {
            console.log(`\n🛡️  Guardian Dashboard running at http://localhost:${this.port}\n`);

            // Auto-open browser
            try {
                const command = process.platform === 'darwin' ? 'open' :
                               process.platform === 'win32' ? 'start' : 'xdg-open';
                execSync(`${command} http://localhost:${this.port}`, { stdio: 'ignore' });
            } catch {
                // Couldn't auto-open
            }
        });
    }

    async loadConfig() {
        this.config = await loadGuardianConfig(this.projectPath, { createIfMissing: true });
        this.configWarnings = Array.isArray(this.config?.__meta?.warnings)
            ? this.config.__meta.warnings.filter(Boolean)
            : [];
    }

    async handleRequest(req, res) {
        const url = new URL(req.url, `http://localhost:${this.port}`);

        // API routes
        if (url.pathname.startsWith('/api/')) {
            return await this.handleAPI(url, req, res);
        }

        // Serve dashboard HTML
        if (url.pathname === '/' || url.pathname === '/index.html') {
            return this.serveDashboard(req, res);
        }

        // 404
        res.writeHead(404);
        res.end('Not found');
    }

    applyApiSecurityHeaders(res) {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Referrer-Policy', 'same-origin');
        res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
        res.setHeader('Cache-Control', 'no-store');
    }

    generateNonce(size = 16) {
        return crypto.randomBytes(size).toString('base64');
    }

    applyHtmlSecurityHeaders(res, nonce) {
        const effectiveNonce = nonce || this.generateNonce();
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Referrer-Policy', 'same-origin');
        res.setHeader('X-Frame-Options', 'SAMEORIGIN');
        res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader(
            'Content-Security-Policy',
            [
                "default-src 'self'",
                `script-src 'self' 'nonce-${effectiveNonce}'`,
                "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
                "font-src 'self' https://fonts.gstatic.com",
                "img-src 'self' data:",
                "connect-src 'self'"
            ].join('; ')
        );
    }

    parseCookies(req) {
        const header = req.headers?.cookie;
        if (!header) {
            return {};
        }

        return header.split(';').reduce((acc, part) => {
            if (!part) {
                return acc;
            }

            const [name, ...valueParts] = part.trim().split('=');
            if (!name) {
                return acc;
            }

            const value = valueParts.join('=');
            acc[name] = value ? decodeURIComponent(value) : '';
            return acc;
        }, {});
    }

    getSessionIdFromRequest(req) {
        const cookies = this.parseCookies(req);
        return cookies[this.sessionCookieName];
    }

    setSessionCookie(res, sessionId) {
        if (!sessionId) {
            return;
        }

        const maxAgeSeconds = Math.max(1, Math.floor(this.sessionManager.ttlMs / 1000));
        const cookieValue = `${this.sessionCookieName}=${sessionId}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeconds}`;
        const existing = res.getHeader('Set-Cookie');

        if (existing) {
            const values = Array.isArray(existing) ? existing.slice() : [existing];
            values.push(cookieValue);
            res.setHeader('Set-Cookie', values);
        } else {
            res.setHeader('Set-Cookie', cookieValue);
        }
    }

    establishBrowserSession(req, res, options = {}) {
        const { rotateCsrf = false } = options;
        const existingId = this.getSessionIdFromRequest(req);
        let session = existingId
            ? this.sessionManager.touchSession(existingId, { rotateCsrf })
            : null;

        if (!session) {
            session = this.sessionManager.createSession();
            if (rotateCsrf) {
                session = this.sessionManager.touchSession(session.id, { rotateCsrf: true }) || session;
            }
        }

        this.setSessionCookie(res, session.id);
        return session;
    }

    getSessionForRequest(req, res) {
        const sessionId = this.getSessionIdFromRequest(req);
        if (!sessionId) {
            return null;
        }

        const session = this.sessionManager.touchSession(sessionId);
        if (session) {
            this.setSessionCookie(res, session.id);
        }

        return session;
    }

    async handleAPI(url, req, res) {
        this.applyApiSecurityHeaders(res);
        res.setHeader('Vary', 'Origin');

        const requestOrigin = normalizeOrigin(req.headers.origin);
        if (requestOrigin) {
            if (!this.allowedOrigins.has(requestOrigin)) {
                res.writeHead(403);
                res.end(JSON.stringify({ error: 'Origin not allowed' }));
                return;
            }
            res.setHeader('Access-Control-Allow-Origin', requestOrigin);
        } else {
            res.setHeader('Access-Control-Allow-Origin', `http://localhost:${this.port}`);
        }

        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-CSRF-Token, Accept');
        res.setHeader('Access-Control-Allow-Credentials', 'true');

        // Handle OPTIONS preflight
        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
        }

        const session = this.getSessionForRequest(req, res);
        if (!session) {
            res.writeHead(401);
            res.end(JSON.stringify({ error: 'Session expired. Reload the dashboard.' }));
            return;
        }

        res.setHeader('X-CSRF-Token', session.csrfToken);

        if (req.method !== 'GET') {
            const csrfHeader = req.headers['x-csrf-token'];
            if (!csrfHeader || csrfHeader !== session.csrfToken) {
                res.writeHead(403);
                res.end(JSON.stringify({ error: 'Invalid CSRF token' }));
                return;
            }
        }

        await this.loadConfig();

        try {
            // GET /api/status - Overall project status
            if (url.pathname === '/api/status' && req.method === 'GET') {
                const status = await this.getProjectStatus();
                res.writeHead(200);
                res.end(JSON.stringify(status));
                return;
            }

            // POST /api/scan - Run security scan
            if (url.pathname === '/api/scan' && req.method === 'POST') {
                const engine = new GuardianEngine(this.projectPath, this.config);
                const results = await engine.analyze({ aiExplanations: false });
                res.writeHead(200);
                res.end(JSON.stringify(results));
                return;
            }

            // GET /api/tools - Detect tools and missing dependencies
            if (url.pathname === '/api/tools' && req.method === 'GET') {
                const detector = new ToolDetector(this.projectPath);
                const tools = await detector.analyze();
                tools.missing = tools.missing.map(tool => {
                    const safeInstallerId = this.getSafeInstallerId(tool);
                    const installer = safeInstallerId ? SAFE_TOOL_INSTALLERS[safeInstallerId] : null;
                    return {
                        ...tool,
                        safeInstallerId,
                        installerLabel: installer?.displayName,
                        installerDescription: installer?.description
                    };
                });
                res.writeHead(200);
                res.end(JSON.stringify(tools));
                return;
            }

            // POST /api/fix - Auto-fix an issue
            if (url.pathname === '/api/fix' && req.method === 'POST') {
                const { issueId } = await this.parseJsonBody(req);
                if (!issueId || typeof issueId !== 'string') {
                    throw new HttpError(400, 'issueId is required');
                }
                const engine = new GuardianEngine(this.projectPath, this.config);
                const result = await engine.autoFix(issueId);
                res.writeHead(200);
                res.end(JSON.stringify(result));
                return;
            }

            // POST /api/chat - Chat with AI
            if (url.pathname === '/api/chat' && req.method === 'POST') {
                const { message } = await this.parseJsonBody(req);
                if (!message || typeof message !== 'string') {
                    throw new HttpError(400, 'message is required');
                }
                const ai = new AIAssistant({
                    claudeApiKey: this.config.claudeApiKey || process.env.CLAUDE_API_KEY,
                    geminiApiKey: this.config.geminiApiKey || process.env.GEMINI_API_KEY,
                    experienceLevel: this.config.experienceLevel
                });
                const response = await ai.ask(message);
                res.writeHead(200);
                res.end(JSON.stringify(response));
                return;
            }

            // GET /api/git-status - Git repository status
            if (url.pathname === '/api/git-status' && req.method === 'GET') {
                const gitStatus = await this.getGitStatus();
                res.writeHead(200);
                res.end(JSON.stringify(gitStatus));
                return;
            }

            // GET /api/deployments - Deployment history
            if (url.pathname === '/api/deployments' && req.method === 'GET') {
                const deployments = await this.getDeploymentHistory();
                res.writeHead(200);
                res.end(JSON.stringify(deployments));
                return;
            }

            // GET /api/github - GitHub repository info
            if (url.pathname === '/api/github' && req.method === 'GET') {
                const github = await this.getGitHubInfo();
                res.writeHead(200);
                res.end(JSON.stringify(github));
                return;
            }

            // POST /api/install-tool - Install missing tool
            if (url.pathname === '/api/install-tool' && req.method === 'POST') {
                const { toolId } = await this.parseJsonBody(req);
                if (!toolId || typeof toolId !== 'string') {
                    throw new HttpError(400, 'toolId is required');
                }
                const result = await this.installTool(toolId);
                res.writeHead(result.success ? 200 : 400);
                res.end(JSON.stringify(result));
                return;
            }

            res.writeHead(404);
            res.end(JSON.stringify({ error: 'API endpoint not found' }));

        } catch (error) {
            if (error instanceof HttpError || error.statusCode) {
                const statusCode = error.statusCode || 500;
                res.writeHead(statusCode);
                res.end(JSON.stringify({ error: error.message }));
                return;
            }

            console.error('API Error:', error);
            res.writeHead(500);
            res.end(JSON.stringify({ error: 'Internal server error' }));
        }
    }

    // Helper to read request body
    readRequestBody(req, maxBytes = 1024 * 1024) {
        return new Promise((resolve, reject) => {
            let body = '';
            let received = 0;

            req.on('data', chunk => {
                received += chunk.length;
                if (received > maxBytes) {
                    req.destroy();
                    reject(new HttpError(413, 'Payload too large'));
                    return;
                }
                body += chunk;
            });

            req.on('end', () => resolve(body));
            req.on('error', reject);
        });
    }

    async parseJsonBody(req, options = {}) {
        const body = await this.readRequestBody(req, options.maxBytes);
        if (!body) {
            return {};
        }

        try {
            return JSON.parse(body);
        } catch {
            throw new HttpError(400, 'Invalid JSON payload');
        }
    }

    async getProjectStatus() {
        const status = {
            projectName: this.config.projectName,
            path: this.projectPath,
            experienceLevel: this.config.experienceLevel,
            timestamp: new Date().toISOString(),
            configWarnings: [...this.configWarnings]
        };

        // Package.json info
        try {
            const pkg = await fs.readJson(path.join(this.projectPath, 'package.json'));
            status.package = {
                name: pkg.name,
                version: pkg.version,
                dependencies: Object.keys(pkg.dependencies || {}).length,
                devDependencies: Object.keys(pkg.devDependencies || {}).length
            };
        } catch {
            status.package = null;
        }

        // Git info
        try {
            const branch = execSync('git branch --show-current', {
                cwd: this.projectPath,
                encoding: 'utf-8'
            }).trim();

            const uncommitted = execSync('git status --porcelain', {
                cwd: this.projectPath,
                encoding: 'utf-8'
            }).split('\n').filter(Boolean).length;

            status.git = { branch, uncommitted };
        } catch {
            status.git = null;
        }

        return status;
    }

    async getGitStatus() {
        try {
            const branch = execSync('git branch --show-current', {
                cwd: this.projectPath,
                encoding: 'utf-8'
            }).trim();

            const status = execSync('git status --porcelain', {
                cwd: this.projectPath,
                encoding: 'utf-8'
            }).split('\n').filter(Boolean).map(line => ({
                status: line.substring(0, 2),
                file: line.substring(3)
            }));

            const commits = execSync('git log --oneline -10', {
                cwd: this.projectPath,
                encoding: 'utf-8'
            }).split('\n').filter(Boolean).map(line => {
                const [hash, ...message] = line.split(' ');
                return { hash, message: message.join(' ') };
            });

            return { branch, status, commits };
        } catch (error) {
            return { error: 'Not a git repository' };
        }
    }

    async getDeploymentHistory() {
        // Check for Firebase deployments
        const deployments = [];

        try {
            const firebase = execSync('firebase projects:list --json', {
                cwd: this.projectPath,
                encoding: 'utf-8',
                stdio: 'pipe'
            });
            const projects = JSON.parse(firebase);
            deployments.push({
                platform: 'firebase',
                projects: projects.results || []
            });
        } catch {
            // Firebase not configured or not installed
        }

        // Check for Vercel deployments
        try {
            const vercel = execSync('vercel list --json', {
                cwd: this.projectPath,
                encoding: 'utf-8',
                stdio: 'pipe'
            });
            deployments.push({
                platform: 'vercel',
                deployments: JSON.parse(vercel)
            });
        } catch {
            // Vercel not configured
        }

        return deployments;
    }

    async getGitHubInfo() {
        try {
            const remote = execSync('git remote get-url origin', {
                cwd: this.projectPath,
                encoding: 'utf-8'
            }).trim();

            // Parse GitHub URL
            const match = remote.match(/github\.com[:/](.+?)\/(.+?)(\.git)?$/);
            if (match) {
                const [, owner, repo] = match;

                // Try to get GitHub info via gh CLI
                try {
                    const info = execSync(`gh repo view ${owner}/${repo} --json name,description,url,isPrivate,stargazerCount`, {
                        encoding: 'utf-8'
                    });
                    return JSON.parse(info);
                } catch {
                    return {
                        owner,
                        repo: repo.replace('.git', ''),
                        url: `https://github.com/${owner}/${repo}`
                    };
                }
            }

            return { error: 'Not a GitHub repository' };
        } catch {
            return { error: 'No git remote configured' };
        }
    }

    async installTool(toolId) {
        const normalizedId = normalizeToolId(toolId);
        if (!normalizedId) {
            return { success: false, message: 'Invalid tool identifier.' };
        }

        const installer = SAFE_TOOL_INSTALLERS[normalizedId];
        if (!installer) {
            return { success: false, message: 'This tool must be installed manually.' };
        }

        try {
            execSync(installer.command, {
                cwd: this.projectPath,
                stdio: 'inherit',
                shell: true,
                timeout: 5 * 60 * 1000
            });

            return {
                success: true,
                message: installer.successMessage || `${installer.displayName || normalizedId} installed successfully.`
            };
        } catch (error) {
            const errorMessage = error.stderr?.toString().trim() || error.stdout?.toString().trim() || error.message;
            return {
                success: false,
                message: errorMessage || 'Installation failed.'
            };
        }
    }

    getSafeInstallerId(tool) {
        const candidates = [
            tool.safeInstallerId,
            tool.id,
            tool.cli,
            tool.name,
            tool.command
        ];

        for (const candidate of candidates) {
            const normalized = normalizeToolId(candidate);
            if (normalized && SAFE_TOOL_INSTALLERS[normalized]) {
                return normalized;
            }
        }

        return null;
    }

    async serveDashboard(req, res) {
        const session = this.establishBrowserSession(req, res, { rotateCsrf: true });
        const nonce = this.generateNonce();
        this.applyHtmlSecurityHeaders(res, nonce);
        res.writeHead(200);

        // Check if holographic dashboard exists
        const holographicPath = path.join(__dirname, 'dashboard-holographic.html');
        try {
            const holographicHTML = await fs.readFile(holographicPath, 'utf-8');
            res.end(this.injectSecurityContext(holographicHTML, nonce, session.csrfToken));
        } catch {
            // Fallback to built-in dashboard
            res.end(this.getDashboardHTML(nonce, session.csrfToken));
        }
    }

    injectSecurityContext(html, nonce, csrfToken) {
        return html
            .replace(/__CSRF_TOKEN__/g, csrfToken)
            .replace(/__CSP_NONCE__/g, nonce);
    }

    getDashboardHTML(nonce, csrfToken) {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="csrf-token" content="${csrfToken}">
    <title>Cloud Guardian Dashboard</title>
    <script nonce="${nonce}">
        window.__CSRF_TOKEN__ = '${csrfToken}';
        window.__CSP_NONCE__ = '${nonce}';
    </script>
    <style nonce="${nonce}">
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: #333;
            padding: 20px;
        }

        .container {
            max-width: 1400px;
            margin: 0 auto;
        }

        .header {
            background: white;
            border-radius: 12px;
            padding: 30px;
            margin-bottom: 20px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.1);
        }

        .header h1 {
            font-size: 32px;
            color: #667eea;
            margin-bottom: 10px;
        }

        .header p {
            color: #666;
            font-size: 16px;
        }

        .grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 20px;
            margin-bottom: 20px;
        }

        .card {
            background: white;
            border-radius: 12px;
            padding: 25px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.08);
            transition: transform 0.2s, box-shadow 0.2s;
        }

        .card:hover {
            transform: translateY(-5px);
            box-shadow: 0 8px 30px rgba(0,0,0,0.12);
        }

        .card h2 {
            font-size: 20px;
            margin-bottom: 15px;
            color: #333;
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .status-badge {
            display: inline-block;
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 600;
            margin-left: auto;
        }

        .status-good {
            background: #d4edda;
            color: #155724;
        }

        .status-warning {
            background: #fff3cd;
            color: #856404;
        }

        .status-error {
            background: #f8d7da;
            color: #721c24;
        }

        .loading {
            text-align: center;
            padding: 40px;
            color: #999;
        }

        .spinner {
            border: 3px solid #f3f3f3;
            border-top: 3px solid #667eea;
            border-radius: 50%;
            width: 40px;
            height: 40px;
            animation: spin 1s linear infinite;
            margin: 0 auto 20px;
        }

        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }

        .metric {
            display: flex;
            justify-content: space-between;
            padding: 10px 0;
            border-bottom: 1px solid #f0f0f0;
        }

        .metric:last-child {
            border-bottom: none;
        }

        .metric-label {
            color: #666;
            font-size: 14px;
        }

        .metric-value {
            font-weight: 600;
            color: #333;
            font-size: 14px;
        }

        .issue-list {
            list-style: none;
        }

        .issue-item {
            padding: 12px;
            margin-bottom: 8px;
            border-radius: 8px;
            background: #f8f9fa;
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .issue-icon {
            font-size: 20px;
        }

        .issue-text {
            flex: 1;
            font-size: 14px;
        }

        .issue-file {
            display: block;
            font-size: 12px;
            color: #666;
            margin-top: 4px;
            word-break: break-all;
        }

        .btn {
            background: #667eea;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
            transition: background 0.2s;
        }

        .btn:hover {
            background: #5568d3;
        }

        .btn-small {
            padding: 4px 12px;
            font-size: 12px;
        }

        .tool-list {
            list-style: none;
        }

        .tool-item {
            padding: 10px;
            margin-bottom: 8px;
            border-radius: 6px;
            background: #f8f9fa;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .tool-installed {
            color: #28a745;
            font-weight: 600;
        }

        .tool-install-warning {
            color: #c05621;
            font-weight: 600;
            font-size: 12px;
        }

        .tool-missing {
            color: #dc3545;
            font-weight: 600;
        }

        .chat-container {
            position: fixed;
            bottom: 30px;
            right: 30px;
            width: 400px;
            max-height: 600px;
            background: white;
            border-radius: 12px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.2);
            display: none;
            flex-direction: column;
        }

        .chat-container.open {
            display: flex;
        }

        .chat-header {
            padding: 20px;
            border-bottom: 1px solid #eee;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .chat-close-button {
            background: none;
            border: none;
            cursor: pointer;
            font-size: 20px;
            color: #333;
        }

        .chat-close-button:focus-visible {
            outline: 2px solid #667eea;
            outline-offset: 2px;
        }

        .chat-messages {
            flex: 1;
            overflow-y: auto;
            padding: 20px;
        }

        .chat-input-container {
            padding: 20px;
            border-top: 1px solid #eee;
        }

        .chat-input {
            width: 100%;
            padding: 12px;
            border: 1px solid #ddd;
            border-radius: 6px;
            font-size: 14px;
        }

        .chat-fab {
            position: fixed;
            bottom: 30px;
            right: 30px;
            width: 60px;
            height: 60px;
            border-radius: 50%;
            background: #667eea;
            color: white;
            border: none;
            font-size: 24px;
            cursor: pointer;
            box-shadow: 0 4px 20px rgba(0,0,0,0.2);
            transition: transform 0.2s;
        }

        .chat-fab:hover {
            transform: scale(1.1);
        }

        .message {
            margin-bottom: 15px;
            padding: 10px 15px;
            border-radius: 8px;
            max-width: 80%;
        }

        .message-user {
            background: #667eea;
            color: white;
            margin-left: auto;
        }

        .message-ai {
            background: #f0f0f0;
            color: #333;
        }

        .full-width-card {
            grid-column: 1 / -1;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🛡️ Cloud Guardian Dashboard</h1>
            <p id="project-name">Loading project information...</p>
        </div>

        <div class="grid">
            <!-- Project Status -->
            <div class="card">
                <h2>
                    📊 Project Status
                    <span id="status-badge" class="status-badge status-good">Loading...</span>
                </h2>
                <div id="project-metrics" class="loading">
                    <div class="spinner"></div>
                    <p>Loading...</p>
                </div>
            </div>

            <!-- Security Scan -->
            <div class="card">
                <h2>🛡️ Security Scan</h2>
                <div id="security-scan" class="loading">
                    <div class="spinner"></div>
                    <p>Scanning...</p>
                </div>
            </div>

            <!-- Git Status -->
            <div class="card">
                <h2>📁 Git Status</h2>
                <div id="git-status" class="loading">
                    <div class="spinner"></div>
                    <p>Loading...</p>
                </div>
            </div>

            <!-- Tools & Dependencies -->
            <div class="card full-width-card">
                <h2>🔧 Tools & Dependencies</h2>
                <div id="tools-list" class="loading">
                    <div class="spinner"></div>
                    <p>Detecting tools...</p>
                </div>
            </div>

            <!-- Issues & Recommendations -->
            <div class="card full-width-card">
                <h2>⚠️ Issues & Recommendations</h2>
                <ul id="issues-list" class="loading">
                    <div class="spinner"></div>
                    <p>Analyzing...</p>
                </ul>
            </div>
        </div>
    </div>

    <!-- AI Chat FAB -->
    <button class="chat-fab" type="button" data-action="toggle-chat">💬</button>

    <!-- AI Chat Container -->
    <div class="chat-container" id="chat-container">
        <div class="chat-header">
            <h3>🤖 AI Assistant</h3>
            <button type="button" class="chat-close-button" data-action="toggle-chat">✕</button>
        </div>
        <div class="chat-messages" id="chat-messages"></div>
        <div class="chat-input-container">
            <input
                type="text"
                class="chat-input"
                id="chat-input"
                placeholder="Ask me anything..."
            />
        </div>
    </div>

    <script nonce="${nonce}">
        const escapeHtml = (value) => {
            if (value === undefined || value === null) {
                return '';
            }

            return value
                .toString()
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        };

        const formatMultiline = (value) => escapeHtml(value).replace(/\n/g, '<br>');

        const getJsonHeaders = () => {
            const headers = { 'Content-Type': 'application/json' };
            if (window.__CSRF_TOKEN__) {
                headers['X-CSRF-Token'] = window.__CSRF_TOKEN__;
            }
            return headers;
        };

        function updateCsrfTokenFromResponse(response) {
            if (!response || typeof response.headers?.get !== 'function') {
                return;
            }

            const nextToken = response.headers.get('X-CSRF-Token');
            if (!nextToken || typeof nextToken !== 'string') {
                return;
            }

            const trimmed = nextToken.trim();
            if (!trimmed || trimmed === window.__CSRF_TOKEN__) {
                return;
            }

            window.__CSRF_TOKEN__ = trimmed;
            const meta = document.querySelector('meta[name="csrf-token"]');
            if (meta) {
                meta.setAttribute('content', trimmed);
            }
        }

        function wireStaticEventHandlers() {
            document.querySelectorAll('[data-action="toggle-chat"]').forEach(element => {
                if (element.__guardianBound) {
                    return;
                }
                element.__guardianBound = true;
                element.addEventListener('click', toggleChat);
            });

            const chatInput = document.getElementById('chat-input');
            if (chatInput && !chatInput.__guardianBound) {
                chatInput.__guardianBound = true;
                chatInput.addEventListener('keydown', (event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault();
                        handleChatKeypress(event);
                    }
                });
            }
        }

        function wireDynamicActions(root) {
            const scope = root || document;

            scope.querySelectorAll('[data-action="fix-issue"]').forEach(button => {
                if (button.__guardianBound) {
                    return;
                }
                button.__guardianBound = true;
                button.addEventListener('click', () => {
                    const issueId = button.dataset.issueId;
                    if (issueId) {
                        fixIssue(issueId);
                    }
                });
            });

            scope.querySelectorAll('[data-action="install-tool"]').forEach(button => {
                if (button.__guardianBound) {
                    return;
                }
                button.__guardianBound = true;
                button.addEventListener('click', () => {
                    const toolId = button.dataset.toolId || '';
                    const toolName = button.dataset.toolName || '';
                    installTool(toolId || null, toolName || null);
                });
            });
        }

        async function parseJsonResponse(response) {
            updateCsrfTokenFromResponse(response);

            const text = await response.text();
            let data = {};

            if (text) {
                try {
                    data = JSON.parse(text);
                } catch (error) {
                    throw new Error('Invalid server response.');
                }
            }

            if (!response.ok) {
                const message = data && (data.error || data.message)
                    ? (data.error || data.message)
                    : 'Request failed (' + response.status + ')';
                throw new Error(message);
            }

            return data;
        }

        async function loadDashboard() {
            await Promise.all([
                loadProjectStatus(),
                loadSecurityScan(),
                loadGitStatus(),
                loadTools()
            ]);
        }

        async function loadProjectStatus() {
            try {
                const res = await fetch('/api/status', {
                    credentials: 'same-origin'
                });
                const data = await parseJsonResponse(res);

                const name = data.projectName || 'Project';
                const projectPath = data.path ? ' • ' + data.path : '';
                document.getElementById('project-name').textContent = name + projectPath;

                const metrics = document.getElementById('project-metrics');
                metrics.className = '';

                const experienceMetric = '<div class="metric">' +
                    '<span class="metric-label">Experience Level</span>' +
                    '<span class="metric-value">' + escapeHtml(data.experienceLevel || 'intermediate') + '</span>' +
                '</div>';

                const sections = [experienceMetric];

                if (data.package) {
                    sections.push(
                        '<div class="metric">' +
                            '<span class="metric-label">Dependencies</span>' +
                            '<span class="metric-value">' + escapeHtml(data.package.dependencies ?? 0) + '</span>' +
                        '</div>' +
                        '<div class="metric">' +
                            '<span class="metric-label">Dev Dependencies</span>' +
                            '<span class="metric-value">' + escapeHtml(data.package.devDependencies ?? 0) + '</span>' +
                        '</div>'
                    );
                }

                if (data.git) {
                    const branchValue = escapeHtml(data.git.branch || 'unknown');
                    const uncommittedValue = escapeHtml(data.git.uncommitted ?? 0);
                    sections.push(
                        '<div class="metric">' +
                            '<span class="metric-label">Branch</span>' +
                            '<span class="metric-value">' + branchValue + '</span>' +
                        '</div>' +
                        '<div class="metric">' +
                            '<span class="metric-label">Uncommitted Changes</span>' +
                            '<span class="metric-value">' + uncommittedValue + '</span>' +
                        '</div>'
                    );
                }

                metrics.innerHTML = sections.join('');
            } catch (error) {
                console.error('Failed to load status:', error);
            }
        }

        async function loadSecurityScan() {
            try {
                const res = await fetch('/api/scan', {
                    method: 'POST',
                    headers: getJsonHeaders(),
                    credentials: 'same-origin'
                });
                const data = await parseJsonResponse(res);

                const critical = data.issues.filter(i => i.severity === 'CRITICAL').length;
                const high = data.issues.filter(i => i.severity === 'HIGH').length;
                const medium = data.issues.filter(i => i.severity === 'MEDIUM').length;

                const badge = document.getElementById('status-badge');
                if (critical > 0) {
                    badge.className = 'status-badge status-error';
                    badge.textContent = 'Critical Issues';
                } else if (high > 0) {
                    badge.className = 'status-badge status-warning';
                    badge.textContent = 'Issues Found';
                } else {
                    badge.className = 'status-badge status-good';
                    badge.textContent = 'Healthy';
                }

                const scan = document.getElementById('security-scan');
                scan.className = '';
                scan.innerHTML = \`
                    <div class="metric">
                        <span class="metric-label">🔴 Critical</span>
                        <span class="metric-value">\${critical}</span>
                    </div>
                    <div class="metric">
                        <span class="metric-label">🟠 High</span>
                        <span class="metric-value">\${high}</span>
                    </div>
                    <div class="metric">
                        <span class="metric-label">🟡 Medium</span>
                        <span class="metric-value">\${medium}</span>
                    </div>
                    <div class="metric">
                        <span class="metric-label">⚪ Warnings</span>
                        <span class="metric-value">\${data.warnings.length}</span>
                    </div>
                \`;

                // Show issues
                const issuesList = document.getElementById('issues-list');
                issuesList.className = 'issue-list';

                if (data.issues.length === 0) {
                    issuesList.innerHTML = '<div class="metric-label" style="text-align: center; padding: 20px;">✅ No issues found!</div>';
                } else {
                    const issuesHtml = data.issues.slice(0, 10).map(issue => {
                        const message = formatMultiline(issue.message || 'Issue detected');
                        const fileDetail = issue.file ? '<span class="issue-file">' + escapeHtml(issue.file) + '</span>' : '';
                        const fileMarkup = fileDetail ? ' ' + fileDetail : '';
                        const issueIdValue = issue.id === undefined || issue.id === null
                            ? ''
                            : issue.id.toString();
                        const fixButton = issue.autoFixable && issueIdValue
                            ? '<button class="btn btn-small" type="button" data-action="fix-issue" data-issue-id="' + escapeHtml(issueIdValue) + '">Fix</button>'
                            : '';

                        let row = '<li class="issue-item">' +
                            '<span class="issue-icon">' + getSeverityIcon(issue.severity) + '</span>' +
                            '<span class="issue-text">' + message + fileMarkup + '</span>';

                        if (fixButton) {
                            row += fixButton;
                        }

                        row += '</li>';
                        return row;
                    }).join('');

                    issuesList.innerHTML = issuesHtml;
                }

                wireDynamicActions(issuesList);
            } catch (error) {
                console.error('Failed to load scan:', error);
                const scan = document.getElementById('security-scan');
                scan.className = '';
                scan.innerHTML = '<div class="metric-label" style="color: #dc3545;">' + escapeHtml(error.message) + '</div>';
            }
        }

        async function loadGitStatus() {
            try {
                const res = await fetch('/api/git-status', {
                    credentials: 'same-origin'
                });
                const data = await parseJsonResponse(res);

                const gitStatus = document.getElementById('git-status');
                gitStatus.className = '';

                if (data.error) {
                    gitStatus.innerHTML = '<p class="metric-label">' + escapeHtml(data.error) + '</p>';
                    return;
                }

                const branch = escapeHtml(data.branch || 'unknown');
                const uncommitted = escapeHtml((data.status || []).length);
                const commits = escapeHtml((data.commits || []).length);

                gitStatus.innerHTML = '<div class="metric">' +
                    '<span class="metric-label">Current Branch</span>' +
                    '<span class="metric-value">' + branch + '</span>' +
                '</div>' +
                '<div class="metric">' +
                    '<span class="metric-label">Uncommitted Files</span>' +
                    '<span class="metric-value">' + uncommitted + '</span>' +
                '</div>' +
                '<div class="metric">' +
                    '<span class="metric-label">Recent Commits</span>' +
                    '<span class="metric-value">' + commits + '</span>' +
                '</div>';
            } catch (error) {
                console.error('Failed to load git status:', error);
            }
        }

        async function loadTools() {
            try {
                const res = await fetch('/api/tools', {
                    credentials: 'same-origin'
                });
                const data = await parseJsonResponse(res);

                const toolsList = document.getElementById('tools-list');
                toolsList.className = '';

                const detected = Array.isArray(data.detected) ? data.detected : [];
                const missingTools = Array.isArray(data.missing) ? data.missing : [];
                const recommendations = Array.isArray(data.recommendations) ? data.recommendations : [];

                const cloud = detected.filter(t => t.category === 'cloud');

                const cloudHtml = cloud.length > 0
                    ? cloud.map(t => {
                        return '<li class="tool-item">' +
                            '<span>' + escapeHtml(t.provider || 'Provider') + '</span>' +
                            '<span class="tool-installed">✓ Detected</span>' +
                        '</li>';
                    }).join('')
                    : '<li class="tool-item"><span>No cloud providers detected</span></li>';

                let missingHtml = '';
                if (missingTools.length > 0) {
                    missingHtml += '<h3 style="margin: 20px 0 15px;">Missing Tools</h3>';
                    missingHtml += '<ul class="tool-list">';
                    missingHtml += missingTools.map(t => {
                        const label = t.name || t.cli || t.command || t.provider || 'Tool';
                        const reason = t.reason ? escapeHtml(t.reason) : '';
                        const description = t.installerDescription ? ' — ' + escapeHtml(t.installerDescription) : '';
                        const docsUrl = typeof t.docs === 'string' && /^https?:\/\//i.test(t.docs) ? t.docs : null;
                        const docsLink = docsUrl
                            ? '<div style="font-size: 12px;"><a href="' + escapeHtml(docsUrl) + '" target="_blank" rel="noopener noreferrer">View docs</a></div>'
                            : '';

                        const safeInstallerId = typeof t.safeInstallerId === 'string' ? t.safeInstallerId : '';
                        const installButton = safeInstallerId
                            ? '<button class="btn btn-small" type="button" data-action="install-tool" data-tool-id="' + escapeHtml(safeInstallerId) + '" data-tool-name="' + escapeHtml(label) + '">Install</button>'
                            : '<span class="tool-install-warning">Manual install required</span>';

                        return '<li class="tool-item">' +
                            '<div>' +
                                '<div>' + escapeHtml(label) + '</div>' +
                                '<div style="font-size: 12px; color: #666;">' + reason + description + '</div>' +
                                docsLink +
                            '</div>' +
                            installButton +
                        '</li>';
                    }).join('');
                    missingHtml += '</ul>';
                }

                let recommendationsHtml = '';
                if (recommendations.length > 0) {
                    recommendationsHtml += '<h3 style="margin: 20px 0 15px;">Recommendations</h3>';
                    recommendationsHtml += '<ul class="tool-list">';
                    recommendationsHtml += recommendations.map(r => {
                        const category = escapeHtml(r.category || 'Recommendation');
                        const type = escapeHtml(r.type || 'Suggestion');
                        const reason = escapeHtml(r.reason || '');
                        return '<li class="tool-item">' +
                            '<div>' +
                                '<div>' + category + ': ' + type + '</div>' +
                                '<div style="font-size: 12px; color: #666;">' + reason + '</div>' +
                            '</div>' +
                        '</li>';
                    }).join('');
                    recommendationsHtml += '</ul>';
                }

                toolsList.innerHTML = '<h3 style="margin-bottom: 15px;">Detected Cloud Providers</h3>' +
                    '<ul class="tool-list">' +
                        cloudHtml +
                    '</ul>' +
                    missingHtml +
                    recommendationsHtml;

                wireDynamicActions(toolsList);
            } catch (error) {
                console.error('Failed to load tools:', error);
            }
        }

        function getSeverityIcon(severity) {
            const icons = {
                'CRITICAL': '🔴',
                'HIGH': '🟠',
                'MEDIUM': '🟡',
                'LOW': '⚪'
            };
            return icons[severity] || '⚪';
        }

        async function fixIssue(issueId) {
            try {
                const res = await fetch('/api/fix', {
                    method: 'POST',
                    headers: getJsonHeaders(),
                    body: JSON.stringify({ issueId }),
                    credentials: 'same-origin'
                });
                const result = await parseJsonResponse(res);
                alert(result.message || 'Issue fixed successfully.');
                loadSecurityScan(); // Refresh
            } catch (error) {
                alert('Failed to fix issue: ' + error.message);
            }
        }

        async function installTool(toolId, toolName) {
            if (!toolId) {
                alert('Manual installation required. Please follow the documentation for this tool.');
                return;
            }

            const nameLabel = toolName || 'tool';
            if (!confirm('Install ' + nameLabel + '?')) {
                return;
            }

            try {
                const res = await fetch('/api/install-tool', {
                    method: 'POST',
                    headers: getJsonHeaders(),
                    body: JSON.stringify({ toolId }),
                    credentials: 'same-origin'
                });
                const result = await parseJsonResponse(res);

                if (!result.success) {
                    throw new Error(result.message || 'Installation failed.');
                }

                alert(result.message || (nameLabel + ' installed successfully.'));
                loadTools(); // Refresh
            } catch (error) {
                alert('Failed to install ' + nameLabel + ': ' + error.message);
            }
        }

        function toggleChat() {
            const chat = document.getElementById('chat-container');
            const fab = document.querySelector('.chat-fab');
            chat.classList.toggle('open');
            fab.style.display = chat.classList.contains('open') ? 'none' : 'block';
        }

        function handleChatKeypress(event) {
            if (event.key === 'Enter' && !event.shiftKey) {
                sendChatMessage();
            }
        }

        async function sendChatMessage() {
            const input = document.getElementById('chat-input');
            const message = input.value.trim();
            if (!message) return;

            const messagesDiv = document.getElementById('chat-messages');

            // Add user message
            messagesDiv.innerHTML += '<div class="message message-user">' + formatMultiline(message) + '</div>';
            input.value = '';
            messagesDiv.scrollTop = messagesDiv.scrollHeight;

            try {
                const res = await fetch('/api/chat', {
                    method: 'POST',
                    headers: getJsonHeaders(),
                    body: JSON.stringify({ message }),
                    credentials: 'same-origin'
                });
                const data = await parseJsonResponse(res);

                // Add AI response
                const responseText = data && data.response ? formatMultiline(data.response) : 'No response available.';
                messagesDiv.innerHTML += '<div class="message message-ai">' + responseText + '</div>';
                messagesDiv.scrollTop = messagesDiv.scrollHeight;
            } catch (error) {
                messagesDiv.innerHTML += '<div class="message message-ai">Sorry, I encountered an error: ' + escapeHtml(error.message) + '</div>';
            }
        }

        wireStaticEventHandlers();

        // Load dashboard on page load
        loadDashboard();

        // Auto-refresh every 30 seconds
        setInterval(loadDashboard, 30000);
    </script>
</body>
</html>`;
    }
}

// CLI execution
if (require.main === module) {
    const port = process.argv[2] || 3333;
    const server = new DashboardServer(port);
    server.start().catch(console.error);
}

module.exports = DashboardServer;