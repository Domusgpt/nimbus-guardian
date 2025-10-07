function ensureFunction(name, value) {
  if (typeof value !== 'function') {
    throw new Error(`${name} must be a function`);
  }
  return value;
}

function slugify(value = '') {
  return value
    .toString()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    || 'item';
}

export function createAssistantActions({
  fetchJSON,
  showToast,
  isOnline,
  loadTools,
  refreshScan
} = {}) {
  ensureFunction('fetchJSON', fetchJSON);
  ensureFunction('showToast', showToast);
  ensureFunction('isOnline', isOnline);
  ensureFunction('loadTools', loadTools);
  ensureFunction('refreshScan', refreshScan);

  async function handleInstallTool(event) {
    event.stopPropagation();

    const button = event.currentTarget;
    if (!button || button.dataset.state === 'busy') {
      return;
    }

    const command = button.dataset.command;
    const toolName = button.dataset.tool || 'Tool';

    if (!command) {
      showToast(`No automated install available for ${toolName}.`, 'warning');
      return;
    }

    if (!isOnline()) {
      showToast(`Cannot install ${toolName} while offline.`, 'warning');
      return;
    }

    const originalText = button.textContent;
    button.dataset.state = 'busy';
    button.dataset.originalText = originalText;
    button.textContent = 'Installing...';
    button.disabled = true;
    button.classList.add('is-busy');
    button.setAttribute('aria-busy', 'true');

    let succeeded = false;
    let aborted = false;

    try {
      const key = `install-${slugify(toolName)}`;
      const result = await fetchJSON(key, '/api/install-tool', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool: toolName, command }),
        timeout: 120_000
      });

      if (result?.success) {
        succeeded = true;
        showToast(`${toolName} installed successfully.`, 'success');
        try {
          await loadTools();
        } catch (refreshError) {
          console.error('Tool installed but refresh failed', refreshError);
          showToast('Tool installed, but refreshing tool insights failed.', 'warning');
        }
      } else {
        const reason = result?.message || 'Installation failed.';
        throw new Error(reason);
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        aborted = true;
      } else {
        console.error(`Failed to install ${toolName}`, error);
        const variant = error.name === 'TimeoutError' ? 'warning' : 'error';
        const message = error.name === 'TimeoutError'
          ? `Installing ${toolName} timed out.`
          : `Unable to install ${toolName}: ${error.message}`;
        showToast(message, variant);
      }
    } finally {
      if (!button.isConnected) {
        return;
      }

      button.removeAttribute('aria-busy');
      button.classList.remove('is-busy');

      if (succeeded) {
        button.textContent = 'Installed';
        button.disabled = true;
        button.dataset.state = 'done';
      } else {
        const storedOriginal = button.dataset.originalText;
        button.textContent = storedOriginal || originalText;
        button.disabled = false;
        if (!aborted) {
          delete button.dataset.state;
        }
      }

      delete button.dataset.originalText;
    }
  }

  async function handleAutoFix(event) {
    event.stopPropagation();

    const button = event.currentTarget;
    if (!button || button.dataset.state === 'busy') {
      return;
    }

    const issueId = button.dataset.issueId;
    if (!issueId) {
      showToast('Unable to determine which issue to auto-fix.', 'error');
      return;
    }

    const issueLabel = button.dataset.issueLabel || issueId;
    const originalText = button.textContent;

    if (!isOnline()) {
      showToast(`Cannot auto-fix ${issueLabel} while offline.`, 'warning');
      return;
    }

    button.dataset.state = 'busy';
    button.dataset.originalText = originalText;
    button.textContent = 'Fixing...';
    button.disabled = true;
    button.classList.add('is-busy');
    button.setAttribute('aria-busy', 'true');

    let succeeded = false;

    try {
      const result = await fetchJSON(`fix-${issueId}`, '/api/fix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ issueId }),
        timeout: 60_000
      });

      if (result?.success) {
        succeeded = true;
        const detail = result.message ? `: ${result.message}` : '';
        showToast(`Auto-fix applied to ${issueLabel}${detail}`, 'success');
        try {
          await refreshScan();
        } catch (refreshError) {
          console.error('Auto-fix applied but refresh failed', refreshError);
          showToast('Auto-fix applied, but refreshing data failed. Please rescan manually.', 'warning');
        }
      } else {
        const reason = result?.message || 'No auto-fix available for this issue.';
        throw new Error(reason);
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        return;
      }
      console.error(`Auto-fix failed for ${issueId}`, error);
      const variant = error.name === 'TimeoutError' ? 'warning' : 'error';
      const message = error.name === 'TimeoutError'
        ? `Auto-fix timed out for ${issueLabel}.`
        : `Auto-fix failed for ${issueLabel}: ${error.message}`;
      showToast(message, variant);
    } finally {
      if (!button.isConnected) {
        return;
      }

      button.removeAttribute('aria-busy');
      button.classList.remove('is-busy');
      delete button.dataset.state;

      const storedOriginal = button.dataset.originalText;
      delete button.dataset.originalText;

      if (succeeded) {
        button.textContent = 'Fixed';
        button.disabled = true;
      } else {
        button.textContent = storedOriginal || originalText;
        button.disabled = false;
      }
    }
  }

  return { handleInstallTool, handleAutoFix };
}
