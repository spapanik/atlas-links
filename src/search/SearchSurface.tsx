import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { Bookmark } from '../domain/model';
import { searchBookmarks } from '../domain/search';
import { Logo } from '../ui/Logo';
import { CollapsibleTagFilter } from '../ui/CollapsibleTagFilter';
import { getSearchKeyboardAction, openResult } from './keyboard';

export function SearchSurface({
  bookmarks,
  loading,
  error,
  onOpenLibrary,
  navigateCurrent = (url) => window.location.assign(url),
  initialQuery = '',
  initialTags = [],
  mode = 'page',
  notice = '',
  focusEvents = false,
}: {
  bookmarks: Bookmark[];
  loading: boolean;
  error: string;
  onOpenLibrary: () => void;
  navigateCurrent?: (url: string) => void;
  initialQuery?: string;
  initialTags?: string[];
  mode?: 'page' | 'panel';
  notice?: string;
  focusEvents?: boolean;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [selectedTags, setSelectedTags] = useState(initialTags);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const tags = useMemo(
    () =>
      [...new Set(bookmarks.filter((bookmark) => !bookmark.deletedAt).flatMap((b) => b.tags))].sort(
        (a, b) => a.localeCompare(b),
      ),
    [bookmarks],
  );
  const results = useMemo(
    () => searchBookmarks(bookmarks, query, selectedTags),
    [bookmarks, query, selectedTags],
  );
  const hasBookmarks = bookmarks.some((bookmark) => !bookmark.deletedAt);

  useEffect(() => {
    const focusSearch = () => {
      inputRef.current?.focus();
      inputRef.current?.select();
    };
    const handleVisibility = () => {
      if (!document.hidden) focusSearch();
    };
    focusSearch();
    if (!focusEvents) return;
    window.addEventListener('focus', focusSearch);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('focus', focusSearch);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [focusEvents]);

  useEffect(() => {
    if (activeIndex >= 0) {
      document.getElementById(`search-result-${activeIndex}`)?.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex]);

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return;
    const next = getSearchKeyboardAction(event.key, activeIndex, results.length, Boolean(query));
    if (!next.handled) return;
    event.preventDefault();
    setActiveIndex(next.activeIndex);
    if (next.action === 'clear-query') setQuery('');
    if (next.action === 'open') openResult(results, next.activeIndex, navigateCurrent);
  }

  function toggleTag(tag: string) {
    setActiveIndex(-1);
    setSelectedTags((current) =>
      current.includes(tag) ? current.filter((selected) => selected !== tag) : [...current, tag],
    );
  }

  return (
    <div className={`search-shell ${mode === 'panel' ? 'side-panel' : ''}`}>
      <header className="search-topbar">
        <div className="brand">
          <Logo />
          <strong>Atlas Links</strong>
        </div>
        <button className="secondary" onClick={onOpenLibrary}>
          Open full library
        </button>
      </header>
      <main className="search-page">
        {notice && (
          <p className="search-notice" role="status">
            {notice}
          </p>
        )}
        <section className="search-intro" aria-labelledby="search-title">
          <p className="eyebrow">YOUR COLLECTION</p>
          <h1 id="search-title">Search your links</h1>
          <label className="search-field">
            <span className="sr-only">Search bookmark names and descriptions</span>
            <input
              ref={inputRef}
              autoFocus
              type="search"
              value={query}
              placeholder="Search names and descriptions…"
              aria-controls="search-results"
              aria-describedby="search-keyboard-help"
              onChange={(event) => {
                setQuery(event.currentTarget.value);
                setActiveIndex(-1);
              }}
              onKeyDown={handleKeyDown}
            />
          </label>
          <span className="sr-only" id="search-keyboard-help">
            Use the up and down arrow keys to select a result, Enter to open it, and Escape to clear
            the selection or search.
          </span>
          <span className="sr-only" aria-live="polite">
            {activeIndex >= 0 && results[activeIndex]
              ? `Selected ${results[activeIndex].name}`
              : ''}
          </span>
        </section>

        {selectedTags.length > 0 && (
          <section className="selected-filters" aria-label="Selected tag filters">
            {selectedTags.map((tag) => (
              <button
                className="selected-tag"
                key={tag}
                aria-label={`Remove ${tag} filter`}
                onClick={() => toggleTag(tag)}
              >
                <span>{tag}</span>
                <span aria-hidden="true">×</span>
              </button>
            ))}
          </section>
        )}

        {tags.length > 0 && (
          <CollapsibleTagFilter
            className="tag-picker"
            label="Tags"
            tags={tags}
            selectedTags={selectedTags}
            onToggleTag={toggleTag}
          />
        )}

        <div className="search-summary" aria-live="polite">
          <h2>
            {results.length} result{results.length === 1 ? '' : 's'}
          </h2>
          {(query || selectedTags.length > 0) && (
            <button
              className="clear-search"
              onClick={() => {
                setQuery('');
                setSelectedTags([]);
                setActiveIndex(-1);
              }}
            >
              Clear search
            </button>
          )}
        </div>

        {error ? (
          <p role="alert" className="error search-state">
            {error}
          </p>
        ) : loading ? (
          <p role="status" className="search-state">
            Loading your atlas…
          </p>
        ) : results.length === 0 ? (
          <section className="search-state" role="status">
            <h2>{hasBookmarks ? 'No paths found' : 'Your atlas is empty'}</h2>
            <p>
              {hasBookmarks
                ? 'Try a different search or remove a tag filter.'
                : 'Use the extension popup on any page to save your first link.'}
            </p>
          </section>
        ) : (
          <ul className="search-results" id="search-results" aria-label="Bookmark results">
            {results.map((bookmark, index) => (
              <li
                id={`search-result-${index}`}
                key={bookmark.id}
                className={activeIndex === index ? 'active' : ''}
              >
                <div className="result-copy">
                  <a
                    className="result-title"
                    href={bookmark.url}
                    onClick={(event) => {
                      if (
                        event.button === 0 &&
                        !event.altKey &&
                        !event.ctrlKey &&
                        !event.metaKey &&
                        !event.shiftKey
                      ) {
                        event.preventDefault();
                        navigateCurrent(bookmark.url);
                      }
                    }}
                    onFocus={() => setActiveIndex(index)}
                  >
                    {bookmark.name}
                  </a>
                  <span className="result-host">{new URL(bookmark.url).hostname}</span>
                  {bookmark.description && <p>{bookmark.description}</p>}
                  {bookmark.tags.length > 0 && (
                    <div className="result-tags" aria-label="Tags">
                      {bookmark.tags.map((tag) => (
                        <span className="tag" key={tag}>
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <a
                  className="new-tab-link"
                  href={bookmark.url}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`Open ${bookmark.name} in a new tab`}
                  onFocus={() => setActiveIndex(index)}
                >
                  New tab
                </a>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
