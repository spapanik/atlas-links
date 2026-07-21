import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import type { BrowserImportResult } from '../data/repository';
import type { Bookmark } from '../domain/model';
import {
  BrowserBookmarkImportError,
  MAX_BROWSER_BOOKMARK_FILE_BYTES,
  parseBrowserBookmarksHtml,
  prepareBrowserBookmarkImport,
  type BrowserBookmarkImport,
  type BrowserBookmarkPreview,
} from '../import/browserBookmarks';

type BrowserBookmarksImporterProps = {
  existingBookmarks: readonly Bookmark[];
  onClose: () => void;
  onImport: (bookmarks: readonly BrowserBookmarkImport[]) => Promise<BrowserImportResult>;
};

function excerpt(value: string, fallback: string): string {
  const compact = value.trim().replace(/\s+/g, ' ');
  return compact ? `${compact.slice(0, 100)}${compact.length > 100 ? '…' : ''}` : fallback;
}

export function BrowserImportReview({ preview }: { preview: BrowserBookmarkPreview }) {
  const details = [
    ...preview.newBookmarks.slice(0, 5).map((bookmark) => ({
      label: excerpt(bookmark.name, bookmark.url),
      status: 'Ready to import',
    })),
    ...preview.duplicates.slice(0, 5).map((bookmark) => ({
      label: excerpt(bookmark.name, bookmark.url),
      status: bookmark.reason === 'already-saved' ? 'Already saved' : 'Repeated in this export',
    })),
    ...preview.invalid.slice(0, 5).map((bookmark) => ({
      label: excerpt(bookmark.name, excerpt(bookmark.url, 'Malformed bookmark')),
      status: bookmark.reason,
    })),
  ];
  return (
    <section className="import-review" aria-labelledby="import-review-title">
      <h3 id="import-review-title">Review import</h3>
      <dl className="import-summary">
        <div>
          <dt>Total links found</dt>
          <dd>{preview.totalFound}</dd>
        </div>
        <div>
          <dt>New bookmarks</dt>
          <dd>{preview.newBookmarks.length}</dd>
        </div>
        <div>
          <dt>Duplicates skipped</dt>
          <dd>{preview.duplicates.length}</dd>
        </div>
        <div>
          <dt>Invalid or unsupported</dt>
          <dd>{preview.invalid.length}</dd>
        </div>
      </dl>
      {details.length > 0 && (
        <ul className="import-details" aria-label="Sample import details">
          {details.map((detail, index) => (
            <li key={`${detail.label}-${detail.status}-${index}`}>
              <span>{detail.label}</span>
              <small>{detail.status}</small>
            </li>
          ))}
        </ul>
      )}
      {preview.totalFound > details.length && (
        <p className="muted">Showing the first {details.length} review details.</p>
      )}
      <p className="muted">Imported browser folders are ignored. New bookmarks receive no tags.</p>
    </section>
  );
}

export function BrowserBookmarksImporter({
  existingBookmarks,
  onClose,
  onImport,
}: BrowserBookmarksImporterProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const completionRef = useRef<HTMLDivElement>(null);
  const busyRef = useRef(false);
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState<BrowserBookmarkPreview>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [busyMessage, setBusyMessage] = useState('');
  const [completion, setCompletion] = useState<{ imported: number; skipped: number }>();

  useEffect(() => inputRef.current?.focus(), []);
  useEffect(() => {
    if (completion) completionRef.current?.focus();
    else if (preview) confirmButtonRef.current?.focus();
  }, [completion, preview]);

  function setImportBusy(value: boolean, message = '') {
    busyRef.current = value;
    setBusy(value);
    setBusyMessage(message);
  }

  function handleDialogKeyDown(event: React.KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape' && !busyRef.current) {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [
      ...(dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"])',
      ) ?? []),
    ];
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  async function selectFile(event: ChangeEvent<HTMLInputElement>) {
    if (busyRef.current) return;
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setPreview(undefined);
    setCompletion(undefined);
    setError('');
    if (!/\.html?$/i.test(file.name)) {
      setError('Choose a browser bookmarks file ending in .html or .htm.');
      return;
    }
    if (file.size > MAX_BROWSER_BOOKMARK_FILE_BYTES) {
      setError('The bookmarks file is larger than 5 MB.');
      return;
    }
    setImportBusy(true, 'Reading bookmarks…');
    try {
      const parsed = parseBrowserBookmarksHtml(await file.text());
      setPreview(prepareBrowserBookmarkImport(parsed, existingBookmarks));
    } catch (cause) {
      setError(
        cause instanceof BrowserBookmarkImportError
          ? cause.message
          : 'Atlas Links could not read this bookmarks file.',
      );
    } finally {
      setImportBusy(false);
    }
  }

  async function confirmImport() {
    if (!preview || preview.newBookmarks.length === 0 || busyRef.current) return;
    setImportBusy(true, 'Importing bookmarks…');
    setError('');
    try {
      const result = await onImport(preview.newBookmarks);
      setCompletion({
        imported: result.imported.length,
        skipped: preview.duplicates.length + preview.invalid.length + result.skipped,
      });
    } catch {
      setError(
        'The import could not be saved. Your existing bookmarks were not changed. Try again.',
      );
    } finally {
      setImportBusy(false);
    }
  }

  return (
    <section
      ref={dialogRef}
      className="modal import-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-title"
      onKeyDown={handleDialogKeyDown}
    >
      <h2 id="import-title">Import browser bookmarks</h2>
      <p>
        Choose an HTML bookmarks export from Chrome, Edge, Firefox, or Safari. Atlas Links reads it
        only on this device. Files can be up to 5 MB and contain up to 10,000 links.
      </p>
      <label>
        Bookmarks HTML file
        <input
          ref={inputRef}
          type="file"
          accept=".html,.htm,text/html"
          onChange={(event) => void selectFile(event)}
          disabled={busy}
        />
      </label>
      {fileName && <p className="selected-file">Selected: {fileName}</p>}
      {busy && !completion && <p role="status">{busyMessage}</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {preview && !completion && <BrowserImportReview preview={preview} />}
      {completion && (
        <div className="import-complete" role="status" tabIndex={-1} ref={completionRef}>
          <h3>Import complete</h3>
          <p>
            {completion.imported} bookmark{completion.imported === 1 ? '' : 's'} imported.{' '}
            {completion.skipped} skipped.
          </p>
        </div>
      )}
      <div className="form-actions">
        <button className="secondary" type="button" onClick={onClose} disabled={busy}>
          {completion ? 'Close' : 'Cancel'}
        </button>
        {!completion && (
          <button
            ref={confirmButtonRef}
            type="button"
            onClick={() => void confirmImport()}
            disabled={busy || !preview || preview.newBookmarks.length === 0}
          >
            {busy ? 'Importing…' : 'Import bookmarks'}
          </button>
        )}
      </div>
    </section>
  );
}
