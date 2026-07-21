import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { parseHTML } from 'linkedom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AtlasLinksImportResult } from '../data/repository';
import type { Bookmark } from '../domain/model';
import type { AtlasLinksImportRecord } from '../import/atlasLinks';
import { AtlasLinksJsonImporter } from './AtlasLinksJsonImporter';

const timestamp = '2026-01-01T00:00:00.000Z';
const existing: Bookmark[] = [
  {
    id: 'one',
    url: 'https://one.example',
    name: 'One',
    description: '',
    tags: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  },
  {
    id: 'two',
    url: 'https://two.example',
    name: 'Two',
    description: '',
    tags: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  },
  {
    id: 'three',
    url: 'https://three.example',
    name: 'Three',
    description: '',
    tags: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  },
  {
    id: 'four',
    url: 'https://four.example',
    name: 'Four',
    description: '',
    tags: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  },
];

const json = JSON.stringify({
  format: 'atlas-links',
  schemaVersion: 1,
  exportedAt: timestamp,
  bookmarks: [
    { id: 'new', url: 'https://new.example', name: 'New', description: '', tags: [] },
    {
      id: 'four',
      url: 'https://four.example',
      name: 'Four',
      description: '',
      tags: ['Edited'],
    },
    { id: 'three', url: 'https://three.example', name: 'Three', description: '', tags: [] },
    { id: 'one', url: 'https://two.example', name: 'Conflict', description: '', tags: [] },
    {
      id: 'invalid',
      url: 'https://invalid.example',
      name: 'Invalid',
      description: '',
      tags: [],
      deletedAt: timestamp,
    },
  ],
});

let root: Root;
let container: HTMLElement;
let focusedElement: HTMLElement | undefined;

function button(label: string): HTMLButtonElement {
  const match = [...container.querySelectorAll('button')].find(
    (candidate) => candidate.textContent?.trim() === label,
  );
  if (!match) throw new Error(`Button not found: ${label}`);
  return match;
}

async function chooseFile(contents = json, name = 'atlas-links.json') {
  const input = container.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error('File input not found.');
  Object.defineProperty(input, 'files', {
    configurable: true,
    value: [new File([contents], name, { type: 'application/json' })],
  });
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
}

describe('AtlasLinksJsonImporter', () => {
  beforeEach(() => {
    const { document, window } = parseHTML('<html><body><div id="root"></div></body></html>');
    vi.stubGlobal('window', window);
    vi.stubGlobal('document', document);
    vi.stubGlobal('navigator', window.navigator);
    vi.stubGlobal('HTMLElement', window.HTMLElement);
    vi.stubGlobal('HTMLInputElement', window.HTMLInputElement);
    vi.stubGlobal('Event', window.Event);
    vi.stubGlobal('File', window.File);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    });
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    focusedElement = undefined;
    window.HTMLElement.prototype.focus = function () {
      focusedElement = this as HTMLElement;
    };
    container = document.querySelector('#root') as HTMLElement;
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  });

  it('shows all review categories and cancels without applying changes', async () => {
    const onClose = vi.fn();
    const onImport = vi.fn();
    await act(async () => {
      root.render(
        <AtlasLinksJsonImporter
          existingBookmarks={existing}
          onClose={onClose}
          onImport={onImport}
        />,
      );
    });

    expect(focusedElement).toBe(container.querySelector('input[type="file"]'));
    await chooseFile();
    expect(container.textContent).toContain('New1');
    expect(container.textContent).toContain('Updated1');
    expect(container.textContent).toContain('Unchanged1');
    expect(container.textContent).toContain('Conflicts1');
    expect(container.textContent).toContain('Invalid1');
    expect(container.textContent).toContain('The imported ID and URL match two different');
    expect(container.textContent).toContain('Unsupported bookmark field: deletedAt');
    expect(focusedElement).toBe(button('Apply changes'));

    await act(async () => button('Cancel').click());
    expect(onClose).toHaveBeenCalledOnce();
    expect(onImport).not.toHaveBeenCalled();
  });

  it('applies once, prevents double submission, and focuses the completion result', async () => {
    let finishImport!: (result: AtlasLinksImportResult) => void;
    let submitted: readonly AtlasLinksImportRecord[] = [];
    const onImport = vi.fn(
      (records: readonly AtlasLinksImportRecord[]) =>
        new Promise<AtlasLinksImportResult>((resolve) => {
          submitted = records;
          finishImport = resolve;
        }),
    );
    await act(async () => {
      root.render(
        <AtlasLinksJsonImporter
          existingBookmarks={existing}
          onClose={() => undefined}
          onImport={onImport}
        />,
      );
    });
    await chooseFile();
    const confirm = button('Apply changes');
    await act(async () => {
      confirm.click();
      confirm.click();
    });
    expect(onImport).toHaveBeenCalledOnce();
    expect(submitted).toHaveLength(2);
    expect(submitted.map((record) => record.id)).toEqual(['new', 'four']);

    await act(async () =>
      finishImport({
        created: [existing[0]],
        updated: [existing[1]],
        unchanged: 1,
        conflicts: [
          {
            record: {
              url: 'https://concurrent.example',
              name: 'Concurrent conflict',
              description: '',
              tags: [],
            },
            reason: 'Conflict',
          },
        ],
      }),
    );
    const completion = container.querySelector<HTMLElement>('.import-complete');
    expect(completion?.textContent).toContain(
      '1 added, 1 updated, 2 unchanged, and 3 not applied.',
    );
    expect(focusedElement).toBe(completion);
  });

  it('shows safe JSON errors and closes from the keyboard', async () => {
    const onClose = vi.fn();
    await act(async () => {
      root.render(
        <AtlasLinksJsonImporter
          existingBookmarks={existing}
          onClose={onClose}
          onImport={async () => ({ created: [], updated: [], unchanged: 0, conflicts: [] })}
        />,
      );
    });
    await chooseFile('{');
    expect(container.querySelector('[role="alert"]')?.textContent).toMatch(/not valid JSON/i);

    await act(async () => {
      const event = new Event('keydown', { bubbles: true });
      Object.defineProperty(event, 'key', { value: 'Escape' });
      container.querySelector('[role="dialog"]')?.dispatchEvent(event);
    });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('keeps the reviewed changes available after a recoverable persistence error', async () => {
    const onImport = vi
      .fn()
      .mockRejectedValueOnce(new Error('Storage unavailable'))
      .mockResolvedValueOnce({ created: [], updated: [], unchanged: 0, conflicts: [] });
    await act(async () => {
      root.render(
        <AtlasLinksJsonImporter
          existingBookmarks={existing}
          onClose={() => undefined}
          onImport={onImport}
        />,
      );
    });
    await chooseFile();
    await act(async () => button('Apply changes').click());

    expect(container.querySelector('[role="alert"]')?.textContent).toMatch(/could not be saved/i);
    expect(container.textContent).toContain('Review Atlas Links import');
    expect(button('Apply changes').disabled).toBe(false);
  });
});
