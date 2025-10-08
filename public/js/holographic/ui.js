import { showToast } from '../shared/notifications.js';
export { showToast };

function ensureFunction(name, value) {
  if (typeof value !== 'function') {
    throw new Error(`${name} must be a function`);
  }
  return value;
}

export function setLoadingState(element, message = 'Loading...') {
  if (!element) return;

  element.classList.add('is-loading');
  element.setAttribute('aria-busy', 'true');

  if (getComputedStyle(element).position === 'static') {
    element.dataset.positionWasStatic = 'true';
    element.style.position = 'relative';
  }

  let overlay = element.querySelector(':scope > .loading-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'loading-overlay';
    overlay.setAttribute('role', 'status');
    overlay.setAttribute('aria-live', 'polite');

    const spinner = document.createElement('div');
    spinner.className = 'spinner';
    spinner.setAttribute('aria-hidden', 'true');

    const text = document.createElement('p');
    text.className = 'loading-text';

    overlay.append(spinner, text);
    overlay.setAttribute('hidden', '');
    element.appendChild(overlay);
  }

  const textNode = overlay.querySelector('.loading-text');
  if (textNode) {
    textNode.textContent = message;
  }

  overlay.removeAttribute('hidden');
  requestAnimationFrame(() => overlay.classList.add('visible'));
}

export function clearLoadingState(element) {
  if (!element) return;

  element.removeAttribute('aria-busy');
  element.classList.remove('is-loading');

  const overlay = element.querySelector(':scope > .loading-overlay');
  if (overlay) {
    overlay.classList.remove('visible');
    overlay.setAttribute('hidden', '');
  }

  if (element.dataset.positionWasStatic) {
    element.style.position = '';
    delete element.dataset.positionWasStatic;
  }
}

export function setBadge(element, text, variant = 'status-good', options = {}) {
  if (!element) return;
  element.textContent = text;
  element.className = `status-badge ${variant}`;

  const { source, state } = options || {};
  if (source) {
    element.dataset.source = source;
  } else {
    delete element.dataset.source;
  }

  if (state) {
    element.dataset.state = state;
  } else {
    delete element.dataset.state;
  }
}

export function renderMetrics(container, metrics) {
  if (!container) return;
  const fragment = document.createDocumentFragment();

  metrics.forEach(metric => {
    if (!metric) return;

    const row = document.createElement('div');
    row.className = 'metric';

    const label = document.createElement('span');
    label.className = 'metric-label';
    label.textContent = metric.label;

    const value = document.createElement('span');
    value.className = 'metric-value';
    value.textContent = metric.value;

    row.append(label, value);
    fragment.appendChild(row);
  });

  container.appendChild(fragment);
}

export function createMetaUpdater({ parseDateLike, formatRelativeTime }) {
  ensureFunction('parseDateLike', parseDateLike);
  ensureFunction('formatRelativeTime', formatRelativeTime);

  return function setUpdatedMeta(id, {
    timestamp = null,
    fromCache = false,
    message = '',
    expired = false,
    offline = false
  } = {}) {
    const element = document.getElementById(id);
    if (!element) {
      return;
    }

    const source = offline ? 'offline' : fromCache ? 'cache' : 'live';
    if (source) {
      element.dataset.source = source;
    } else {
      delete element.dataset.source;
    }

    const applyState = (state) => {
      if (state) {
        element.dataset.state = state;
      } else {
        delete element.dataset.state;
      }
    };

    if (message) {
      element.textContent = message;
      applyState(offline ? 'offline' : expired ? 'stale' : '');
      element.removeAttribute('data-timestamp');
      element.removeAttribute('title');
      return;
    }

    let normalizedTimestamp = null;
    if (timestamp instanceof Date) {
      normalizedTimestamp = Number.isNaN(timestamp.getTime()) ? null : timestamp;
    } else if (typeof timestamp === 'number') {
      normalizedTimestamp = new Date(timestamp);
    } else if (timestamp) {
      normalizedTimestamp = parseDateLike(timestamp);
    }

    if (!normalizedTimestamp || Number.isNaN(normalizedTimestamp.getTime())) {
      element.textContent = fromCache ? 'Cached update (time unknown)' : 'Awaiting update';
      applyState(offline ? 'offline' : expired ? 'stale' : '');
      element.removeAttribute('data-timestamp');
      element.removeAttribute('title');
      return;
    }

    const relative = formatRelativeTime(normalizedTimestamp) || 'recently';
    const prefix = offline && fromCache
      ? 'Offline cache'
      : fromCache
        ? 'Cached'
        : 'Updated';
    const suffix = expired ? ' • stale' : '';
    element.textContent = `${prefix} ${relative}${suffix}`;
    element.dataset.timestamp = normalizedTimestamp.toISOString();
    element.title = normalizedTimestamp.toLocaleString();
    applyState(offline ? 'offline' : expired ? 'stale' : '');
  };
}
