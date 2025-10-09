import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createRefreshScheduler } from '../public/js/holographic/scheduler.js';

describe('createRefreshScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('invokes callbacks immediately and respects document visibility', () => {
    const documentRef = { hidden: false };
    const callback = vi.fn();
    const scheduler = createRefreshScheduler({ documentRef });

    scheduler.schedule('status', callback, 1000);
    expect(callback).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1000);
    expect(callback).toHaveBeenCalledTimes(2);

    documentRef.hidden = true;
    vi.advanceTimersByTime(2000);
    expect(callback).toHaveBeenCalledTimes(2);

    documentRef.hidden = false;
    vi.advanceTimersByTime(1000);
    expect(callback).toHaveBeenCalledTimes(3);
  });

  it('defers initial execution until idle fallback completes', () => {
    const documentRef = { hidden: false };
    const callback = vi.fn();
    const scheduler = createRefreshScheduler({ documentRef });

    scheduler.schedule('github', callback, 1000, { deferUntilIdle: true, idleTimeout: 500 });
    expect(callback).not.toHaveBeenCalled();

    vi.advanceTimersByTime(499);
    expect(callback).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('cancels pending idle timers when stopped', () => {
    const cancelIdleCallback = vi.fn();
    const requestIdleCallback = vi.fn((cb) => {
      requestIdleCallback.last = cb;
      return 42;
    });

    const callback = vi.fn();
    const scheduler = createRefreshScheduler({
      documentRef: { hidden: false },
      requestIdleCallback,
      cancelIdleCallback
    });

    scheduler.schedule('deployments', callback, 1000, { deferUntilIdle: true });
    expect(requestIdleCallback).toHaveBeenCalledTimes(1);
    expect(cancelIdleCallback).not.toHaveBeenCalled();

    scheduler.stopAll();
    expect(cancelIdleCallback).toHaveBeenCalledWith(42);
    expect(callback).not.toHaveBeenCalled();
  });
});
