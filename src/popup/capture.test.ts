import { describe, expect, it } from 'vitest';
import type { Bookmark } from '../domain/model';
import { resolveCaptureState } from './capture';

const saved: Bookmark = {
  id: 'saved',
  name: 'Saved page',
  url: 'https://example.com/docs',
  description: 'Reference notes',
  tags: ['Reference'],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('popup capture state', () => {
  it('prefills a new HTTP page without mutating bookmarks', () => {
    const bookmarks = [saved];
    expect(
      resolveCaptureState(
        { title: 'New page', url: 'https://NEW.example/path#section' },
        bookmarks,
      ),
    ).toEqual({
      kind: 'new',
      input: {
        name: 'New page',
        url: 'https://new.example/path',
        description: '',
        tags: [],
      },
    });
    expect(bookmarks).toEqual([saved]);
  });

  it('uses normalized duplicate matching for the update state', () => {
    const state = resolveCaptureState(
      { title: 'Current title', url: 'https://EXAMPLE.com/docs#heading' },
      [saved],
    );

    expect(state.kind).toBe('existing');
    if (state.kind === 'existing') {
      expect(state.bookmark.id).toBe('saved');
      expect(state.input).toMatchObject({
        name: 'Saved page',
        description: 'Reference notes',
      });
    }
  });

  it.each([undefined, 'chrome://extensions', 'file:///tmp/page.html'])(
    'rejects unsupported page URL %s',
    (url) => {
      expect(resolveCaptureState({ title: 'Unsupported', url }, [saved])).toEqual({
        kind: 'unsupported',
      });
    },
  );
});
