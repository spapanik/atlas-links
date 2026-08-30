export const SEARCH_PAGE = 'search.html';
export const SIDE_PANEL_FALLBACK_PAGE = `${SEARCH_PAGE}?notice=side-panel-unavailable`;
export const FOCUS_SIDE_PANEL_MESSAGE = 'focus-side-panel-search';

export type CommandTab = {
  windowId?: number;
};

export interface CommandNavigation {
  getUrl(path: string): string;
  createTab(properties: { url: string }): Promise<unknown>;
  openSidePanel?(properties: { windowId: number }): Promise<unknown>;
  closeSidePanel?(properties: { windowId: number }): Promise<unknown>;
  focusSidePanel?(): Promise<unknown>;
}

const openWindows = new Set<number>();

export function _resetOpenWindows() {
  openWindows.clear();
}

export async function handleCommand(
  command: string,
  navigation: CommandNavigation,
  tab: CommandTab = {},
) {
  if (command === 'search-newtab') {
    await navigation.createTab({ url: navigation.getUrl(SEARCH_PAGE) });
    return true;
  }

  if (command !== 'search-sidebar') return false;

  const windowId = typeof tab.windowId === 'number' ? tab.windowId : undefined;

  if (windowId !== undefined && openWindows.has(windowId)) {
    openWindows.delete(windowId);
    await navigation.closeSidePanel?.({ windowId });
    return true;
  }

  if (navigation.openSidePanel && windowId !== undefined) {
    try {
      await navigation.openSidePanel({ windowId });
      openWindows.add(windowId);
      void navigation.focusSidePanel?.().catch(() => undefined);
      return true;
    } catch {
      // The fallback below keeps search available when Chrome rejects sidePanel.open().
    }
  }

  await navigation.createTab({ url: navigation.getUrl(SIDE_PANEL_FALLBACK_PAGE) });
  return true;
}
