import { describe, expect, it, vi } from 'vitest';
import { _resetOpenWindows, handleCommand } from './commands';

function navigation(overrides: Record<string, unknown> = {}) {
  return {
    getUrl: (path: string) => `chrome-extension://atlas/${path}`,
    createTab: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe('background commands', () => {
  it('opens exactly one extension search tab for search-newtab', async () => {
    const createTab = vi.fn(async () => undefined);
    const handled = await handleCommand('search-newtab', {
      getUrl: (path) => `chrome-extension://atlas/${path}`,
      createTab,
    });

    expect(handled).toBe(true);
    expect(createTab).toHaveBeenCalledOnce();
    expect(createTab).toHaveBeenCalledWith({
      url: 'chrome-extension://atlas/search.html',
    });
  });

  it('opens the side panel in the invoking tab window and requests search focus', async () => {
    _resetOpenWindows();
    const openSidePanel = vi.fn(async () => undefined);
    const focusSidePanel = vi.fn(async () => undefined);
    const adapter = navigation({ openSidePanel, focusSidePanel });

    expect(await handleCommand('search-sidebar', adapter, { windowId: 73 })).toBe(true);

    expect(openSidePanel).toHaveBeenCalledOnce();
    expect(openSidePanel).toHaveBeenCalledWith({ windowId: 73 });
    expect(focusSidePanel).toHaveBeenCalledOnce();
    expect(adapter.createTab).not.toHaveBeenCalled();
  });

  it('closes the side panel when the shortcut is pressed again (toggle)', async () => {
    _resetOpenWindows();
    const openSidePanel = vi.fn(async () => undefined);
    const closeSidePanel = vi.fn(async () => undefined);
    const adapter = navigation({ openSidePanel, closeSidePanel });

    // First press opens
    await handleCommand('search-sidebar', adapter, { windowId: 73 });
    expect(openSidePanel).toHaveBeenCalledWith({ windowId: 73 });
    expect(closeSidePanel).not.toHaveBeenCalled();

    // Second press closes (toggle)
    await handleCommand('search-sidebar', adapter, { windowId: 73 });
    expect(openSidePanel).toHaveBeenCalledOnce();
    expect(closeSidePanel).toHaveBeenCalledOnce();
    expect(closeSidePanel).toHaveBeenCalledWith({ windowId: 73 });
  });

  it('falls back to a search tab with a visible-notice flag when the API is missing', async () => {
    _resetOpenWindows();
    const adapter = navigation();

    expect(await handleCommand('search-sidebar', adapter, { windowId: 73 })).toBe(true);
    expect(adapter.createTab).toHaveBeenCalledOnce();
    expect(adapter.createTab).toHaveBeenCalledWith({
      url: 'chrome-extension://atlas/search.html?notice=side-panel-unavailable',
    });
  });

  it('falls back when Chrome rejects the side-panel request', async () => {
    _resetOpenWindows();
    const openSidePanel = vi.fn(async () => Promise.reject(new Error('Unavailable')));
    const adapter = navigation({ openSidePanel });

    expect(await handleCommand('search-sidebar', adapter, { windowId: 18 })).toBe(true);
    expect(openSidePanel).toHaveBeenCalledWith({ windowId: 18 });
    expect(adapter.createTab).toHaveBeenCalledOnce();
  });

  it('ignores commands owned by Chrome or other handlers', async () => {
    const createTab = vi.fn(async () => undefined);
    expect(
      await handleCommand('_execute_action', {
        getUrl: (path) => path,
        createTab,
      }),
    ).toBe(false);
    expect(createTab).not.toHaveBeenCalled();
  });
});
