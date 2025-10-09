const defaultNavigator = typeof navigator !== 'undefined' ? navigator : undefined;
const defaultDocument = typeof document !== 'undefined' ? document : undefined;

function normalizeText(value) {
  if (value === null || value === undefined) {
    throw new Error('No text provided to copy to the clipboard.');
  }

  return String(value);
}

function ensureDomForFallback(documentRef) {
  if (!documentRef || typeof documentRef.createElement !== 'function') {
    throw new Error('Clipboard API is unavailable and no DOM fallback is provided.');
  }

  if (!documentRef.body || typeof documentRef.body.appendChild !== 'function') {
    throw new Error('Clipboard fallback requires a document with a body element.');
  }
}

export async function copyText(value, {
  navigatorRef = defaultNavigator,
  documentRef = defaultDocument
} = {}) {
  const text = normalizeText(value);
  let clipboardError = null;

  if (navigatorRef?.clipboard?.writeText) {
    try {
      await navigatorRef.clipboard.writeText(text);
      return true;
    } catch (error) {
      clipboardError = error;
    }
  }

  ensureDomForFallback(documentRef);

  const textarea = documentRef.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'absolute';
  textarea.style.left = '-9999px';
  textarea.style.top = '0';
  textarea.style.opacity = '0';

  const selection = typeof documentRef.getSelection === 'function'
    ? documentRef.getSelection()
    : null;
  const previousRange = selection && selection.rangeCount > 0
    ? selection.getRangeAt(0)
    : null;

  documentRef.body.appendChild(textarea);

  textarea.select?.();
  textarea.setSelectionRange?.(0, textarea.value.length);

  let succeeded = false;

  try {
    if (typeof documentRef.execCommand === 'function') {
      succeeded = documentRef.execCommand('copy');
    }

    if (!succeeded && navigatorRef?.clipboard?.writeText) {
      await navigatorRef.clipboard.writeText(text);
      succeeded = true;
    }
  } finally {
    documentRef.body.removeChild(textarea);

    if (selection) {
      selection.removeAllRanges?.();
      if (previousRange) {
        selection.addRange?.(previousRange);
      }
    }
  }

  if (!succeeded) {
    if (clipboardError) {
      throw clipboardError;
    }

    throw new Error('Copying to the clipboard is not supported in this environment.');
  }

  return true;
}

export default copyText;
