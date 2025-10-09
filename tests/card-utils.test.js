import { describe, it, expect } from 'vitest';
import {
  titleCase,
  isLikelyShellCommand,
  resolveInstallCommand,
  resolveDocsLink,
  formatToolLabel,
  formatRelativeTimeValue,
  appendTimelineItem
} from '../public/js/holographic/cards/card-utils.js';

describe('card utils', () => {
  it('titleCase converts separators', () => {
    expect(titleCase('guardian-dashboard')).toBe('Guardian Dashboard');
    expect(titleCase('already Proper')).toBe('Already Proper');
  });

  it('identifies likely shell commands', () => {
    expect(isLikelyShellCommand(' npm install ')).toBe(true);
    expect(isLikelyShellCommand('curl -sSf https://example.com')).toBe(true);
    expect(isLikelyShellCommand('open index.html')).toBe(false);
    expect(isLikelyShellCommand('')).toBe(false);
  });

  it('resolves install command candidates', () => {
    const tool = {
      install: 'echo nope',
      cliRequired: { install: 'npm install -g guardian' }
    };

    expect(resolveInstallCommand(tool)).toBe('npm install -g guardian');
    expect(resolveInstallCommand({ command: 'brew install guardian' })).toBe('brew install guardian');
    expect(resolveInstallCommand(null)).toBeNull();
  });

  it('resolves documentation links', () => {
    expect(resolveDocsLink({ docs: 'https://docs.guardian.dev' })).toBe('https://docs.guardian.dev');
    expect(resolveDocsLink({ cliRequired: { docs: 'https://cli.guardian.dev' } })).toBe('https://cli.guardian.dev');
    expect(resolveDocsLink(null)).toBeNull();
  });

  it('formats tool labels with category context', () => {
    expect(formatToolLabel({ name: 'guardian-ai' })).toBe('Guardian Ai');
    expect(formatToolLabel({ provider: 'firebase', category: 'hosting' })).toBe('Firebase (Hosting)');
    expect(formatToolLabel({ command: 'npm', category: 'npm' })).toBe('Npm');
    expect(formatToolLabel()).toBe('Tool');
  });

  it('formats relative time values using injected now', () => {
    const base = new Date('2024-05-15T12:00:00Z');
    const now = () => base.getTime() + 2 * 60 * 60 * 1000; // +2 hours
    expect(formatRelativeTimeValue(base, { now })).toBe('2 hours ago');
    expect(formatRelativeTimeValue('2024-05-15T13:59:00Z', { now })).toBe('1 minute ago');
    expect(formatRelativeTimeValue('invalid', { now })).toBeNull();
    expect(formatRelativeTimeValue(null, { now })).toBeNull();
  });

  it('appends timeline items with optional links and meta', () => {
    const list = document.createElement('ul');
    const added = appendTimelineItem(list, 'Deployment', '2 mins ago', 'https://deploy');
    expect(added).toBe(true);
    expect(list.children).toHaveLength(1);
    const item = list.firstElementChild;
    expect(item.querySelector('a').href).toContain('https://deploy');
    expect(item.querySelector('.timeline-meta').textContent).toBe('2 mins ago');
  });
});
