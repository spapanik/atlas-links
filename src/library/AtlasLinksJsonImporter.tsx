import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import type { AtlasLinksImportResult } from '../data/repository';
import type { Bookmark } from '../domain/model';
import {
  AtlasLinksImportError,
  MAX_ATLAS_LINKS_FILE_BYTES,
  parseAtlasLinksExport,
  prepareAtlasLinksImport,
  type AtlasLinksImportPreview,
  type AtlasLinksImportRecord,
  type ParsedAtlasLinksExport,
} from '../import/atlasLinks';

type AtlasLinksJsonImporterProps = {
  existingBookmarks: readonly Bookmark[];
  onClose: () => void;
  onImport: (bookmarks: readonly AtlasLinksImportRecord[]) => Promise<AtlasLinksImportResult>;
  onOverwrite: (bookmarks: readonly AtlasLinksImportRecord[]) => Promise<AtlasLinksImportResult>;
};

function excerpt(value: string, fallback: string): string {
  const compact = value.trim().replace(/\s+/g, ' ');
  return compact ? `${compact.slice(0, 100)}${compact.length > 100 ? '…' : ''}` : fallback;
}

export function AtlasLinksImportReview({
  parsed,
  preview,
}: {
  parsed: ParsedAtlasLinksExport;
  preview: AtlasLinksImportPreview;
}) {
  const details = [
    ...preview.newBookmarks.map(({ record }) => ({
      label: excerpt(record.name, record.url),
      status: 'New bookmark',
    })),
    ...preview.updated.map(({ record, changes }) => ({
      label: excerpt(record.name, record.url),
      status: `Update ${changes.join(', ')}`,
    })),
    ...preview.unchanged.map(({ record }) => ({
      label: excerpt(record.name, record.url),
      status: 'No changes',
    })),
    ...preview.conflicts.map(({ record, reason }) => ({
      label: excerpt(record.name, record.url),
      status: reason,
    })),
    ...parsed.invalid.map((record) => ({
      label: excerpt(
        record.name,
        record.id ? `Bookmark ${record.id}` : `Entry ${record.index + 1}`,
      ),
      status: record.reason,
    })),
  ];
  return (
    <section className="import-review" aria-labelledby="atlas-import-review-title">
      <h3 id="atlas-import-review-title">Review Atlas Links import</h3>
      <dl className="import-summary atlas-import-summary">
        <div>
          <dt>New</dt>
          <dd>{preview.newBookmarks.length}</dd>
        </div>
        <div>
          <dt>Updated</dt>
          <dd>{preview.updated.length}</dd>
        </div>
        <div>
          <dt>Unchanged</dt>
          <dd>{preview.unchanged.length}</dd>
        </div>
        <div>
          <dt>Conflicts</dt>
          <dd>{preview.conflicts.length}</dd>
        </div>
        <div>
          <dt>Invalid</dt>
          <dd>{parsed.invalid.length}</dd>
        </div>
      </dl>
      {details.length > 0 && (
        <ul className="import-details" aria-label="Atlas Links import details">
          {details.slice(0, 15).map((detail, index) => (
            <li key={`${detail.label}-${detail.status}-${index}`}>
              <span>{detail.label}</span>
              <small>{detail.status}</small>
            </li>
          ))}
        </ul>
      )}
      {details.length > 15 && <p className="muted">Showing the first 15 review details.</p>}
      <p className="muted">
        Missing bookmarks are left unchanged. Conflicted and invalid records will not be applied.
      </p>
    </section>
  );
}

