import { describe, expect, it, vi } from 'vitest';
import { createAssistantActions } from '../public/js/holographic/assistant.js';

describe('createAssistantActions', () => {
  const baseDeps = () => {
    const showToast = vi.fn();
    const fetchJSON = vi.fn();
    const loadTools = vi.fn();
    const refreshScan = vi.fn();
    const isOnline = vi.fn(() => true);
    const actions = createAssistantActions({ fetchJSON, showToast, isOnline, loadTools, refreshScan });
    return { actions, fetchJSON, showToast, loadTools, refreshScan, isOnline };
  };

  it('blocks install attempts while offline', async () => {
    const deps = baseDeps();
    deps.isOnline.mockReturnValue(false);

    const button = document.createElement('button');
    button.dataset.command = 'npm install';
    button.dataset.tool = 'Demo';
    const event = { stopPropagation: vi.fn(), currentTarget: button };

    await deps.actions.handleInstallTool(event);
    expect(deps.showToast).toHaveBeenCalledWith('Cannot install Demo while offline.', 'warning');
    expect(deps.fetchJSON).not.toHaveBeenCalled();
  });

  it('restores button state when install fails', async () => {
    const deps = baseDeps();
    deps.fetchJSON.mockRejectedValue(new Error('boom'));

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const button = document.createElement('button');
    button.textContent = 'Install';
    button.dataset.command = 'npm install';
    button.dataset.tool = 'Demo';
    document.body.appendChild(button);
    const event = { stopPropagation: vi.fn(), currentTarget: button };

    await deps.actions.handleInstallTool(event);
    expect(deps.fetchJSON).toHaveBeenCalledWith(
      'install-demo',
      '/api/install-tool',
      expect.objectContaining({ method: 'POST' })
    );
    expect(button.textContent).toBe('Install');
    expect(button.disabled).toBe(false);
    expect(button.dataset.state).toBeUndefined();
    expect(deps.showToast).toHaveBeenCalledWith('Unable to install Demo: boom', 'error');
    button.remove();
    errorSpy.mockRestore();
  });

  it('runs refreshScan after successful auto-fix', async () => {
    const deps = baseDeps();
    deps.fetchJSON.mockResolvedValue({ success: true, message: 'done' });

    const button = document.createElement('button');
    button.textContent = 'Fix';
    button.dataset.issueId = 'ISSUE-1';
    button.dataset.issueLabel = 'Broken thing';
    document.body.appendChild(button);
    const event = { stopPropagation: vi.fn(), currentTarget: button };

    await deps.actions.handleAutoFix(event);
    expect(deps.fetchJSON).toHaveBeenCalledWith(
      'fix-ISSUE-1',
      '/api/fix',
      expect.objectContaining({ method: 'POST' })
    );
    expect(deps.refreshScan).toHaveBeenCalledTimes(1);
    expect(button.textContent).toBe('Fixed');
    button.remove();
  });
});
