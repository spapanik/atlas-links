import { describe, expect, it } from 'vitest';
import { searchBookmarks } from './search';
import type { Bookmark } from './model';
const item = (id: string, name: string, description: string, tags: string[] = []): Bookmark => ({
  id,
  name,
  description,
  tags,
  url: `https://${id}.com`,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: `2026-01-0${id === 'a' ? 2 : 1}T00:00:00.000Z`,
});
const items = [
  item('a', 'TypeScript handbook', '', ['Code', 'Reference']),
  item('b', 'Frontend notes', 'A practical guide to TypeScript', ['Code']),
  item('c', 'Travel plans', '', ['Personal']),
];
describe('search', () => {
  it('supports typos and ranks name above description', () =>
    expect(searchBookmarks(items, 'typescrpt', []).map((x) => x.id)).toEqual(['a', 'b']));
  it('keeps fuzzy relevance ahead of date sorting', () => {
    const descriptionMatch = {
      ...items[1],
      updatedAt: '2026-02-01T00:00:00.000Z',
    };
    expect(
      searchBookmarks([items[0], descriptionMatch], 'typescript', []).map((x) => x.id),
    ).toEqual(['a', 'b']);
  });
  it('finds description-only and partial name matches', () => {
    expect(searchBookmarks(items, 'practical', []).map((x) => x.id)).toEqual(['b']);
    expect(searchBookmarks(items, 'Travel', [])[0].id).toBe('c');
  });
  it('combines all selected tags with text search', () =>
    expect(searchBookmarks(items, 'type', ['code', 'REFERENCE']).map((x) => x.id)).toEqual(['a']));
  it('returns filtered items for empty queries and ignores casing', () =>
    expect(searchBookmarks(items, '', ['CODE'])).toHaveLength(2));
});
