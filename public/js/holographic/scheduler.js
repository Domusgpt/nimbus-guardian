const defaultWindow = typeof window !== 'undefined' ? window : undefined;
const defaultDocument = typeof document !== 'undefined' ? document : { hidden: false };

export function createRefreshScheduler({
  documentRef = defaultDocument,
  requestIdleCallback: requestIdleCallbackFn = defaultWindow?.requestIdleCallback,
  cancelIdleCallback: cancelIdleCallbackFn = defaultWindow?.cancelIdleCallback,
  setIntervalFn = defaultWindow?.setInterval ?? globalThis.setInterval,
  clearIntervalFn = defaultWindow?.clearInterval ?? globalThis.clearInterval,
  setTimeoutFn = defaultWindow?.setTimeout ?? globalThis.setTimeout,
  clearTimeoutFn = defaultWindow?.clearTimeout ?? globalThis.clearTimeout
} = {}) {
  const activeTimers = new Map();
  const pendingStarts = new Map();

  function cancelPendingStart(key) {
    const pending = pendingStarts.get(key);
    if (!pending) {
      return;
    }

    if (pending.type === 'idle' && typeof cancelIdleCallbackFn === 'function') {
      cancelIdleCallbackFn(pending.id);
    } else {
      clearTimeoutFn(pending.id);
    }

    pendingStarts.delete(key);
  }

  function maybeInvoke(callback) {
    if (documentRef?.hidden) {
      return;
    }
    callback();
  }

  function schedule(key, callback, interval, {
    immediate = true,
    deferUntilIdle = false,
    idleTimeout = 2000
  } = {}) {
    if (!key || typeof callback !== 'function' || !interval) {
      return;
    }

    cancelPendingStart(key);

    if (activeTimers.has(key)) {
      clearIntervalFn(activeTimers.get(key));
      activeTimers.delete(key);
    }

    const startInterval = () => {
      pendingStarts.delete(key);
      if (immediate) {
        maybeInvoke(callback);
      }
      const id = setIntervalFn(() => maybeInvoke(callback), interval);
      activeTimers.set(key, id);
    };

    if (deferUntilIdle) {
      if (typeof requestIdleCallbackFn === 'function') {
        const idleId = requestIdleCallbackFn(startInterval, { timeout: idleTimeout });
        pendingStarts.set(key, { type: 'idle', id: idleId });
      } else {
        const timeoutId = setTimeoutFn(startInterval, idleTimeout);
        pendingStarts.set(key, { type: 'timeout', id: timeoutId });
      }
      return;
    }

    startInterval();
  }

  function stop(key) {
    cancelPendingStart(key);
    if (!activeTimers.has(key)) {
      return;
    }

    clearIntervalFn(activeTimers.get(key));
    activeTimers.delete(key);
  }

  function stopAll() {
    activeTimers.forEach(id => clearIntervalFn(id));
    activeTimers.clear();

    for (const [key, pending] of pendingStarts.entries()) {
      if (pending.type === 'idle' && typeof cancelIdleCallbackFn === 'function') {
        cancelIdleCallbackFn(pending.id);
      } else {
        clearTimeoutFn(pending.id);
      }
      pendingStarts.delete(key);
    }
  }

  return {
    schedule,
    stop,
    stopAll
  };
}
