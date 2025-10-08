export function createAssistantLoader({ importAssistant, getDependencies, onLoadError } = {}) {
  if (typeof importAssistant !== 'function') {
    throw new Error('importAssistant must be a function');
  }
  if (typeof getDependencies !== 'function') {
    throw new Error('getDependencies must be a function');
  }

  let assistantActions = null;
  let loadPromise = null;

  async function ensureActions() {
    if (assistantActions) {
      return assistantActions;
    }

    if (!loadPromise) {
      loadPromise = importAssistant()
        .then(module => {
          if (!module || typeof module.createAssistantActions !== 'function') {
            throw new Error('Assistant module is missing createAssistantActions export');
          }
          const deps = getDependencies();
          assistantActions = module.createAssistantActions(deps);
          return assistantActions;
        })
        .catch(error => {
          console.error('Failed to load assistant module', error);
          throw error;
        })
        .finally(() => {
          loadPromise = null;
        });
    }

    return loadPromise;
  }

  function handleError(error) {
    if (typeof onLoadError === 'function') {
      onLoadError(error);
    }
  }

  function createHandler(actionName) {
    return async event => {
      if (event && typeof event.stopPropagation === 'function') {
        event.stopPropagation();
      }

      try {
        const assistant = await ensureActions();
        const handler = assistant?.[actionName];
        if (typeof handler !== 'function') {
          throw new Error(`Assistant action "${actionName}" is unavailable`);
        }
        return await handler(event);
      } catch (error) {
        handleError(error);
      }
    };
  }

  async function preload() {
    try {
      await ensureActions();
    } catch (error) {
      // Swallow preload errors; user interaction will surface them via onLoadError.
    }
  }

  function resetForTests() {
    assistantActions = null;
    loadPromise = null;
  }

  return {
    ensureActions,
    createHandler,
    preload,
    resetForTests
  };
}
