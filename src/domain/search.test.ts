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
const weekly = [
    item('w1', 'JD Women', '', ['commerce']),
    item('w2', 'SOT Connect Weekly', '', ['engineering', 'standup']),
    item('w3', 'SOT Pod Weekly', '', ['initiative', 'standup']),
    item('w4', 'Commerce SE Program Hub', '', ['A200', 'standup']),
    item('w5', 'Commerce Weekly', '', ['commerce', 'standup']),
    item('w6', 'Product & Tech Weekly', '', ['engineering', 'standup']),
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
    it('matches ordered subsequences like fzf without dropping late matches', () => {
        expect(
            searchBookmarks(weekly, 'w', [])
                .map((x) => x.id)
                .sort(),
        ).toEqual(['w1', 'w2', 'w3', 'w5', 'w6'].sort());
        expect(searchBookmarks(weekly, 'w', []).map((x) => x.id)).not.toContain('w4');
        expect(
            searchBookmarks(weekly, 'wkl', [])
                .map((x) => x.id)
                .sort(),
        ).toEqual(['w2', 'w3', 'w5', 'w6'].sort());
    });
    it('ranks exact word matches ahead of subsequence gaps', () => {
        expect(
            searchBookmarks(weekly, 'weekly', [])
                .map((x) => x.id)
                .slice(0, 3),
        ).toEqual(['w3', 'w5', 'w2']);
        expect(searchBookmarks(weekly, 'weekly', []).map((x) => x.id)).not.toContain('w1');
    });
    it('treats every whitespace-separated token as a required match', () => {
        expect(
            searchBookmarks(weekly, 'sot weekly', [])
                .map((x) => x.id)
                .sort(),
        ).toEqual(['w2', 'w3']);
        expect(searchBookmarks(weekly, 'weekly zzz', [])).toEqual([]);
    });
    it('is case-insensitive and diacritic-tolerant', () => {
        const accented = item('d', 'Café notes', '');
        expect(searchBookmarks([accented], 'CAFE', []).map((x) => x.id)).toEqual(['d']);
    });
    it('combines all selected tags with text search', () =>
        expect(searchBookmarks(items, 'type', ['code', 'REFERENCE']).map((x) => x.id)).toEqual([
            'a',
        ]));
    it('returns filtered items for empty queries and ignores casing', () =>
        expect(searchBookmarks(items, '', ['CODE'])).toHaveLength(2));
});
