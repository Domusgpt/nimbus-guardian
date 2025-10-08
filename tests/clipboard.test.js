import { describe, expect, it, vi } from 'vitest';
import { copyText } from '../public/js/shared/clipboard.js';

describe('copyText', () => {
  it('uses navigator.clipboard when available', async () => {
    const writeText = vi.fn().mockResolvedValue();
    const navigatorRef = { clipboard: { writeText } };

    await expect(copyText('hello world', { navigatorRef, documentRef: document })).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith('hello world');
  });

  it('falls back to document.execCommand when clipboard write fails', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    const navigatorRef = { clipboard: { writeText } };

    const hadExecCommand = typeof document.execCommand === 'function';
    if (!hadExecCommand) {
      document.execCommand = vi.fn();
    }

    const execCommand = vi.spyOn(document, 'execCommand');

    execCommand.mockReturnValue(true);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await copyText('fallback text', { navigatorRef, documentRef: document });

    expect(writeText).toHaveBeenCalled();
    expect(execCommand).toHaveBeenCalledWith('copy');
    expect(result).toBe(true);

    warnSpy.mockRestore();
    execCommand.mockRestore();
    if (!hadExecCommand) {
      delete document.execCommand;
    }
  });

  it('returns false when neither clipboard nor execCommand succeed', async () => {
    const originalExec = document.execCommand;
    document.execCommand = vi.fn().mockReturnValue(false);

    const result = await copyText('no clipboard support', { navigatorRef: {}, documentRef: document });

    expect(result).toBe(false);

    if (originalExec) {
      document.execCommand = originalExec;
    } else {
      delete document.execCommand;
    }
  });

  it('rejects when provided value is null or undefined', async () => {
    await expect(copyText(null, { documentRef: document })).rejects.toThrow('copyText requires a value to copy');
  });
});
