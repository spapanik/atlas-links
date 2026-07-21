import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { parseHTML } from 'linkedom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BrowserBookmarksImporter } from './BrowserBookmarksImporter';

const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<DL><p>
  <DT><A HREF="https://example.com">Example</A>
  <DT><A HREF="javascript:alert(1)">Unsupported</A>
</DL><p>`;

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

async function chooseFile(contents = html, name = 'bookmarks.html') {
  const input = container.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error('File input not found.');
  Object.defineProperty(input, 'files', {
    configurable: true,
    value: [new File([contents], name, { type: 'text/html' })],
  });
  await act(async () => {
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

describe('BrowserBookmarksImporter', () => {
  beforeEach(async () => {
    const { document, window } = parseHTML('<html><body><div id="root"></div></body></html>');
    vi.stubGlobal('window', window);
    vi.stubGlobal('document', document);
    vi.stubGlobal('navigator', window.navigator);
    vi.stubGlobal('HTMLElement', window.HTMLElement);
    vi.stubGlobal('HTMLInputElement', window.HTMLInputElement);
    vi.stubGlobal('DOMParser', window.DOMParser);
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

  it('selects a file, reviews deterministic counts, and cancels without importing', async () => {
    const onClose = vi.fn();
    const onImport = vi.fn();
    await act(async () => {
      root.render(
        <BrowserBookmarksImporter existingBookmarks={[]} onClose={onClose} onImport={onImport} />,
      );
    });

    expect(focusedElement).toBe(container.querySelector('input[type="file"]'));
    await chooseFile();

    expect(container.textContent).toContain('Total links found2');
    expect(container.textContent).toContain('New bookmarks1');
    expect(container.textContent).toContain('Invalid or unsupported1');
    expect(focusedElement).toBe(button('Import bookmarks'));
    await act(async () => button('Cancel').click());
    expect(onClose).toHaveBeenCalledOnce();
    expect(onImport).not.toHaveBeenCalled();
  });

  it('confirms once, disables double submission, and focuses the completion result', async () => {
    let finishImport!: (result: { imported: never[]; skipped: number }) => void;
    const onImport = vi.fn(
      () =>
        new Promise<{ imported: never[]; skipped: number }>((resolve) => {
          finishImport = resolve;
        }),
    );
    await act(async () => {
      root.render(
        <BrowserBookmarksImporter
          existingBookmarks={[]}
          onClose={() => undefined}
          onImport={onImport}
        />,
      );
    });
    await chooseFile();

    const confirm = button('Import bookmarks');
    await act(async () => {
      confirm.click();
      confirm.click();
    });
    expect(onImport).toHaveBeenCalledOnce();

    await act(async () => finishImport({ imported: [], skipped: 1 }));
    const completion = container.querySelector<HTMLElement>('.import-complete');
    expect(completion?.textContent).toContain('0 bookmarks imported. 2 skipped.');
    expect(focusedElement).toBe(completion);
  });

  it('shows safe file errors and supports closing with Escape', async () => {
    const onClose = vi.fn();
    await act(async () => {
      root.render(
        <BrowserBookmarksImporter
          existingBookmarks={[]}
          onClose={onClose}
          onImport={async () => ({ imported: [], skipped: 0 })}
        />,
      );
    });

    await chooseFile('<!doctype html><p>Not an export</p>', 'not-bookmarks.html');
    expect(container.querySelector('[role="alert"]')?.textContent).toMatch(/Netscape-format/i);
    await act(async () => {
      const event = new Event('keydown', { bubbles: true });
      Object.defineProperty(event, 'key', { value: 'Escape' });
      container.querySelector('[role="dialog"]')?.dispatchEvent(event);
    });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
