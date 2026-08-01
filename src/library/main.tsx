import { StrictMode, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BookmarkForm } from '../ui/BookmarkForm';
import { Logo } from '../ui/Logo';
import { ThemeControl } from '../ui/ThemeControl';
import { repository, useBookmarks } from '../ui/useBookmarks';
import { searchBookmarks, type SortOrder } from '../domain/search';
import type { Bookmark } from '../domain/model';
import type { SyncStatus } from '../sync/services';
import { applyDirtyFlag, parseSyncStatus } from '../sync/status';
import { initializeAppearance } from '../theme/appearance';
import { useAppearance } from '../theme/useAppearance';
import { shortcutLabel, type ExtensionCommand } from './commands';
import { DataManagement } from './DataManagement';
import {
  CORRUPT_BACKUP_CONFIRMATION,
  sendSyncCommand,
  syncPrimaryAction,
  syncStatusLabel,
  type SyncCommand,
} from './syncControls';
import { downloadAtlasLinksExport, serializeAtlasLinksExport } from '../import/atlasLinks';
import '../ui/styles.css';
import './library.css';

const PRIVACY_POLICY_URL = 'https://atlas-links.kuma.ai/privacy/';
const SOURCE_CODE_URL = 'https://github.com/spapanik/atlas-links';

function Library() {
  const { store, error } = useBookmarks();
  const { preference, selectPreference } = useAppearance();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [sort, setSort] = useState<SortOrder>('updated');
  const [editing, setEditing] = useState<Bookmark>();
  const [sync, setSync] = useState<SyncStatus>({ state: 'signed-out' });
  const [commands, setCommands] = useState<ExtensionCommand[]>([]);
  useEffect(() => {
    chrome.storage.local.get(['syncStatus', 'syncDirty']).then((x) => {
      const status = parseSyncStatus(x.syncStatus);
      if (status) setSync(applyDirtyFlag(status, x.syncDirty));
    });
    const listener = (c: Record<string, chrome.storage.StorageChange>) => {
      const status = parseSyncStatus(c.syncStatus?.newValue);
      setSync((current) =>
        applyDirtyFlag(status ?? current, c.syncDirty ? c.syncDirty.newValue : undefined),
      );
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);
  useEffect(() => {
    chrome.commands
      .getAll()
      .then(setCommands)
      .catch(() => setCommands([]));
  }, []);
  const bookmarks = useMemo(() => store?.bookmarks ?? [], [store]);
  const tags = [...new Set(bookmarks.filter((b) => !b.deletedAt).flatMap((b) => b.tags))].sort(
    (a, b) => a.localeCompare(b),
  );
  const results = useMemo(
    () => searchBookmarks(bookmarks, query, selected, sort),
    [bookmarks, query, selected, sort],
  );
  const captureShortcut = shortcutLabel(commands, '_execute_action');
  const searchShortcut = shortcutLabel(commands, 'search-newtab');
  const sidePanelShortcut = shortcutLabel(commands, 'search-sidebar');
  async function send(type: SyncCommand) {
    if (type === 'replace-corrupt-backup' && !confirm(CORRUPT_BACKUP_CONFIRMATION)) return;
    setSync({ state: 'syncing' });
    setSync(await sendSyncCommand(type));
  }
  const syncAction = syncPrimaryAction(sync);
  return (
    <>
      <header className="topbar">
        <div className="brand">
          <Logo />
          <strong>Atlas Links</strong>
        </div>
        <div className="topbar-actions">
          <ThemeControl
            preference={preference}
            onChange={(value) => void selectPreference(value)}
          />
          <div className="sync">
            <span className={`sync-dot ${sync.state}`} aria-hidden="true" />
            <span>{syncStatusLabel(sync)}</span>
            {sync.state === 'idle' ? (
              <>
                <button className="secondary" onClick={() => void send('sync')}>
                  Sync now
                </button>
                <button className="secondary" onClick={() => void send('sign-out')}>
                  Sign out
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => void send(syncAction.command)}
                  disabled={sync.state === 'syncing'}
                >
                  {syncAction.label}
                </button>
                {sync.state === 'error' && sync.code === 'corrupt-remote' && (
                  <button className="secondary" onClick={() => void send('sign-out')}>
                    Remain local only
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </header>
      <main className="library">
        <section className="hero">
          <p className="eyebrow">YOUR COLLECTION</p>
          <h1>Find your way back.</h1>
          <p>Everything you saved, ready when you need it.</p>
        </section>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <section className="controls" aria-label="Find bookmarks">
          <input
            aria-label="Search names and descriptions"
            type="search"
            placeholder="Search your links…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select
            aria-label="Sort bookmarks"
            value={sort}
            onChange={(e) => setSort(e.target.value as SortOrder)}
          >
            <option value="updated">Recently updated</option>
            <option value="created">Recently created</option>
            <option value="name">Name A–Z</option>
          </select>
        </section>
        {tags.length > 0 && (
          <section className="filters" aria-label="Filter by tags">
            <span>Filter:</span>
            {tags.map((tag) => {
              const active = selected.includes(tag);
              return (
                <button
                  key={tag}
                  aria-pressed={active}
                  className={active ? 'active' : 'secondary'}
                  onClick={() =>
                    setSelected(active ? selected.filter((x) => x !== tag) : [...selected, tag])
                  }
                >
                  {tag}
                  {active ? ' ×' : ''}
                </button>
              );
            })}
          </section>
        )}
        <div className="collection-title">
          <h2>
            {query || selected.length
              ? `${results.length} result${results.length === 1 ? '' : 's'}`
              : 'All links'}
          </h2>
          <span>{bookmarks.filter((b) => !b.deletedAt).length} saved</span>
        </div>
        {!store ? (
          <p className="empty">Loading your atlas…</p>
        ) : results.length === 0 ? (
          <div className="empty">
            <h2>
              {bookmarks.some((b) => !b.deletedAt) ? 'No paths found' : 'Your atlas is empty'}
            </h2>
            <p>
              {bookmarks.some((b) => !b.deletedAt)
                ? 'Try a different search or remove a tag filter.'
                : 'Use the extension popup on any page to save your first link.'}
            </p>
          </div>
        ) : (
          <div className="cards">
            {results.map((b) => (
              <article key={b.id}>
                <div className="card-head">
                  <div>
                    <a href={b.url} target="_blank" rel="noreferrer">
                      <h2>{b.name}</h2>
                    </a>
                    <span className="host">{new URL(b.url).hostname}</span>
                  </div>
                  <div className="row">
                    <button className="secondary" onClick={() => setEditing(b)}>
                      Edit
                    </button>
                    <button
                      className="danger"
                      onClick={() => {
                        if (confirm(`Delete “${b.name}”?`)) void repository.remove(b.id);
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
                {b.description && <p>{b.description}</p>}
                <div className="row tags">
                  {b.tags.map((tag) => (
                    <span className="tag" key={tag}>
                      {tag}
                    </span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        )}
        <DataManagement
          bookmarks={bookmarks}
          onExport={async () => {
            const store = await repository.getStore();
            downloadAtlasLinksExport(serializeAtlasLinksExport(store));
          }}
          onImportAtlasLinks={(items) => repository.importAtlasLinks(items)}
          onImportBrowser={(items) => repository.importBrowserBookmarks(items)}
        />
        <section className="shortcut-settings" aria-labelledby="shortcuts-title">
          <div>
            <h2 id="shortcuts-title">Keyboard shortcuts</h2>
            <p>
              Save or update <kbd>{captureShortcut}</kbd>
              <span aria-hidden="true"> · </span>
              Search <kbd>{searchShortcut}</kbd>
              <span aria-hidden="true"> · </span>
              Side panel <kbd>{sidePanelShortcut}</kbd>
            </p>
            {(captureShortcut === 'Unassigned' ||
              searchShortcut === 'Unassigned' ||
              sidePanelShortcut === 'Unassigned') && (
              <p className="muted">Assign an available key combination in Chrome shortcuts.</p>
            )}
          </div>
          <button
            className="secondary"
            onClick={() => void chrome.tabs.create({ url: 'chrome://extensions/shortcuts' })}
          >
            Manage shortcuts
          </button>
        </section>
        <footer>
          <p>
            Bookmarks stay on this device by default. Google sign-in privately stores a backup in
            your Drive app-data area. Atlas Links collects no analytics or telemetry.{' '}
            <a href={PRIVACY_POLICY_URL} target="_blank" rel="noreferrer">
              Read the privacy policy.
            </a>
            {' · '}
            <a href={SOURCE_CODE_URL} target="_blank" rel="noreferrer">
              Source code.
            </a>
          </p>
        </footer>
      </main>
      {editing && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="edit-title">
            <h2 id="edit-title">Edit bookmark</h2>
            <BookmarkForm
              initial={editing}
              tagOptions={tags}
              submitLabel="Save changes"
              onCancel={() => setEditing(undefined)}
              onSubmit={async (input) => {
                await repository.update(editing.id, input);
                setEditing(undefined);
              }}
            />
          </section>
        </div>
      )}
    </>
  );
}
async function mount() {
  await initializeAppearance();
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <Library />
    </StrictMode>,
  );
}

void mount();
