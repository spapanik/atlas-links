import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { initializeAppearance } from '../theme/appearance';
import { useBookmarks } from '../ui/useBookmarks';
import { SearchSurface } from './SearchSurface';
import '../ui/styles.css';
import './search.css';

function SearchPage() {
  const { store, error } = useBookmarks();
  const notice =
    new URLSearchParams(window.location.search).get('notice') === 'side-panel-unavailable'
      ? 'The side panel could not open, so search is available in this tab instead.'
      : '';
  return (
    <SearchSurface
      bookmarks={store?.bookmarks ?? []}
      loading={!store && !error}
      error={error}
      notice={notice}
      onOpenLibrary={() => void chrome.runtime.openOptionsPage()}
    />
  );
}

async function mount() {
  await initializeAppearance();
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <SearchPage />
    </StrictMode>,
  );
}

void mount();
