import { useRef, useState } from 'react';
import type { AtlasLinksImportResult, BrowserImportResult } from '../data/repository';
import type { Bookmark } from '../domain/model';
import type { AtlasLinksImportRecord } from '../import/atlasLinks';
import type { BrowserBookmarkImport } from '../import/browserBookmarks';
import { AtlasLinksJsonImporter } from './AtlasLinksJsonImporter';
import { BrowserBookmarksImporter } from './BrowserBookmarksImporter';

type DataManagementProps = {
  bookmarks: readonly Bookmark[];
  onExport: () => Promise<void>;
  onImportAtlasLinks: (
    bookmarks: readonly AtlasLinksImportRecord[],
  ) => Promise<AtlasLinksImportResult>;
  onImportBrowser: (bookmarks: readonly BrowserBookmarkImport[]) => Promise<BrowserImportResult>;
};

export function DataManagement({
  bookmarks,
  onExport,
  onImportAtlasLinks,
  onImportBrowser,
}: DataManagementProps) {
  const [dialog, setDialog] = useState<'browser' | 'atlas'>();
  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState('');
  const exportingRef = useRef(false);
  const browserButtonRef = useRef<HTMLButtonElement>(null);
  const atlasButtonRef = useRef<HTMLButtonElement>(null);

  function closeDialog() {
    const previous = dialog;
    setDialog(undefined);
    requestAnimationFrame(() => {
      (previous === 'browser' ? browserButtonRef : atlasButtonRef).current?.focus();
    });
  }

  async function exportJson() {
    if (exportingRef.current) return;
    exportingRef.current = true;
    setExporting(true);
    setExportMessage('');
    try {
      await onExport();
      setExportMessage('Atlas Links JSON download started.');
    } catch {
      setExportMessage('Atlas Links could not create the export. Try again.');
    } finally {
      exportingRef.current = false;
      setExporting(false);
    }
  }

  return (
    <>
      <section className="data-management" aria-labelledby="data-management-title">
        <div>
          <h2 id="data-management-title">Manage bookmark data</h2>
          <p>
            Import browser HTML without tags, or export and re-import editable Atlas Links JSON.
            Files are processed locally. Bookmark files can contain private URLs, names, and
            descriptions—review the privacy implications before sharing one with any external tool
            or LLM.
          </p>
          {exportMessage && <p role="status">{exportMessage}</p>}
        </div>
        <div className="data-actions">
          <button ref={browserButtonRef} className="secondary" onClick={() => setDialog('browser')}>
            Import bookmarks
          </button>
          <button className="secondary" onClick={() => void exportJson()} disabled={exporting}>
            {exporting ? 'Exporting…' : 'Export Atlas Links JSON'}
          </button>
          <button ref={atlasButtonRef} className="secondary" onClick={() => setDialog('atlas')}>
            Import Atlas Links JSON
          </button>
        </div>
      </section>
      {dialog === 'browser' && (
        <div className="modal-backdrop" role="presentation">
          <BrowserBookmarksImporter
            existingBookmarks={bookmarks}
            onClose={closeDialog}
            onImport={onImportBrowser}
          />
        </div>
      )}
      {dialog === 'atlas' && (
        <div className="modal-backdrop" role="presentation">
          <AtlasLinksJsonImporter
            existingBookmarks={bookmarks}
            onClose={closeDialog}
            onImport={onImportAtlasLinks}
          />
        </div>
      )}
    </>
  );
}
