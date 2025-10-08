const defaultWindow = typeof window !== 'undefined' ? window : null;
const defaultNavigator = typeof navigator !== 'undefined' ? navigator : null;
const defaultDocument = typeof document !== 'undefined' ? document : null;

function normalizeInput(value) {
  if (value === undefined || value === null) {
    throw new Error('copyText requires a value to copy');
  }
  return typeof value === 'string' ? value : String(value);
}

function getNavigator({ navigatorRef, windowRef }) {
  if (navigatorRef) return navigatorRef;
  if (windowRef && windowRef.navigator) return windowRef.navigator;
  return defaultNavigator;
}

function getDocument({ documentRef, windowRef }) {
  if (documentRef) return documentRef;
  if (windowRef && windowRef.document) return windowRef.document;
  return defaultDocument;
}

export async function copyText(value, {
  windowRef = defaultWindow,
  navigatorRef = null,
  documentRef = null
} = {}) {
  const text = normalizeInput(value);
  const nav = getNavigator({ navigatorRef, windowRef });

  if (nav?.clipboard?.writeText) {
    try {
      await nav.clipboard.writeText(text);
      return true;
    } catch (error) {
      // continue to fallback
      console.warn('Navigator clipboard write failed, falling back to execCommand.', error);
    }
  }

  const doc = getDocument({ documentRef, windowRef });
  if (!doc?.body) {
    return false;
  }

  const textarea = doc.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'absolute';
  textarea.style.left = '-9999px';
  textarea.style.top = '0';

  let selection;
  let originalRange;
  try {
    selection = doc.getSelection ? doc.getSelection() : null;
    if (selection?.rangeCount) {
      originalRange = selection.getRangeAt(0).cloneRange();
    }
  } catch (error) {
    selection = null;
    originalRange = null;
  }

  const activeElement = doc.activeElement;

  doc.body.appendChild(textarea);
  textarea.focus({ preventScroll: true });
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);

  let succeeded = false;
  try {
    succeeded = typeof doc.execCommand === 'function' ? doc.execCommand('copy') : false;
  } catch (error) {
    console.warn('document.execCommand("copy") failed.', error);
    succeeded = false;
  }

  if (doc.body.contains(textarea)) {
    doc.body.removeChild(textarea);
  }

  if (activeElement?.focus) {
    try {
      activeElement.focus({ preventScroll: true });
    } catch {
      // ignore focus restoration errors
    }
  }

  if (selection && selection.removeAllRanges) {
    selection.removeAllRanges();
    if (originalRange) {
      selection.addRange(originalRange);
    }
  }

  return succeeded;
}

export default { copyText };
