import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { FOCUS_SIDE_PANEL_MESSAGE } from '../background/commands';
import { SearchSurface } from '../search/SearchSurface';
import { initializeAppearance } from '../theme/appearance';
import { useBookmarks } from '../ui/useBookmarks';
import { navigateActiveTab } from './navigation';
import '../ui/styles.css';
import '../search/search.css';
import './sidepanel.css';

function focusSearch() {
  const input = document.querySelector<HTMLInputElement>('.search-field input');
  input?.focus();
  input?.select();
}

function SidePanel() {
  const { store, error } = useBookmarks();

  useEffect(() => {
    const handleMessage = (message: unknown) => {
      if ((message as { type?: string })?.type === FOCUS_SIDE_PANEL_MESSAGE) focusSearch();
    };
    chrome.runtime.onMessage.addListener(handleMessage);
    return () => chrome.runtime.onMessage.removeListener(handleMessage);
  }, []);

  return (
    <SearchSurface
      bookmarks={store?.bookmarks ?? []}
      loading={!store && !error}
      error={error}
      mode="panel"
      focusEvents
      navigateCurrent={(url) => void navigateActiveTab(chrome.tabs, url).catch(() => undefined)}
      onOpenLibrary={() => void chrome.runtime.openOptionsPage()}
    />
  );
}

async function mount() {
  await initializeAppearance();
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <SidePanel />
    </StrictMode>,
  );
}

void mount();
