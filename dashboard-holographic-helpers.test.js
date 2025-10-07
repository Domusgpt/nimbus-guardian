import { describe, it, expect } from 'vitest';
import {
  titleCase,
  slugify,
  pluralize,
  isLikelyShellCommand,
  resolveInstallCommand,
  resolveDocsLink,
  parseDateLike,
  formatRelativeTime,
  getSeverityCounts,
  getSecurityBadge,
  computeSecureScore,
  gitStatusSeverity
} from './dashboard-holographic-helpers.js';

describe('dashboard holographic helpers', () => {
  it('titleCase normalizes mixed separators', () => {
    expect(titleCase('guardian_dashboard-upgrade')).toBe('Guardian Dashboard Upgrade');
  });

  it('slugify converts values into kebab case', () => {
    expect(slugify('Hello, World!')).toBe('hello-world');
  });

  it('pluralize returns expected singular and plural forms', () => {
    expect(pluralize(1, 'card')).toBe('card');
    expect(pluralize(2, 'card')).toBe('cards');
  });

  it('detects common shell commands', () => {
    expect(isLikelyShellCommand('npm install vitest')).toBe(true);
    expect(isLikelyShellCommand('   ')).toBe(false);
    expect(isLikelyShellCommand('open dashboard')).toBe(false);
  });

  it('resolves install commands from multiple sources', () => {
    expect(resolveInstallCommand({ install: 'npm i abc' })).toBe('npm i abc');
    expect(resolveInstallCommand({ install: 'please install abc' })).toBeNull();
    expect(resolveInstallCommand({ command: 'brew install foo' })).toBe('brew install foo');
  });

  it('returns documentation links when available', () => {
    expect(resolveDocsLink({ docs: 'https://example.com' })).toBe('https://example.com');
    expect(resolveDocsLink({ documentation: 'https://docs.example.com' })).toBe('https://docs.example.com');
    expect(resolveDocsLink({ cliRequired: { docs: 'https://cli.example.com' } })).toBe('https://cli.example.com');
    expect(resolveDocsLink({})).toBeNull();
  });

  it('parses date-like values', () => {
    const now = new Date();
    expect(parseDateLike(now)).toEqual(now);
    expect(parseDateLike(now.toISOString())).toEqual(now);
    const numeric = Date.now();
    expect(parseDateLike(numeric)).toEqual(new Date(numeric));
    expect(parseDateLike(null)).toBeNull();
    expect(parseDateLike('not-a-date')).toBeNull();
  });

  it('formats relative time with injected baseline', () => {
    const now = Date.UTC(2024, 0, 1, 0, 0, 0);
    expect(formatRelativeTime(Date.UTC(2023, 0, 1, 0, 0, 0), now)).toBe('12 months ago');
    expect(formatRelativeTime(Date.UTC(2024, 0, 1, 0, 0, 30), now)).toBe('30 seconds from now');
    expect(formatRelativeTime('invalid', now)).toBeNull();
  });

  it('counts severities across issues', () => {
    const counts = getSeverityCounts([
      { severity: 'critical' },
      { severity: 'HIGH' },
      { severity: 'medium' },
      { severity: 'low' },
      { severity: 'info' }
    ]);
    expect(counts).toEqual({ CRITICAL: 1, HIGH: 1, MEDIUM: 1, LOW: 1 });
  });

  it('selects badge variants based on severity mix', () => {
    expect(getSecurityBadge({ CRITICAL: 1, HIGH: 0, MEDIUM: 0, LOW: 0 }, 0)).toEqual({ text: '1 critical', variant: 'status-error' });
    expect(getSecurityBadge({ CRITICAL: 0, HIGH: 2, MEDIUM: 0, LOW: 0 }, 0)).toEqual({ text: '2 high', variant: 'status-warning' });
    expect(getSecurityBadge({ CRITICAL: 0, HIGH: 0, MEDIUM: 1, LOW: 0 }, 0)).toEqual({ text: 'Attention', variant: 'status-warning' });
    expect(getSecurityBadge({ CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 }, 1)).toEqual({ text: 'Attention', variant: 'status-warning' });
    expect(getSecurityBadge({ CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 }, 0)).toEqual({ text: 'Secure', variant: 'status-good' });
  });

  it('computes secure score with penalties', () => {
    const counts = { CRITICAL: 1, HIGH: 1, MEDIUM: 1, LOW: 0 };
    expect(computeSecureScore(counts, 2)).toBe(100 - (35 + 20 + 10 + 10));
    expect(computeSecureScore({ CRITICAL: 5, HIGH: 5, MEDIUM: 5, LOW: 0 }, 0)).toBe(0);
  });

  it('maps git status codes to severities', () => {
    expect(gitStatusSeverity(' M ')).toBe('MEDIUM');
    expect(gitStatusSeverity('??')).toBe('LOW');
    expect(gitStatusSeverity('UD')).toBe('HIGH');
    expect(gitStatusSeverity('')).toBe('INFO');
  });
});