export function AtlasLinksJsonImporter({
  existingBookmarks,
  onClose,
  onImport,
  onOverwrite,
}: AtlasLinksJsonImporterProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const completionRef = useRef<HTMLDivElement>(null);
  const busyRef = useRef(false);
  const [importMode, setImportMode] = useState<'merge' | 'overwrite'>('merge');
  const [fileName, setFileName] = useState('');
  const [parsed, setParsed] = useState<ParsedAtlasLinksExport>();
  const [preview, setPreview] = useState<AtlasLinksImportPreview>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [busyMessage, setBusyMessage] = useState('');
  const [overwriteChecked, setOverwriteChecked] = useState(false);
  const [completion, setCompletion] = useState<{
    created: number;
    updated: number;
    unchanged: number;
    notApplied: number;
  }>();

  const changeCount =
    importMode === 'overwrite'
      ? (parsed?.bookmarks.length ?? 0)
      : (preview?.newBookmarks.length ?? 0) + (preview?.updated.length ?? 0);

  useEffect(() => inputRef.current?.focus(), []);
  useEffect(() => {
    if (completion) completionRef.current?.focus();
    else if (changeCount > 0) confirmButtonRef.current?.focus();
  }, [changeCount, completion]);

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
    setParsed(undefined);
    setPreview(undefined);
    setCompletion(undefined);
    setOverwriteChecked(false);
    setError('');
    if (!/\.json$/i.test(file.name)) {
      setError('Choose an Atlas Links file ending in .json.');
      return;
    }
    if (file.size > MAX_ATLAS_LINKS_FILE_BYTES) {
      setError('The Atlas Links file is larger than 5 MB.');
      return;
    }
    setImportBusy(true, 'Reading Atlas Links JSON…');
    try {
      const nextParsed = parseAtlasLinksExport(await file.text());
      setParsed(nextParsed);
      setPreview(prepareAtlasLinksImport(nextParsed.bookmarks, existingBookmarks));
    } catch (cause) {
      setError(
        cause instanceof AtlasLinksImportError
          ? cause.message
          : 'Atlas Links could not read this JSON file.',
      );
    } finally {
      setImportBusy(false);
    }
  }

  async function confirmImport() {
    if (!parsed || (importMode === 'merge' && !preview) || changeCount === 0 || busyRef.current)
      return;

    setImportBusy(
      true,
      importMode === 'overwrite' ? 'Replacing all bookmarks…' : 'Applying Atlas Links changes…',
    );
    setError('');
    try {
      if (importMode === 'overwrite') {
        const result = await onOverwrite(parsed.bookmarks);
        setCompletion({
          created: result.created.length,
          updated: 0,
          unchanged: 0,
          notApplied: parsed.invalid.length,
        });
      } else {
        const approvedRecords = [...preview!.newBookmarks, ...preview!.updated].map(
          (proposal) => proposal.record,
        );
        const result = await onImport(approvedRecords);
        setCompletion({
          created: result.created.length,
          updated: result.updated.length,
          unchanged: preview!.unchanged.length + result.unchanged,
          notApplied: parsed.invalid.length + preview!.conflicts.length + result.conflicts.length,
        });
      }
    } catch {
      setError(
        'The Atlas Links import could not be saved. Your bookmarks were not changed. Try again.',
      );
    } finally {
      setImportBusy(false);
    }
  }

  return (
    <section
      ref={dialogRef}
      className="modal import-modal atlas-import-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="atlas-import-title"
      onKeyDown={handleDialogKeyDown}
    >
      <h2 id="atlas-import-title">Import Atlas Links JSON</h2>
      <p>
        Choose an Atlas Links JSON export up to 5 MB and 10,000 records. The file is processed only
        on this device.
      </p>
      <label>
        Import mode
        <select
          value={importMode}
          onChange={(e) => {
            setImportMode(e.target.value as 'merge' | 'overwrite');
            setOverwriteChecked(false);
          }}
          disabled={busy}
        >
          <option value="merge">Merge — keep existing bookmarks, add new ones</option>
          <option value="overwrite">Overwrite — replace all bookmarks</option>
        </select>
      </label>
      <label>
        Atlas Links JSON file
        <input
          ref={inputRef}
          type="file"
          accept=".json,application/json"
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
      {importMode === 'overwrite' && parsed && !completion && (
        <section className="import-review" aria-labelledby="atlas-import-review-title">
          <h3 id="atlas-import-review-title">Overwrite bookmarks</h3>
          <p className="warning">
            This will replace all {existingBookmarks.length} existing bookmarks with{' '}
            {parsed.bookmarks.length} bookmarks from the file. Any bookmarks not in the file will be
            permanently removed.
          </p>
          <label className="confirm-overwrite">
            <input
              type="checkbox"
              checked={overwriteChecked}
              onChange={(e) => setOverwriteChecked(e.currentTarget.checked)}
            />
            I understand, replace all my bookmarks
          </label>
        </section>
      )}
      {importMode === 'merge' && parsed && preview && !completion && (
        <AtlasLinksImportReview parsed={parsed} preview={preview} />
      )}
      {completion && (
        <div className="import-complete" role="status" tabIndex={-1} ref={completionRef}>
          <h3>Import complete</h3>
          <p>
            {completion.created} added, {completion.updated} updated, {completion.unchanged}{' '}
            unchanged, and {completion.notApplied} not applied.
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
            disabled={
              busy || changeCount === 0 || (importMode === 'overwrite' && !overwriteChecked)
            }
          >
            {busy ? 'Applying…' : importMode === 'overwrite' ? 'Replace all' : 'Apply changes'}
          </button>
        )}
      </div>
    </section>
  );
}
