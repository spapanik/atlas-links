import Fuse from 'fuse.js';
import type { Bookmark } from './model';

export type SortOrder = 'updated' | 'created' | 'name';
export function searchBookmarks(
  bookmarks: Bookmark[],
  query: string,
  tags: string[],
  sort: SortOrder = 'updated',
): Bookmark[] {
  const selected = tags.map((tag) => tag.toLocaleLowerCase());
  const visible = bookmarks.filter(
    (b) =>
      !b.deletedAt &&
      selected.every((tag) => b.tags.some((own) => own.toLocaleLowerCase() === tag)),
  );
  const normalizedQuery = query.trim();
  if (normalizedQuery) {
    return new Fuse(visible, {
      keys: [
        { name: 'name', weight: 0.75 },
        { name: 'description', weight: 0.25 },
      ],
      threshold: 0.4,
      ignoreDiacritics: true,
      includeScore: true,
    })
      .search(normalizedQuery)
      .map((result) => result.item);
  }
  return [...visible].sort((a, b) =>
    sort === 'name'
      ? a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
      : sort === 'created'
        ? b.createdAt.localeCompare(a.createdAt)
        : b.updatedAt.localeCompare(a.updatedAt),
  );
}
