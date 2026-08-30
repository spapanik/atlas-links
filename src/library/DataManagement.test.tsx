import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { parseHTML } from 'linkedom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DataManagement } from './DataManagement';

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

describe('DataManagement', () => {
  beforeEach(() => {
    const { document, window } = parseHTML('<html><body><div id="root"></div></body></html>');
    vi.stubGlobal('window', window);
    vi.stubGlobal('document', document);
    vi.stubGlobal('navigator', window.navigator);
    vi.stubGlobal('HTMLElement', window.HTMLElement);
    vi.stubGlobal('Event', window.Event);
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

  it('initiates one local JSON export and reports the result', async () => {
    let finishExport!: () => void;
    const onExport = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishExport = resolve;
        }),
    );
    await act(async () => {
      root.render(
        <DataManagement
          bookmarks={[]}
          onExport={onExport}
          onImportAtlasLinks={async () => ({
            created: [],
            updated: [],
            unchanged: 0,
            conflicts: [],
          })}
          onOverwriteAtlasLinks={async () => ({
            created: [],
            updated: [],
            unchanged: 0,
            conflicts: [],
          })}
          onImportBrowser={async () => ({ imported: [], skipped: 0 })}
        />,
      );
    });

    const exportButton = button('Export Atlas Links JSON');
    await act(async () => {
      exportButton.click();
      exportButton.click();
    });
    expect(onExport).toHaveBeenCalledOnce();
    expect(button('Exporting…').disabled).toBe(true);

    await act(async () => finishExport());
    expect(container.querySelector('[role="status"]')?.textContent).toMatch(/download started/i);
    expect(container.textContent).toContain('Import bookmarks');
    expect(container.textContent).toContain('Import Atlas Links JSON');
  });

  it('opens the JSON importer from the keyboard flow and restores trigger focus on close', async () => {
    await act(async () => {
      root.render(
        <DataManagement
          bookmarks={[]}
          onExport={async () => undefined}
          onImportAtlasLinks={async () => ({
            created: [],
            updated: [],
            unchanged: 0,
            conflicts: [],
          })}
          onOverwriteAtlasLinks={async () => ({
            created: [],
            updated: [],
            unchanged: 0,
            conflicts: [],
          })}
          onImportBrowser={async () => ({ imported: [], skipped: 0 })}
        />,
      );
    });
    const trigger = button('Import Atlas Links JSON');
    await act(async () => trigger.click());
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();

    await act(async () => {
      const event = new Event('keydown', { bubbles: true });
      Object.defineProperty(event, 'key', { value: 'Escape' });
      container.querySelector('[role="dialog"]')?.dispatchEvent(event);
    });
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(focusedElement).toBe(trigger);
  });
});
