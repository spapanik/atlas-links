import { normalizeInput, normalizeUrl, type Bookmark, type BookmarkInput } from '../domain/model';

export const MAX_BROWSER_BOOKMARK_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_BROWSER_BOOKMARK_ENTRIES = 10_000;

export type BrowserBookmarkImport = Pick<BookmarkInput, 'url' | 'name' | 'description'> & {
  createdAt?: string;
};

export type BrowserBookmarkProblem = {
  name: string;
  url: string;
  reason: string;
};

export type ParsedBrowserBookmarks = {
  totalFound: number;
  bookmarks: BrowserBookmarkImport[];
  invalid: BrowserBookmarkProblem[];
};

export type BrowserBookmarkDuplicate = BrowserBookmarkImport & {
  reason: 'already-saved' | 'repeated-in-file';
};

export type BrowserBookmarkPreview = {
  totalFound: number;
  newBookmarks: BrowserBookmarkImport[];
  duplicates: BrowserBookmarkDuplicate[];
  invalid: BrowserBookmarkProblem[];
};

export type BrowserBookmarkParserOptions = {
  maxFileSizeBytes?: number;
  maxEntries?: number;
  parseDocument?: (html: string) => Document;
};

export class BrowserBookmarkImportError extends Error {}

function parseWithBrowserDom(html: string): Document {
  if (typeof DOMParser === 'undefined')
    throw new BrowserBookmarkImportError('Bookmark HTML parsing is unavailable.');
  return new DOMParser().parseFromString(html, 'text/html');
}

function text(value: string | null | undefined): string {
  return value?.trim() ?? '';
}

function attribute(element: Element, name: string): string | null {
  const expected = name.toLowerCase();
  const found = [...element.attributes].find((item) => item.name.toLowerCase() === expected);
  return found?.value ?? null;
}

function descriptionFor(anchor: Element): string {
  const bookmarkContainer = anchor.closest('dt');
  const description = bookmarkContainer?.nextElementSibling;
  return description?.tagName.toLowerCase() === 'dd' ? text(description.textContent) : '';
}

function timestampFor(anchor: Element): string | undefined {
  const raw = attribute(anchor, 'add_date');
  if (!raw || !/^\d+$/.test(raw)) return undefined;
  const seconds = Number(raw);
  const milliseconds = seconds * 1000;
  if (!Number.isSafeInteger(seconds) || !Number.isFinite(milliseconds)) return undefined;
  const date = new Date(milliseconds);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function problem(anchor: Element, reason: string): BrowserBookmarkProblem {
  return {
    name: text(anchor.textContent),
    url: text(attribute(anchor, 'href')),
    reason,
  };
}

export function parseBrowserBookmarksHtml(
  html: string,
  options: BrowserBookmarkParserOptions = {},
): ParsedBrowserBookmarks {
  const maxFileSizeBytes = options.maxFileSizeBytes ?? MAX_BROWSER_BOOKMARK_FILE_BYTES;
  const maxEntries = options.maxEntries ?? MAX_BROWSER_BOOKMARK_ENTRIES;
  if (new TextEncoder().encode(html).byteLength > maxFileSizeBytes)
    throw new BrowserBookmarkImportError(
      `The bookmarks file is larger than ${Math.floor(maxFileSizeBytes / 1024 / 1024)} MB.`,
    );
  if (!/<!doctype\s+netscape-bookmark-file-1\b/i.test(html))
    throw new BrowserBookmarkImportError(
      'Choose a Netscape-format bookmarks HTML export from a supported browser.',
    );

  const document = (options.parseDocument ?? parseWithBrowserDom)(html);
  const anchors = [...document.querySelectorAll('a')];
  if (anchors.length === 0)
    throw new BrowserBookmarkImportError('The selected file does not contain any bookmarks.');
  if (anchors.length > maxEntries)
    throw new BrowserBookmarkImportError(
      `The bookmarks file contains more than ${maxEntries.toLocaleString()} entries.`,
    );

  const bookmarks: BrowserBookmarkImport[] = [];
  const invalid: BrowserBookmarkProblem[] = [];
  for (const anchor of anchors) {
    const rawUrl = text(attribute(anchor, 'href'));
    try {
      const url = normalizeUrl(rawUrl);
      const name = text(anchor.textContent) || new URL(url).hostname;
      const input = normalizeInput({
        url,
        name,
        description: descriptionFor(anchor),
        tags: [],
      });
      const createdAt = timestampFor(anchor);
      bookmarks.push({
        url: input.url,
        name: input.name,
        description: input.description,
        ...(createdAt ? { createdAt } : {}),
      });
    } catch (error) {
      invalid.push(
        problem(
          anchor,
          error instanceof Error ? error.message : 'This bookmark is malformed or unsupported.',
        ),
      );
    }
  }
  return { totalFound: anchors.length, bookmarks, invalid };
}

export function prepareBrowserBookmarkImport(
  parsed: ParsedBrowserBookmarks,
  existingBookmarks: readonly Bookmark[],
): BrowserBookmarkPreview {
  const existingUrls = new Set(
    existingBookmarks
      .filter((bookmark) => !bookmark.deletedAt)
      .map((bookmark) => normalizeUrl(bookmark.url)),
  );
  const seenInFile = new Set<string>();
  const newBookmarks: BrowserBookmarkImport[] = [];
  const duplicates: BrowserBookmarkDuplicate[] = [];
  for (const bookmark of parsed.bookmarks) {
    if (seenInFile.has(bookmark.url)) {
      duplicates.push({ ...bookmark, reason: 'repeated-in-file' });
      continue;
    }
    seenInFile.add(bookmark.url);
    if (existingUrls.has(bookmark.url)) {
      duplicates.push({ ...bookmark, reason: 'already-saved' });
      continue;
    }
    newBookmarks.push(bookmark);
  }
  return {
    totalFound: parsed.totalFound,
    newBookmarks,
    duplicates,
    invalid: parsed.invalid,
  };
}
