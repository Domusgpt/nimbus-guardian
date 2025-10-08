import { afterEach, vi } from 'vitest';

if (!globalThis.fetch) {
  globalThis.fetch = vi.fn();
}

afterEach(() => {
  vi.restoreAllMocks();
});
