import { describe, expect, it } from 'vitest';
import {
  emptyStore,
  mergeStores,
  normalizeInput,
  normalizeTags,
  normalizeUrl,
  parseStore,
  type Bookmark,
} from './model';

const bookmark = (patch: Partial<Bookmark> = {}): Bookmark => ({
  id: 'one',
  url: 'https://example.com',
  name: 'Example',
  description: '',
  tags: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...patch,
});
describe('normalization and validation', () => {
  it('normalizes safe URL parts but preserves paths and queries', () => {
    expect(normalizeUrl(' HTTPS://EXAMPLE.COM/#part ')).toBe('https://example.com');
    expect(normalizeUrl('https://EXAMPLE.com/docs/?q=1#x')).toBe('https://example.com/docs/?q=1');
  });
  it('rejects unsafe protocols', () =>
    expect(() => normalizeUrl('javascript:alert(1)')).toThrow(/HTTP/));
  it('normalizes tags case-insensitively and keeps first spelling', () =>
    expect(normalizeTags([' Work ', 'work', '', 'Long   Read'])).toEqual(['Work', 'Long Read']));
  it('trims inputs and requires a name', () => {
    expect(
      normalizeInput({ url: 'https://a.com/', name: ' A ', description: ' x ', tags: [] }),
    ).toMatchObject({ name: 'A', description: 'x' });
    expect(() =>
      normalizeInput({ url: 'https://a.com', name: ' ', description: '', tags: [] }),
    ).toThrow();
  });
  it('rejects malformed untrusted stores', () =>
    expect(() => parseStore({ schemaVersion: 1 })).toThrow());
});
describe('merge', () => {
  it('chooses the newer record including a deletion', () => {
    const local = { ...emptyStore('2026-01-01T00:00:00.000Z', 'local'), bookmarks: [bookmark()] };
    const deleted = bookmark({
      updatedAt: '2026-01-02T00:00:00.000Z',
      deletedAt: '2026-01-02T00:00:00.000Z',
    });
    const remote = { ...emptyStore('2026-01-02T00:00:00.000Z', 'remote'), bookmarks: [deleted] };
    expect(mergeStores(local, remote).bookmarks[0].deletedAt).toBeTruthy();
  });
  it('resolves equal timestamps deterministically', () => {
    const a = { ...emptyStore(undefined, 'a'), bookmarks: [bookmark({ name: 'A' })] };
    const z = { ...emptyStore(undefined, 'z'), bookmarks: [bookmark({ name: 'Z' })] };
    expect(mergeStores(a, z).bookmarks[0].name).toBe('Z');
    expect(mergeStores(z, a).bookmarks[0].name).toBe('Z');
  });
});
