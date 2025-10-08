import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { copyTextToClipboard, createClipboardDelegate } from '../public/js/shared/clipboard.js';

describe('copyTextToClipboard', () => {
  let originalExecCommand;

  beforeEach(() => {
    originalExecCommand = document.execCommand;
  });

  afterEach(() => {
    document.execCommand = originalExecCommand;
    document.body.innerHTML = '';
  });

  it('uses the async clipboard API when available', async () => {
    const writeText = vi.fn().mockResolvedValue();
    await copyTextToClipboard('holo', {
      windowRef: { navigator: { clipboard: { writeText } } },
      documentRef: document
    });

    expect(writeText).toHaveBeenCalledWith('holo');
  });

  it('falls back to execCommand when async clipboard is unavailable', async () => {
    document.execCommand = vi.fn().mockReturnValue(true);

    await copyTextToClipboard('fallback', {
      windowRef: {},
      documentRef: document
    });

    expect(document.execCommand).toHaveBeenCalledWith('copy');
    expect(document.body.querySelectorAll('textarea').length).toBe(0);
  });

  it('throws when fallback copy fails', async () => {
    document.execCommand = vi.fn().mockReturnValue(false);

    await expect(copyTextToClipboard('broken', {
      windowRef: {},
      documentRef: document
    })).rejects.toThrow('Unable to copy text to clipboard');
  });
});

describe('createClipboardDelegate', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('handles clicks on matching elements and resolves text from dataset', async () => {
    document.body.innerHTML = '<button id="copy" data-clipboard data-clipboard-text="hello">Copy</button>';
    const copy = vi.fn().mockResolvedValue({ method: 'clipboard-api' });
    const onCopyStart = vi.fn();
    const onCopySuccess = vi.fn();

    const addListenerSpy = vi.spyOn(document, 'addEventListener');

    const detach = createClipboardDelegate({
      documentRef: document,
      windowRef: window,
      copy,
      onCopyStart,
      onCopySuccess
    });

    const handler = addListenerSpy.mock.calls.find(call => call[0] === 'click')[1];
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'target', { value: document.getElementById('copy'), configurable: true });

    await handler(event);

    expect(copy).toHaveBeenCalledWith('hello', expect.objectContaining({ documentRef: document, windowRef: window }));
    expect(onCopyStart).toHaveBeenCalledTimes(1);
    expect(onCopySuccess).toHaveBeenCalledTimes(1);

    addListenerSpy.mockRestore();
    detach();
  });

  it('invokes the error handler when copy rejects', async () => {
    document.body.innerHTML = '<button id="copy" data-clipboard data-clipboard-text="hello">Copy</button>';
    const error = new Error('boom');
    const copy = vi.fn().mockRejectedValue(error);
    const onCopyError = vi.fn();

    const addListenerSpy = vi.spyOn(document, 'addEventListener');

    const detach = createClipboardDelegate({
      documentRef: document,
      windowRef: window,
      copy,
      onCopyError
    });

    const handler = addListenerSpy.mock.calls.find(call => call[0] === 'click')[1];
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'target', { value: document.getElementById('copy'), configurable: true });

    await handler(event);

    expect(onCopyError).toHaveBeenCalledTimes(1);
    expect(onCopyError).toHaveBeenCalledWith(error, expect.objectContaining({ trigger: document.getElementById('copy') }));

    addListenerSpy.mockRestore();
    detach();
  });

  it('uses a custom text resolver when provided', async () => {
    document.body.innerHTML = '<button id="copy" data-clipboard data-clipboard-target="#command">Copy</button><pre id="command">npm install</pre>';
    const copy = vi.fn().mockResolvedValue({ method: 'execCommand' });
    const getText = vi.fn(() => 'npm install guard');

    const addListenerSpy = vi.spyOn(document, 'addEventListener');

    const detach = createClipboardDelegate({
      documentRef: document,
      windowRef: window,
      copy,
      getText
    });

    const handler = addListenerSpy.mock.calls.find(call => call[0] === 'click')[1];
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'target', { value: document.getElementById('copy'), configurable: true });

    await handler(event);

    expect(getText).toHaveBeenCalled();
    expect(copy).toHaveBeenCalledWith('npm install guard', expect.objectContaining({ documentRef: document }));

    addListenerSpy.mockRestore();
    detach();
  });
});
