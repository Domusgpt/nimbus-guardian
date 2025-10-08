import { describe, expect, it, vi } from 'vitest';
import { createAssistantLoader } from '../public/js/holographic/assistant-loader.js';

describe('createAssistantLoader', () => {
  it('imports assistant module lazily and caches the actions', async () => {
    const createAssistantActions = vi.fn(() => ({ handleAutoFix: vi.fn() }));
    const importAssistant = vi.fn(async () => ({ createAssistantActions }));

    const loader = createAssistantLoader({
      importAssistant,
      getDependencies: () => ({})
    });

    const actions = await loader.ensureActions();
    expect(importAssistant).toHaveBeenCalledTimes(1);
    expect(createAssistantActions).toHaveBeenCalledTimes(1);

    const sameActions = await loader.ensureActions();
    expect(importAssistant).toHaveBeenCalledTimes(1);
    expect(sameActions).toBe(actions);
  });

  it('invokes onLoadError when a requested action is unavailable', async () => {
    const createAssistantActions = vi.fn(() => ({}));
    const importAssistant = vi.fn(async () => ({ createAssistantActions }));
    const onLoadError = vi.fn();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const loader = createAssistantLoader({
      importAssistant,
      getDependencies: () => ({ fetchJSON: vi.fn(), showToast: vi.fn(), isOnline: vi.fn(), loadTools: vi.fn(), refreshScan: vi.fn() }),
      onLoadError
    });

    const handler = loader.createHandler('handleAutoFix');
    const stopPropagation = vi.fn();
    await handler({ stopPropagation });

    expect(stopPropagation).toHaveBeenCalledTimes(1);
    expect(onLoadError).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
  });

  it('swallows preload errors so idle warmups do not explode', async () => {
    const importAssistant = vi.fn(async () => {
      throw new Error('boom');
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const loader = createAssistantLoader({
      importAssistant,
      getDependencies: () => ({})
    });

    await expect(loader.preload()).resolves.toBeUndefined();
    expect(importAssistant).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
  });
});
