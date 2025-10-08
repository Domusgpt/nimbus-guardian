const DEFAULT_SELECTOR = '[data-clipboard]';

function toStringOrEmpty(value) {
  if (value == null) {
    return '';
  }
  return typeof value === 'string' ? value : String(value);
}

export function canUseAsyncClipboard({ windowRef = typeof window !== 'undefined' ? window : undefined } = {}) {
  const nav = windowRef?.navigator;
  return !!(nav && nav.clipboard && typeof nav.clipboard.writeText === 'function');
}

export async function copyTextToClipboard(text, {
  windowRef = typeof window !== 'undefined' ? window : undefined,
  documentRef = typeof document !== 'undefined' ? document : undefined
} = {}) {
  if (!documentRef) {
    throw new Error('copyTextToClipboard requires a document reference');
  }

  const normalized = toStringOrEmpty(text);

  if (canUseAsyncClipboard({ windowRef })) {
    await windowRef.navigator.clipboard.writeText(normalized);
    return { method: 'clipboard-api' };
  }

  const activeElement = documentRef.activeElement;
  const selection = documentRef.getSelection ? documentRef.getSelection() : null;
  let previousRange = null;

  if (selection && selection.rangeCount > 0) {
    previousRange = selection.getRangeAt(0);
  }

  const textarea = documentRef.createElement('textarea');
  textarea.value = normalized;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  textarea.style.pointerEvents = 'none';
  textarea.style.top = '-9999px';
  textarea.style.left = '-9999px';

  documentRef.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);

  let success = false;
  try {
    success = !!documentRef.execCommand && documentRef.execCommand('copy');
  } catch (error) {
    throw new Error('Fallback copy failed', { cause: error });
  } finally {
    documentRef.body.removeChild(textarea);
    if (previousRange && selection) {
      selection.removeAllRanges();
      selection.addRange(previousRange);
    }
    if (activeElement && typeof activeElement.focus === 'function') {
      activeElement.focus({ preventScroll: true });
    }
  }

  if (!success) {
    throw new Error('Unable to copy text to clipboard');
  }

  return { method: 'execCommand' };
}

export function createClipboardDelegate({
  documentRef = typeof document !== 'undefined' ? document : undefined,
  windowRef = typeof window !== 'undefined' ? window : undefined,
  selector = DEFAULT_SELECTOR,
  getText,
  onCopyStart,
  onCopySuccess,
  onCopyError,
  copy = copyTextToClipboard
} = {}) {
  if (!documentRef) {
    throw new Error('createClipboardDelegate requires a document reference');
  }

  const resolveText = (trigger, event) => {
    if (typeof getText === 'function') {
      return getText(trigger, event);
    }

    if (trigger.dataset.clipboardText != null) {
      return trigger.dataset.clipboardText;
    }

    if (trigger.dataset.clipboardTarget) {
      const target = documentRef.querySelector(trigger.dataset.clipboardTarget);
      if (target) {
        if ('value' in target && target.value != null) {
          return target.value;
        }
        return target.textContent;
      }
    }

    if ('value' in trigger && trigger.value != null) {
      return trigger.value;
    }

    return trigger.textContent;
  };

  const handler = async (event) => {
    const trigger = event.target?.closest?.(selector);
    if (!trigger) {
      return;
    }

    event.preventDefault();
    const resolved = resolveText(trigger, event);

    if (resolved == null) {
      const error = new Error('No clipboard text resolved');
      if (typeof onCopyError === 'function') {
        onCopyError(error, { trigger, event, text: resolved });
      }
      return;
    }

    if (typeof onCopyStart === 'function') {
      onCopyStart({ trigger, event });
    }

    try {
      const result = await copy(resolved, { documentRef, windowRef });
      if (typeof onCopySuccess === 'function') {
        onCopySuccess({ trigger, event, text: resolved, result });
      }
    } catch (error) {
      if (typeof onCopyError === 'function') {
        onCopyError(error, { trigger, event, text: resolved });
      }
    }
  };

  documentRef.addEventListener('click', handler);

  return () => {
    documentRef.removeEventListener('click', handler);
  };
}
