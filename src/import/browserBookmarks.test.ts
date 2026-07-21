import { parseHTML } from 'linkedom';
import { describe, expect, it } from 'vitest';
import type { Bookmark } from '../domain/model';
import {
  BrowserBookmarkImportError,
  parseBrowserBookmarksHtml,
  prepareBrowserBookmarkImport,
} from './browserBookmarks';

const parseDocument = (html: string) =>
  parseHTML(html.replace(/<!doctype\s+netscape-bookmark-file-1>/i, '<!doctype html>'))
    .document as unknown as Document;

const wrap = (content: string) => `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>${content}</DL><p>`;

const existing = (url: string): Bookmark => ({
  id: 'existing',
  url,
  name: 'Existing',
  description: '',
  tags: ['Keep'],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

describe('browser bookmarks HTML parser', () => {
  it.each([
    ['Chrome', 'ADD_DATE="1700000000" ICON="data:image/png;base64,ignored"'],
    ['Edge', 'ADD_DATE="1700000000" LAST_MODIFIED="1700000001"'],
    ['Firefox', 'ADD_DATE="1700000000" TAGS="must-not-import"'],
    ['Safari', 'ADD_DATE="1700000000" PRIVATE="0"'],
  ])('parses a representative %s export without deriving tags', (_browser, attributes) => {
    const parsed = parseBrowserBookmarksHtml(
      wrap(`<DT><H3>Research</H3>
        <DL><p><DT><A HREF="HTTPS://EXAMPLE.COM/docs/#part" ${attributes}>Docs &amp; Notes</A>
        <DD>A Unicode description: café
        </DL><p>`),
      { parseDocument },
    );

    expect(parsed).toEqual({
      totalFound: 1,
      bookmarks: [
        {
          url: 'https://example.com/docs',
          name: 'Docs & Notes',
          description: 'A Unicode description: café',
          createdAt: '2023-11-14T22:13:20.000Z',
        },
      ],
      invalid: [],
    });
    expect(parsed.bookmarks[0]).not.toHaveProperty('tags');
  });

  it('uses the hostname for an empty title and ignores malformed timestamps', () => {
    const parsed = parseBrowserBookmarksHtml(
      wrap('<DT><A HREF="https://empty.example/path" ADD_DATE="not-a-time"></A>'),
      { parseDocument },
    );
    expect(parsed.bookmarks).toEqual([
      {
        url: 'https://empty.example/path',
        name: 'empty.example',
        description: '',
      },
    ]);
  });

  it('reports missing, unsafe, malformed, and unsupported links without importing them', () => {
    const parsed = parseBrowserBookmarksHtml(
      wrap(`<DT><A>Missing URL</A>
        <DT><A HREF="javascript:alert(1)">Script</A>
        <DT><A HREF="place:type=6">Firefox smart folder</A>
        <DT><A HREF="not a URL">Broken</A>`),
      { parseDocument },
    );
    expect(parsed.totalFound).toBe(4);
    expect(parsed.bookmarks).toEqual([]);
    expect(parsed.invalid).toHaveLength(4);
    expect(parsed.invalid[0]).toMatchObject({ name: 'Missing URL', url: '' });
  });

  it('requires a browser-export marker and at least one bookmark', () => {
    expect(() =>
      parseBrowserBookmarksHtml('<!doctype html><a href="https://example.com">Example</a>', {
        parseDocument,
      }),
    ).toThrow(BrowserBookmarkImportError);
    expect(() => parseBrowserBookmarksHtml(wrap(''), { parseDocument })).toThrow(
      /does not contain any bookmarks/i,
    );
  });

  it('enforces configurable file and entry limits before review', () => {
    expect(() =>
      parseBrowserBookmarksHtml(wrap('<A HREF="https://example.com">Example</A>'), {
        maxFileSizeBytes: 20,
        parseDocument,
      }),
    ).toThrow(/larger than/i);
    expect(() =>
      parseBrowserBookmarksHtml(
        wrap('<A HREF="https://one.example">One</A><A HREF="https://two.example">Two</A>'),
        { maxEntries: 1, parseDocument },
      ),
    ).toThrow(/more than 1 entries/i);
  });
});

describe('browser bookmark import preview', () => {
  it('separates new, already-saved, repeated, and invalid entries deterministically', () => {
    const parsed = parseBrowserBookmarksHtml(
      wrap(`<DT><A HREF="https://existing.example/#old">Saved already</A>
        <DT><A HREF="https://new.example/path">New one</A>
        <DT><A HREF="https://NEW.example/path#again">Repeated new one</A>
        <DT><A HREF="file:///private/bookmark">Unsupported</A>`),
      { parseDocument },
    );
    const preview = prepareBrowserBookmarkImport(parsed, [existing('https://existing.example')]);

    expect(preview.totalFound).toBe(4);
    expect(preview.newBookmarks.map((bookmark) => bookmark.url)).toEqual([
      'https://new.example/path',
    ]);
    expect(preview.duplicates.map((duplicate) => duplicate.reason)).toEqual([
      'already-saved',
      'repeated-in-file',
    ]);
    expect(preview.invalid).toHaveLength(1);
  });
});
