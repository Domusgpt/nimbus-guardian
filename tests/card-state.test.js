import { describe, expect, it, vi } from 'vitest';
import { deriveCardState, renderCardFallback } from '../public/js/holographic/card-state.js';

describe('deriveCardState', () => {
  it('returns live state by default', () => {
    expect(deriveCardState()).toEqual({ source: 'live', state: '' });
  });

  it('prioritizes offline state over other flags', () => {
    expect(deriveCardState({ offline: true, fromCache: true, expired: true })).toEqual({
      source: 'offline',
      state: 'offline'
    });
  });

  it('marks cache and stale states correctly', () => {
    expect(deriveCardState({ fromCache: true, expired: true })).toEqual({
      source: 'cache',
      state: 'stale'
    });
  });
});

describe('renderCardFallback', () => {
  it('renders offline messaging and sets loaded flags', () => {
    const container = document.createElement('div');
    const badge = document.createElement('span');
    const setBadge = vi.fn();
    const setUpdatedMeta = vi.fn();

    renderCardFallback(container, {
      offline: true,
      offlineMessage: 'Offline only',
      badge,
      setBadge,
      setUpdatedMeta,
      metaId: 'meta'
    });

    const message = container.querySelector('.muted-text');
    expect(message?.textContent).toBe('Offline only');
    expect(setBadge).toHaveBeenCalledWith(
      badge,
      'Offline',
      'status-warning',
      expect.objectContaining({ source: 'offline', state: 'offline' })
    );
    expect(setUpdatedMeta).toHaveBeenCalledWith('meta', expect.objectContaining({
      message: 'Offline only',
      offline: true
    }));
    expect(container.dataset.loaded).toBe('true');
    expect(badge.dataset.loaded).toBe('true');
  });

  it('uses cache messaging and pending badge when data missing but cache flagged', () => {
    const container = document.createElement('div');
    const badge = document.createElement('span');
    const setBadge = vi.fn();
    const setUpdatedMeta = vi.fn();

    renderCardFallback(container, {
      fromCache: true,
      cacheMessage: 'Cached data unavailable.',
      badgeVariant: 'status-info',
      badge,
      metaId: 'meta-two',
      setBadge,
      setUpdatedMeta
    });

    const message = container.querySelector('.muted-text');
    expect(message?.textContent).toBe('Cached data unavailable.');
    expect(setBadge).toHaveBeenCalledWith(
      badge,
      'Pending',
      'status-info',
      expect.objectContaining({ source: 'cache', state: '' })
    );
    expect(setUpdatedMeta).toHaveBeenCalledWith('meta-two', expect.objectContaining({
      message: 'Cached data unavailable.',
      fromCache: true
    }));
  });
});
