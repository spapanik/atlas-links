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
  focusSidePanel?(): Promise<unknown>;
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
  if (navigation.openSidePanel && typeof tab.windowId === 'number') {
    try {
      await navigation.openSidePanel({ windowId: tab.windowId });
      void navigation.focusSidePanel?.().catch(() => undefined);
      return true;
    } catch {
      // The fallback below keeps search available when Chrome rejects sidePanel.open().
    }
  }

  await navigation.createTab({ url: navigation.getUrl(SIDE_PANEL_FALLBACK_PAGE) });
  return true;
}
