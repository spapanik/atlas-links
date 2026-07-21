import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Bookmark } from '../domain/model';
import { SearchSurface } from './SearchSurface';

const bookmark = (
  id: string,
  name: string,
  description: string,
  tags: string[] = [],
): Bookmark => ({
  id,
  name,
  description,
  tags,
  url: `https://${id}.example.com`,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

const bookmarks = [
  bookmark('typescript', 'TypeScript handbook', '', ['Code', 'Reference']),
  bookmark('notes', 'Frontend notes', 'A practical guide to TypeScript', ['Code']),
  bookmark('travel', 'Travel plans', '', ['Personal']),
];

function render(props: Partial<Parameters<typeof SearchSurface>[0]> = {}) {
  return renderToStaticMarkup(
    <SearchSurface
      bookmarks={bookmarks}
      loading={false}
      error=""
      onOpenLibrary={() => undefined}
      {...props}
    />,
  );
}

describe('SearchSurface', () => {
  it('autofocuses search and renders fuzzy name and description matches', () => {
    const markup = render({ initialQuery: 'typescrpt' });
    expect(markup).toContain('autofocus=""');
    expect(markup).toContain('TypeScript handbook');
    expect(markup).toContain('Frontend notes');
    expect(markup.indexOf('TypeScript handbook')).toBeLessThan(markup.indexOf('Frontend notes'));
  });

  it('combines search with every selected tag and renders removable chips', () => {
    const markup = render({ initialQuery: 'type', initialTags: ['Code', 'Reference'] });
    expect(markup).toContain('TypeScript handbook');
    expect(markup).not.toContain('Frontend notes');
    expect(markup).toContain('aria-label="Remove Reference filter"');
  });

  it.each(['page', 'panel'] as const)(
    'uses the shared fuzzy and tag contract in %s mode',
    (mode) => {
      const markup = render({ mode, initialQuery: 'type', initialTags: ['Code', 'Reference'] });
      expect(markup).toContain('TypeScript handbook');
      expect(markup).not.toContain('Frontend notes');
      if (mode === 'panel') expect(markup).toContain('search-shell side-panel');
    },
  );

  it('renders the side-panel fallback explanation', () => {
    const markup = render({ notice: 'The side panel could not open.' });
    expect(markup).toContain('role="status"');
    expect(markup).toContain('The side panel could not open.');
  });

  it('renders empty, no-results, and repository-error states', () => {
    expect(render({ bookmarks: [] })).toContain('Your atlas is empty');
    expect(render({ initialQuery: 'missing' })).toContain('No paths found');
    expect(render({ error: 'Could not load bookmarks.' })).toContain('Could not load bookmarks.');
  });
});
