import { describe, it, expect, vi, beforeEach } from 'vitest';

import { deriveCardState, renderCardFallback } from '../public/js/holographic/card-state.js';

describe('deriveCardState', () => {
  it('returns offline source and state when offline is true', () => {
    expect(deriveCardState({ offline: true, expired: true })).toEqual({
      source: 'offline',
      state: 'offline'
    });
  });

  it('distinguishes cache and stale states', () => {
    expect(deriveCardState({ fromCache: true })).toEqual({
      source: 'cache',
      state: ''
    });

    expect(deriveCardState({ expired: true })).toEqual({
      source: 'live',
      state: 'stale'
    });
  });
});

describe('renderCardFallback', () => {
  let content;
  let badge;

  beforeEach(() => {
    content = document.createElement('div');
    badge = document.createElement('span');
  });

  it('renders offline messaging and updates helpers', () => {
    const setBadge = vi.fn();
    const setUpdatedMeta = vi.fn();

    renderCardFallback(content, {
      offline: true,
      badge,
      offlineMessage: 'Offline mode',
      offlineMetaMessage: 'Waiting for connection',
      metaId: 'status-meta',
      setBadge,
      setUpdatedMeta
    });

    const message = content.querySelector('.muted-text');
    expect(message).not.toBeNull();
    expect(message.textContent).toBe('Offline mode');

    expect(setBadge).toHaveBeenCalledWith(
      badge,
      'Offline',
      'status-warning',
      { source: 'offline', state: 'offline' }
    );

    expect(setUpdatedMeta).toHaveBeenCalledWith('status-meta', {
      message: 'Waiting for connection',
      offline: true,
      fromCache: false,
      expired: false
    });

    expect(content.dataset.loaded).toBe('true');
    expect(badge.dataset.loaded).toBe('true');
  });

  it('falls back to cache messaging when available data is stale', () => {
    const setBadge = vi.fn();

    renderCardFallback(content, {
      fromCache: true,
      expired: true,
      badge,
      cacheMessage: 'Cached snapshot unavailable.',
      emptyMetaMessage: 'No live data.',
      metaId: 'status-meta',
      setBadge,
      setUpdatedMeta: vi.fn()
    });

    const message = content.querySelector('.muted-text');
    expect(message.textContent).toBe('Cached snapshot unavailable.');

    expect(setBadge).toHaveBeenCalledWith(
      badge,
      'Pending',
      'status-warning',
      { source: 'cache', state: 'stale' }
    );
  });
});
