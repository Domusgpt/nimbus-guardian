export function deriveCardState({ offline = false, fromCache = false, expired = false } = {}) {
  return {
    source: offline ? 'offline' : fromCache ? 'cache' : 'live',
    state: offline ? 'offline' : expired ? 'stale' : ''
  };
}

export function renderCardFallback(content, {
  offline = false,
  fromCache = false,
  expired = false,
  offlineMessage = 'Offline — reconnect to refresh.',
  cacheMessage = 'Cached data unavailable.',
  emptyMessage = 'No data available.',
  offlineMetaMessage,
  emptyMetaMessage,
  badge,
  badgeVariant = 'status-warning',
  offlineBadgeText = 'Offline',
  pendingBadgeText = 'Pending',
  metaId,
  setBadge,
  setUpdatedMeta
} = {}) {
  if (!content) {
    return;
  }

  const message = document.createElement('p');
  message.className = 'muted-text';
  const displayMessage = offline ? offlineMessage : fromCache ? cacheMessage : emptyMessage;
  message.textContent = displayMessage;
  content.appendChild(message);

  if (typeof setBadge === 'function') {
    setBadge(
      badge,
      offline ? offlineBadgeText : pendingBadgeText,
      badgeVariant,
      deriveCardState({ offline, fromCache, expired })
    );
  }

  if (metaId && typeof setUpdatedMeta === 'function') {
    setUpdatedMeta(metaId, {
      message: offline
        ? offlineMetaMessage || displayMessage
        : emptyMetaMessage || displayMessage,
      offline,
      fromCache,
      expired
    });
  }

  content.dataset.loaded = 'true';
  if (badge) {
    badge.dataset.loaded = 'true';
  }
}
