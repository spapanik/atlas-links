import { describe, expect, it, vi } from 'vitest';
import { navigateActiveTab } from './navigation';

describe('side-panel result navigation', () => {
  it('updates the active tab in the panel window', async () => {
    const query = vi.fn(async () => [{ id: 42 }]);
    const update = vi.fn(async () => undefined);

    await navigateActiveTab({ query, update }, 'https://example.com/path');

    expect(query).toHaveBeenCalledWith({ active: true, currentWindow: true });
    expect(update).toHaveBeenCalledWith(42, { url: 'https://example.com/path' });
  });

  it('does not navigate when the window has no active tab', async () => {
    const update = vi.fn(async () => undefined);
    await expect(
      navigateActiveTab({ query: async () => [], update }, 'https://example.com'),
    ).rejects.toThrow('No active browser tab');
    expect(update).not.toHaveBeenCalled();
  });
});
