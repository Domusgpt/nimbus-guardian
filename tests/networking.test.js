import { describe, expect, it, vi } from 'vitest';
import { createNetworking, createNetworkMonitor } from '../public/js/holographic/networking.js';

function mockNavigatorOnline(value) {
  Object.defineProperty(window.navigator, 'onLine', {
    configurable: true,
    get() {
      return value;
    }
  });
}

describe('createNetworking', () => {
  it('aborts prior request when a new one starts with the same key', async () => {
    const { fetchJSON } = createNetworking();
    const abortErrors = [];

    let firstSignal;
    globalThis.fetch = vi.fn((url, { signal }) => {
      if (!firstSignal) {
        firstSignal = signal;
        return new Promise((_, reject) => {
          signal.addEventListener('abort', () => {
            const error = Object.assign(new Error('Aborted'), { name: 'AbortError' });
            abortErrors.push(error);
            reject(error);
          });
        });
      }

      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ ok: true })
      });
    });

    const firstPromise = fetchJSON('status', '/api/status').catch(error => error);
    await new Promise(resolve => setTimeout(resolve, 0));
    const secondPromise = fetchJSON('status', '/api/status');

    await expect(secondPromise).resolves.toEqual({ ok: true });
    const firstResult = await firstPromise;
    expect(firstResult.name).toBe('AbortError');
    expect(firstSignal.aborted).toBe(true);
    expect(abortErrors).toHaveLength(1);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it('stores and retrieves cached payloads with expiration metadata', () => {
    const { saveCache, readCache } = createNetworking({ cachePrefix: 'test:', cacheTTL: 10 });
    saveCache('status', { value: 42 });

    const cached = readCache('status');
    expect(cached?.data).toEqual({ value: 42 });
    expect(typeof cached?.timestamp).toBe('number');
    expect(cached?.expired).toBe(false);

    const staleRecord = { timestamp: Date.now() - 20, data: { value: 1 } };
    window.localStorage.setItem('test:stale', JSON.stringify(staleRecord));
    const stale = readCache('stale');
    expect(stale?.expired).toBe(true);
  });

  it('schedules and clears refresh timers', () => {
    const { scheduleRefresh, stopRefresh, stopAutoRefresh } = createNetworking();
    vi.useFakeTimers();
    const callback = vi.fn();

    scheduleRefresh('status', callback, 1000);
    vi.advanceTimersByTime(2500);
    expect(callback).toHaveBeenCalledTimes(2);

    stopRefresh('status');
    vi.advanceTimersByTime(2000);
    expect(callback).toHaveBeenCalledTimes(2);

    const callbackTwo = vi.fn();
    scheduleRefresh('tools', callbackTwo, 500);
    scheduleRefresh('issues', callbackTwo, 500);

    stopAutoRefresh();
    vi.advanceTimersByTime(2000);
    expect(callbackTwo).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});

describe('createNetworkMonitor', () => {
  it('updates DOM state and triggers callbacks on connectivity changes', () => {
    const statusLabel = document.createElement('span');
    const showToast = vi.fn();
    const onOnline = vi.fn();
    const onOffline = vi.fn();

    mockNavigatorOnline(true);
    const monitor = createNetworkMonitor({ statusLabel, showToast, onOnline, onOffline });

    monitor.updateNetworkStatus();
    expect(statusLabel.textContent).toBe('Online');
    expect(document.body.classList.contains('is-offline')).toBe(false);

    mockNavigatorOnline(false);
    monitor.updateNetworkStatus({ notify: true });
    expect(statusLabel.textContent).toBe('Offline');
    expect(document.body.classList.contains('is-offline')).toBe(true);
    expect(showToast).toHaveBeenLastCalledWith('You appear to be offline. Data may be stale.', 'warning');
    expect(onOffline).toHaveBeenCalledTimes(1);

    mockNavigatorOnline(true);
    monitor.updateNetworkStatus({ notify: true });
    expect(statusLabel.textContent).toBe('Online');
    expect(document.body.classList.contains('is-offline')).toBe(false);
    expect(showToast).toHaveBeenLastCalledWith('Connection restored. Resuming live updates.', 'success');
    expect(onOnline).toHaveBeenCalledTimes(1);
  });
});
