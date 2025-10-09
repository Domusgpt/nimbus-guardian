import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import {
  createGuardianScanFixture,
  expectGuardianIssueContract
} from './fixtures/dashboard-contracts.js';

const require = createRequire(import.meta.url);
const DashboardServer = require('../dashboard-server.js');
const GuardianEngine = require('../guardian-engine.js');
const ToolDetector = require('../tool-detector.js');
const AIAssistant = require('../ai-assistant.js');

function expectIsoTimestamp(value) {
  expect(typeof value).toBe('string');
  expect(Number.isNaN(Date.parse(value))).toBe(false);
}

describe('DashboardServer API contracts', () => {
  let server;
  let invokeAPI;

  beforeEach(() => {
    server = new DashboardServer();
    server.projectPath = process.cwd();
    server.config = { projectName: 'Demo Project', experienceLevel: 'expert' };
    invokeAPI = createApiInvoker(server);

    vi.spyOn(GuardianEngine.prototype, 'analyze').mockResolvedValue({
      issues: [],
      warnings: [],
      summary: 'All clear'
    });

    vi.spyOn(GuardianEngine.prototype, 'autoFix').mockResolvedValue({
      success: true,
      message: 'Issue resolved'
    });

    vi.spyOn(ToolDetector.prototype, 'analyze').mockResolvedValue({
      detected: [{ name: 'firebase', version: '13.0.0' }],
      missing: [],
      recommendations: []
    });

    vi.spyOn(AIAssistant.prototype, 'ask').mockResolvedValue({
      provider: 'claude',
      response: 'Hello from Claude',
      model: 'claude-3-opus'
    });

    server.installTool = vi.fn(async () => ({
      success: true,
      message: 'Tool installed successfully',
      generatedAt: new Date().toISOString()
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns project status with generatedAt metadata', async () => {
    const status = await server.getProjectStatus();
    expect(status.projectName).toBe('Demo Project');
    expect(status.timestamp).toBe(status.generatedAt);
    expectIsoTimestamp(status.generatedAt);
  });

  it('returns git, deployment, and GitHub payloads with timestamps', async () => {
    const git = await server.getGitStatus();
    expectIsoTimestamp(git.generatedAt);

    const deployments = await server.getDeploymentHistory();
    deployments.forEach(entry => expectIsoTimestamp(entry.generatedAt));

    const github = await server.getGitHubInfo();
    expectIsoTimestamp(github.generatedAt);
  });

  it('stamps generatedAt onto API handler responses', async () => {
    const tools = await invokeAPI('/api/tools');
    expect(tools.statusCode).toBe(200);
    expectIsoTimestamp(tools.json.generatedAt);

    const scan = await invokeAPI('/api/scan', { method: 'POST' });
    expect(scan.statusCode).toBe(200);
    expectIsoTimestamp(scan.json.generatedAt);

    const fix = await invokeAPI('/api/fix', {
      method: 'POST',
      body: JSON.stringify({ issueId: 'demo-issue' })
    });
    expect(fix.statusCode).toBe(200);
    expectIsoTimestamp(fix.json.generatedAt);

    const chat = await invokeAPI('/api/chat', {
      method: 'POST',
      body: JSON.stringify({ message: 'Hello' })
    });
    expect(chat.statusCode).toBe(200);
    expectIsoTimestamp(chat.json.generatedAt);

    const install = await invokeAPI('/api/install-tool', {
      method: 'POST',
      body: JSON.stringify({ tool: 'firebase', command: 'npm install -g firebase-tools' })
    });
    expect(install.statusCode).toBe(200);
    expectIsoTimestamp(install.json.generatedAt);
  });

  it('preserves Guardian engine issue metadata in scan responses', async () => {
    const scanFixture = createGuardianScanFixture();
    GuardianEngine.prototype.analyze.mockResolvedValueOnce(scanFixture);

    const scan = await invokeAPI('/api/scan', { method: 'POST' });
    expect(scan.statusCode).toBe(200);
    expectIsoTimestamp(scan.json.generatedAt);
    expect(scan.json.summary).toBe(scanFixture.summary);
    expect(scan.json.fixes).toEqual(scanFixture.fixes);
    expect(scan.json.insights).toEqual(scanFixture.insights);
    expect(scan.json.issues).toEqual(scanFixture.issues);
    expect(scan.json.warnings).toEqual(scanFixture.warnings);

    scan.json.issues.forEach(issue => expectGuardianIssueContract(issue));
    scan.json.warnings.forEach(issue => expectGuardianIssueContract(issue));
  });
});

function createApiInvoker(server) {
  return async (path, { method = 'GET', body } = {}) => {
    const req = new EventEmitter();
    req.method = method;
    req.headers = {};
    const resHeaders = {};
    let statusCode;
    let payload = '';
    const res = {
      setHeader: (name, value) => {
        resHeaders[name] = value;
      },
      writeHead: code => {
        statusCode = code;
      },
      end: () => {}
    };

    const completion = new Promise(resolve => {
      res.end = chunk => {
        if (chunk) {
          payload = chunk;
        }
        resolve();
      };
    });

    const url = new URL(path, 'http://localhost:3333');
    const normalizedBody = typeof body === 'string' ? body : body ? JSON.stringify(body) : null;

    process.nextTick(() => {
      if (normalizedBody) {
        req.emit('data', Buffer.from(normalizedBody));
      }
      req.emit('end');
    });

    await server.handleAPI(url, req, res);
    await completion;

    return {
      statusCode,
      json: payload ? JSON.parse(payload) : null,
      headers: resHeaders
    };
  };
}
