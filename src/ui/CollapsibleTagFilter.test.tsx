import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { parseHTML } from 'linkedom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CollapsibleTagFilter } from './CollapsibleTagFilter';

let root: Root;
let container: HTMLElement;

describe('CollapsibleTagFilter', () => {
  beforeEach(() => {
    const { document, window } = parseHTML('<html><body><div id="root"></div></body></html>');
    vi.stubGlobal('window', window);
    vi.stubGlobal('document', document);
    vi.stubGlobal('navigator', window.navigator);
    vi.stubGlobal('HTMLElement', window.HTMLElement);
    vi.stubGlobal('Event', window.Event);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    container = document.querySelector('#root') as HTMLElement;
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  });

  it('starts collapsed and exposes an accessible expand and collapse control', async () => {
    await act(async () => {
      root.render(
        <CollapsibleTagFilter
          label="Tags"
          tags={['Code', 'Reference']}
          selectedTags={[]}
          onToggleTag={() => undefined}
        />,
      );
    });

    const toggle = container.querySelector<HTMLButtonElement>('.tag-filter-toggle')!;
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.getAttribute('aria-label')).toBe('Show all tags');
    expect(container.querySelector('.tag-filter-ellipsis')?.textContent).toBe('…');
    expect(container.querySelector('.tag-filter-options')?.classList.contains('expanded')).toBe(
      false,
    );

    await act(async () => toggle.click());
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(toggle.getAttribute('aria-label')).toBe('Collapse tags');
    expect(container.querySelector('.tag-filter-ellipsis')).toBeNull();
    expect(container.querySelector('.tag-filter-options')?.classList.contains('expanded')).toBe(
      true,
    );
  });

  it('keeps tag selection available while collapsed', async () => {
    const onToggleTag = vi.fn();
    await act(async () => {
      root.render(
        <CollapsibleTagFilter
          label="Filter:"
          tags={['Code']}
          selectedTags={['Code']}
          onToggleTag={onToggleTag}
          showRemoveIndicator
        />,
      );
    });

    const tagButton = container.querySelector<HTMLButtonElement>('.tag-filter-options button')!;
    expect(tagButton.getAttribute('aria-pressed')).toBe('true');
    expect(tagButton.textContent).toBe('Code ×');
    await act(async () => tagButton.click());
    expect(onToggleTag).toHaveBeenCalledWith('Code');
  });
});
