import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createToast } from '../public/js/shared/notifications.js';
import {
  setLoadingState,
  clearLoadingState,
  setBadge,
  createMetaUpdater
} from '../public/js/holographic/ui.js';

let originalRequestAnimationFrame;

beforeEach(() => {
  document.body.innerHTML = '<div id="toast-stack"></div>';
  vi.useFakeTimers();
  if (typeof window !== 'undefined') {
    originalRequestAnimationFrame = window.requestAnimationFrame;
    window.requestAnimationFrame = cb => setTimeout(cb, 0);
  }
});

afterEach(() => {
  vi.useRealTimers();
  if (typeof window !== 'undefined') {
    window.requestAnimationFrame = originalRequestAnimationFrame;
  }
  document.body.innerHTML = '';
});

describe('shared toast notifications', () => {
  it('renders toast into stack and dismisses on click', async () => {
    const stack = document.getElementById('toast-stack');
    const showToast = createToast();

    showToast('Hello', 'success', 2500);
    await vi.advanceTimersByTimeAsync(0);

    const toast = stack.querySelector('.toast');
    expect(toast).not.toBeNull();
    expect(toast.className).toContain('toast-success');

    toast.click();
    await vi.runAllTimersAsync();
    expect(stack.children.length).toBe(0);
  });

  it('falls back to alert when stack missing', () => {
    const alertSpy = vi.fn();
    const showToast = createToast({ alert: alertSpy, documentRef: document });
    document.getElementById('toast-stack').remove();

    showToast('Fallback message');
    expect(alertSpy).toHaveBeenCalledWith('Fallback message');
  });
});

describe('ui helpers', () => {
  it('toggles loading overlays', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);

    setLoadingState(container, 'Loading test');
    const overlay = container.querySelector('.loading-overlay');
    expect(container.classList.contains('is-loading')).toBe(true);
    expect(overlay).not.toBeNull();
    expect(overlay.getAttribute('hidden')).toBeNull();

    clearLoadingState(container);
    expect(container.classList.contains('is-loading')).toBe(false);
    expect(overlay.getAttribute('hidden')).toBe('');
    container.remove();
  });

  it('updates badges and metadata consistently', () => {
    const badge = document.createElement('span');
    const meta = document.createElement('div');
    badge.id = 'badge';
    meta.id = 'meta';
    document.body.append(badge, meta);

    const setUpdatedMeta = createMetaUpdater({
      parseDateLike: value => new Date(value),
      formatRelativeTime: () => 'moments ago'
    });

    setBadge(badge, 'Pending', 'status-warning', { source: 'live' });
    expect(badge.className).toContain('status-warning');
    expect(badge.dataset.source).toBe('live');

    setUpdatedMeta('meta', {
      timestamp: new Date('2024-01-01T00:00:00Z'),
      fromCache: false,
      offline: false,
      expired: false
    });

    expect(meta.textContent).toContain('moments ago');
    expect(meta.dataset.source).toBe('live');
    expect(meta.dataset.state).toBeUndefined();
    badge.remove();
    meta.remove();
  });
});
