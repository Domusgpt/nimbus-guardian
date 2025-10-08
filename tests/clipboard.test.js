import { describe, expect, it, vi } from 'vitest';
import { copyText } from '../public/js/shared/clipboard.js';

function createSelection() {
  return {
    rangeCount: 0,
    getRangeAt: vi.fn(),
    removeAllRanges: vi.fn(),
    addRange: vi.fn()
  };
}

function createTextarea() {
  return {
    value: '',
    style: {},
    setAttribute: vi.fn(),
    select: vi.fn(),
    setSelectionRange: vi.fn()
  };
}

describe('copyText', () => {
  it('uses the async clipboard API when available', async () => {
    const writeText = vi.fn().mockResolvedValue();

    await expect(
      copyText('hello world', {
        navigatorRef: { clipboard: { writeText } },
        documentRef: {
          createElement: vi.fn(),
          body: { appendChild: vi.fn(), removeChild: vi.fn() }
        }
      })
    ).resolves.toBe(true);

    expect(writeText).toHaveBeenCalledWith('hello world');
  });

  it('falls back to execCommand when the async clipboard API fails', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    const textarea = createTextarea();
    const selection = createSelection();

    const documentRef = {
      createElement: vi.fn(() => textarea),
      body: {
        appendChild: vi.fn(),
        removeChild: vi.fn()
      },
      getSelection: vi.fn(() => selection),
      execCommand: vi.fn(() => true)
    };

    await expect(
      copyText('npm install something', {
        navigatorRef: { clipboard: { writeText } },
        documentRef
      })
    ).resolves.toBe(true);

    expect(documentRef.createElement).toHaveBeenCalledWith('textarea');
    expect(textarea.value).toBe('npm install something');
    expect(documentRef.execCommand).toHaveBeenCalledWith('copy');
  });

  it('throws when neither clipboard API nor fallback succeed', async () => {
    const textarea = createTextarea();
    const documentRef = {
      createElement: vi.fn(() => textarea),
      body: {
        appendChild: vi.fn(),
        removeChild: vi.fn()
      },
      getSelection: vi.fn(() => createSelection()),
      execCommand: vi.fn(() => false)
    };

    await expect(
      copyText('npm install fail', {
        navigatorRef: {},
        documentRef
      })
    ).rejects.toThrow('Copying to the clipboard is not supported in this environment.');
  });
});
