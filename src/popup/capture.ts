import { normalizeUrl, type Bookmark, type BookmarkInput } from '../domain/model';

export type CaptureTab = {
  title?: string;
  url?: string;
};

export type CaptureState =
  | { kind: 'new'; input: BookmarkInput }
  | { kind: 'existing'; input: BookmarkInput; bookmark: Bookmark }
  | { kind: 'unsupported' };

export function resolveCaptureState(tab: CaptureTab | null, bookmarks: Bookmark[]): CaptureState {
  let normalizedUrl: string;
  try {
    normalizedUrl = normalizeUrl(tab?.url ?? '');
  } catch {
    return { kind: 'unsupported' };
  }

  const existing = bookmarks.find(
    (bookmark) => !bookmark.deletedAt && normalizeUrl(bookmark.url) === normalizedUrl,
  );
  if (existing) {
    return {
      kind: 'existing',
      bookmark: existing,
      input: {
        name: existing.name,
        url: existing.url,
        description: existing.description,
        tags: existing.tags,
      },
    };
  }

  return {
    kind: 'new',
    input: {
      name: tab?.title?.trim() || new URL(normalizedUrl).hostname,
      url: normalizedUrl,
      description: '',
      tags: [],
    },
  };
}
