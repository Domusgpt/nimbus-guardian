import {
  parseDateLike as sharedParseDateLike,
  formatRelativeTime as sharedFormatRelativeTime,
  extractTimestamp as sharedExtractTimestamp,
  DEFAULT_TIMESTAMP_FIELDS
} from '../shared/time.js';

const DEFAULT_TIMEOUT = 20_000;
const CACHE_PREFIX = 'guardian-dashboard:';
const CACHE_TTL = 1000 * 60 * 60; // 1 hour

const relativeTimeFormatter = typeof Intl !== 'undefined' && typeof Intl.RelativeTimeFormat === 'function'
  ? new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
  : null;

function defaultIsOnline() {
  return typeof navigator === 'undefined' ? true : navigator.onLine !== false;
}

export function createNetworkMonitor({
  statusLabel,
  showToast,
  onOnline = () => {},
  onOffline = () => {}
} = {}) {
  let lastKnownOnline = defaultIsOnline();

  function isOnline() {
    return defaultIsOnline();
  }

  function updateNetworkStatus({ notify = false } = {}) {
    const online = isOnline();

    if (statusLabel) {
      statusLabel.textContent = online ? 'Online' : 'Offline';
      statusLabel.classList.toggle('offline', !online);
    }

    document.body.classList.toggle('is-offline', !online);

    if (notify && online !== lastKnownOnline) {
      if (typeof showToast === 'function') {
        showToast(
          online
            ? 'Connection restored. Resuming live updates.'
            : 'You appear to be offline. Data may be stale.',
          online ? 'success' : 'warning'
        );
      }

      if (online) {
        onOnline();
      } else {
        onOffline();
      }
    }

    lastKnownOnline = online;
    return online;
  }

  window.addEventListener('online', () => updateNetworkStatus({ notify: true }));
  window.addEventListener('offline', () => updateNetworkStatus({ notify: true }));

  return { isOnline, updateNetworkStatus };
}

export function createNetworking({
  defaultTimeout = DEFAULT_TIMEOUT,
  cachePrefix = CACHE_PREFIX,
  cacheTTL = CACHE_TTL,
  timestampFields = DEFAULT_TIMESTAMP_FIELDS,
  parseDate = sharedParseDateLike,
  formatRelative = sharedFormatRelativeTime
} = {}) {
  const inflightRequests = new Map();
  const refreshTimers = new Map();
  const parseDateLike = value => parseDate(value);
  const formatRelativeTime = value => formatRelative(value, { formatter: relativeTimeFormatter });

  async function fetchJSON(key, url, options = {}) {
    if (!key) {
      throw new Error('fetchJSON requires a request key');
    }

    if (inflightRequests.has(key)) {
      inflightRequests.get(key).abort();
    }

    const controller = new AbortController();
    inflightRequests.set(key, controller);

    const { timeout = defaultTimeout, ...requestOptions } = options;
    let abortedByTimeout = false;
    const timeoutId = timeout
      ? setTimeout(() => {
          abortedByTimeout = true;
          controller.abort();
        }, timeout)
      : null;

    try {
      const response = await fetch(url, { ...requestOptions, signal: controller.signal });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      if (error.name === 'AbortError' && abortedByTimeout) {
        const timeoutError = new Error(`Request timed out after ${Math.round(timeout / 1000)}s`);
        timeoutError.name = 'TimeoutError';
        throw timeoutError;
      }
      throw error;
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      if (inflightRequests.get(key) === controller) {
        inflightRequests.delete(key);
      }
    }
  }

  function saveCache(key, data) {
    if (!key || typeof localStorage === 'undefined') {
      return;
    }

    try {
      const record = JSON.stringify({ timestamp: Date.now(), data });
      localStorage.setItem(`${cachePrefix}${key}`, record);
    } catch (error) {
      console.warn(`Failed to cache ${key}`, error);
    }
  }

  function readCache(key) {
    if (!key || typeof localStorage === 'undefined') {
      return null;
    }

    try {
      const raw = localStorage.getItem(`${cachePrefix}${key}`);
      if (!raw) {
        return null;
      }

      const record = JSON.parse(raw);
      if (!record || typeof record !== 'object') {
        return null;
      }

      const timestamp = typeof record.timestamp === 'number' ? record.timestamp : null;
      const expired = timestamp ? Date.now() - timestamp > cacheTTL : false;
      return { data: record.data, timestamp, expired };
    } catch (error) {
      console.warn(`Failed to read cache for ${key}`, error);
      return null;
    }
  }

  const extractTimestamp = (record, fallback) => sharedExtractTimestamp(record, {
    fields: timestampFields,
    fallback,
    parse: parseDateLike
  });

  function scheduleRefresh(key, callback, interval) {
    if (!key || typeof callback !== 'function' || !interval) {
      return;
    }

    if (refreshTimers.has(key)) {
      clearInterval(refreshTimers.get(key));
    }

    const timer = setInterval(callback, interval);
    refreshTimers.set(key, timer);
  }

  function stopRefresh(key) {
    if (!refreshTimers.has(key)) {
      return;
    }

    clearInterval(refreshTimers.get(key));
    refreshTimers.delete(key);
  }

  function stopAutoRefresh() {
    refreshTimers.forEach(timer => clearInterval(timer));
    refreshTimers.clear();
  }

  return {
    fetchJSON,
    saveCache,
    readCache,
    parseDateLike,
    formatRelativeTime,
    extractTimestamp,
    scheduleRefresh,
    stopRefresh,
    stopAutoRefresh
  };
}
