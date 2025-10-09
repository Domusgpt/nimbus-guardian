import { describe, it, expect } from 'vitest';
import {
  getSeverityCounts,
  getSecurityBadge,
  computeSecureScore,
  severityToClass,
  severityIcon,
  gitStatusSeverity,
  createProgressBar,
  createInfoItem
} from '../public/js/holographic/cards/security-utils.js';

describe('security utils', () => {
  it('counts severities safely', () => {
    const counts = getSeverityCounts([
      { severity: 'critical' },
      { severity: 'HIGH' },
      { severity: 'medium' },
      { severity: 'low' },
      { severity: 'ignored' }
    ]);
    expect(counts).toEqual({ CRITICAL: 1, HIGH: 1, MEDIUM: 1, LOW: 1 });
  });

  it('derives security badges by severity', () => {
    expect(getSecurityBadge({ CRITICAL: 1, HIGH: 0, MEDIUM: 0, LOW: 0 }, 0)).toEqual({ text: '1 critical', variant: 'status-error' });
    expect(getSecurityBadge({ CRITICAL: 0, HIGH: 2, MEDIUM: 0, LOW: 0 }, 0)).toEqual({ text: '2 high', variant: 'status-warning' });
    expect(getSecurityBadge({ CRITICAL: 0, HIGH: 0, MEDIUM: 1, LOW: 0 }, 1)).toEqual({ text: 'Attention', variant: 'status-warning' });
    expect(getSecurityBadge({ CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 }, 0)).toEqual({ text: 'Secure', variant: 'status-good' });
  });

  it('computes secure score with penalties', () => {
    const counts = { CRITICAL: 1, HIGH: 1, MEDIUM: 1, LOW: 0 };
    expect(computeSecureScore(counts, 1)).toBe(100 - 35 - 20 - 10 - 5);
    expect(computeSecureScore({ CRITICAL: 5, HIGH: 5, MEDIUM: 5, LOW: 5 }, 0)).toBeGreaterThanOrEqual(0);
  });

  it('maps severities to classes and icons', () => {
    expect(severityToClass('critical')).toBe('critical');
    expect(severityToClass('unknown')).toBe('info');
    expect(severityIcon('success')).toBe('🟢');
    expect(severityIcon('mystery')).toBe('⚪');
  });

  it('derives git status severity heuristics', () => {
    expect(gitStatusSeverity('??')).toBe('LOW');
    expect(gitStatusSeverity(' M ')).toBe('MEDIUM');
    expect(gitStatusSeverity(' U ')).toBe('HIGH');
    expect(gitStatusSeverity('')).toBe('INFO');
  });

  it('creates progress bar DOM nodes', () => {
    const bar = createProgressBar(72);
    expect(bar.className).toBe('progress-bar');
    const fill = bar.querySelector('.progress-fill');
    expect(fill.style.width).toBe('72%');
    expect(bar.textContent).toContain('% Secure');
  });

  it('creates info list items with defaults', () => {
    const item = createInfoItem('', 'Scan Complete', '2 mins ago', 'success');
    expect(item.className).toContain('success');
    expect(item.querySelector('.issue-details').textContent).toBe('2 mins ago');
    const fallback = createInfoItem(null, 'No Icon');
    expect(fallback.querySelector('.issue-icon').textContent).toBe('⚪');
  });
});
