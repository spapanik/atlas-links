import { StrictMode, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BookmarkForm } from '../ui/BookmarkForm';
import { Logo } from '../ui/Logo';
import { repository, useBookmarks } from '../ui/useBookmarks';
import { initializeAppearance } from '../theme/appearance';
import { resolveCaptureState, type CaptureTab } from './capture';
import '../ui/styles.css';
import './popup.css';

function Popup() {
  const { store, error } = useBookmarks();
  const [activeTab, setActiveTab] = useState<CaptureTab | null>();
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    chrome.tabs
      .query({ active: true, currentWindow: true })
      .then(([tab]) => setActiveTab(tab ? { title: tab.title, url: tab.url } : null))
      .catch(() => setActiveTab(null));
  }, []);

  const capture = useMemo(
    () =>
      store && activeTab !== undefined ? resolveCaptureState(activeTab, store.bookmarks) : null,
    [store, activeTab],
  );
  const tags = [
    ...new Set(
      store?.bookmarks.filter((bookmark) => !bookmark.deletedAt).flatMap((b) => b.tags) ?? [],
    ),
  ].sort();
  const existing = capture?.kind === 'existing' ? capture.bookmark : undefined;

  return (
    <main>
      <header>
        <div className="brand">
          <Logo />
          <div>
            <strong>Atlas Links</strong>
            <small>Save a place worth returning to.</small>
          </div>
        </div>
        <button className="library-link" onClick={() => chrome.runtime.openOptionsPage()}>
          Open library
        </button>
      </header>
      {error ? (
        <p role="alert" className="error">
          {error}
        </p>
      ) : saved ? (
        <section className="success">
          <span>✓</span>
          <h1>Saved to your atlas</h1>
          <button className="secondary" onClick={() => window.close()}>
            Done
          </button>
        </section>
      ) : !capture ? (
        <p className="loading" role="status">
          Reading the current page…
        </p>
      ) : capture.kind === 'unsupported' ? (
        <section className="unsupported" aria-labelledby="unsupported-title">
          <h1 id="unsupported-title">This page can’t be saved</h1>
          <p>Atlas Links can save HTTP and HTTPS pages. Open a web page and try again.</p>
          <button className="secondary" onClick={() => chrome.runtime.openOptionsPage()}>
            Open library
          </button>
        </section>
      ) : (
        <>
          <h1>{existing ? 'Update this link' : 'Save this link'}</h1>
          {existing && <p className="notice">This URL is already saved. Saving will update it.</p>}
          <BookmarkForm
            key={existing?.id ?? capture.input.url}
            initial={capture.input}
            tagOptions={tags}
            submitLabel={existing ? 'Update link' : 'Save link'}
            focusName
            onSubmit={async (input) => {
              if (existing) await repository.update(existing.id, input);
              else await repository.create(input);
              setSaved(true);
            }}
          />
        </>
      )}
    </main>
  );
}

async function mount() {
  await initializeAppearance();
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <Popup />
    </StrictMode>,
  );
}

void mount();
