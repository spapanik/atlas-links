export interface PanelTabs {
  query(properties: { active: true; currentWindow: true }): Promise<Array<{ id?: number }>>;
  update(tabId: number, properties: { url: string }): Promise<unknown>;
}

export async function navigateActiveTab(tabs: PanelTabs, url: string) {
  const [activeTab] = await tabs.query({ active: true, currentWindow: true });
  if (typeof activeTab?.id !== 'number') throw new Error('No active browser tab is available.');
  await tabs.update(activeTab.id, { url });
}
