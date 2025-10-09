function ensureDocument(documentRef) {
  if (documentRef && typeof documentRef.getElementById === 'function') {
    return documentRef;
  }
  return typeof document !== 'undefined' ? document : null;
}

function requestFrame(documentRef, callback) {
  const view = documentRef?.defaultView || (typeof window !== 'undefined' ? window : undefined);
  if (view && typeof view.requestAnimationFrame === 'function') {
    view.requestAnimationFrame(callback);
    return;
  }
  setTimeout(callback, 0);
}

export function createToast({ documentRef, alert: alertFn } = {}) {
  const resolvedDocument = ensureDocument(documentRef);
  const resolvedAlert = alertFn || (typeof window !== 'undefined' ? window.alert : undefined);

  return function showToast(message, variant = 'info', duration = 5000) {
    if (!resolvedDocument) {
      if (typeof resolvedAlert === 'function' && typeof message === 'string') {
        resolvedAlert(message);
      }
      return;
    }

    const stack = resolvedDocument.getElementById('toast-stack');
    if (!stack) {
      if (typeof resolvedAlert === 'function' && typeof message === 'string') {
        console.warn('Toast stack missing, falling back to alert:', message);
        resolvedAlert(message);
      }
      return;
    }

    const normalizedVariant = ['success', 'info', 'warning', 'error'].includes((variant || '').toLowerCase())
      ? variant.toLowerCase()
      : 'info';

    const toast = resolvedDocument.createElement('div');
    toast.className = `toast toast-${normalizedVariant}`;
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    toast.textContent = (message ?? '').toString();

    stack.appendChild(toast);

    requestFrame(resolvedDocument, () => {
      toast.classList.add('visible');
    });

    const hide = () => {
      toast.classList.remove('visible');
      setTimeout(() => {
        if (toast.parentElement === stack) {
          stack.removeChild(toast);
        }
      }, 300);
    };

    const timeoutId = setTimeout(hide, Math.max(2000, duration || 0));

    toast.addEventListener('click', () => {
      clearTimeout(timeoutId);
      hide();
    });
  };
}

export const showToast = createToast();
