import type { Bookmark } from './model';

export type SortOrder = 'updated' | 'created' | 'name';

const MATCH_SCORE = 16;
const BOUNDARY_BONUS = 8;
const CONSECUTIVE_BONUS = 8;
const GAP_PENALTY = 2;
const NAME_WEIGHT = 0.75;
const DESCRIPTION_WEIGHT = 0.25;
const NEGATIVE_INFINITY = Number.NEGATIVE_INFINITY;

function fold(value: string): string {
    return value
        .toLocaleLowerCase()
        .normalize('NFD')
        .replace(/\p{M}+/gu, '');
}

type Match = { score: number; start: number };

// fzf-style ordered-subsequence scoring: query characters must appear in
// order, with bonuses for word boundaries and consecutive matches. Returns
// null when the query is not a subsequence of the text.
function subsequenceMatch(text: string, query: string): Match | null {
    if (query.length === 0) return { score: 0, start: 0 };
    if (text.length < query.length) return null;

    const isBoundary = (index: number) => index === 0 || /[^\p{L}\p{N}]/u.test(text[index - 1]);

    let scores = new Array<number>(text.length).fill(NEGATIVE_INFINITY);
    let starts = new Array<number>(text.length).fill(0);

    for (let row = 0; row < query.length; row += 1) {
        const previousScores = scores;
        const previousStarts = starts;
        scores = new Array<number>(text.length).fill(NEGATIVE_INFINITY);
        starts = new Array<number>(text.length).fill(0);

        // Best score of the previous query char matched at any earlier text
        // position, with intervening-gap penalties accumulated as we advance.
        let running = NEGATIVE_INFINITY;
        let runningStart = 0;

        for (let i = 0; i < text.length; i += 1) {
            if (row === 0) {
                if (text[i] === query[0]) {
                    scores[i] = MATCH_SCORE + (isBoundary(i) ? BOUNDARY_BONUS : 0);
                    starts[i] = i;
                }
                continue;
            }

            if (i > 0 && previousScores[i - 1] !== NEGATIVE_INFINITY) {
                const aged =
                    running === NEGATIVE_INFINITY ? NEGATIVE_INFINITY : running - GAP_PENALTY;
                const entered = previousScores[i - 1];
                if (entered >= aged) {
                    running = entered;
                    runningStart = previousStarts[i - 1];
                } else {
                    running = aged;
                }
            }

            let predecessor = running;
            let predecessorStart = runningStart;
            if (i > 0 && previousScores[i - 1] !== NEGATIVE_INFINITY) {
                const consecutive = previousScores[i - 1] + CONSECUTIVE_BONUS;
                if (consecutive > predecessor) {
                    predecessor = consecutive;
                    predecessorStart = previousStarts[i - 1];
                }
            }

            if (text[i] === query[row] && predecessor !== NEGATIVE_INFINITY) {
                scores[i] = predecessor + MATCH_SCORE + (isBoundary(i) ? BOUNDARY_BONUS : 0);
                starts[i] = predecessorStart;
            }
        }
    }

    let best: Match | null = null;
    for (let i = 0; i < text.length; i += 1) {
        if (scores[i] === NEGATIVE_INFINITY) continue;
        const candidate = { score: scores[i], start: starts[i] };
        if (!best || candidate.score > best.score || candidate.start < best.start) {
            best = candidate;
        }
    }
    return best;
}

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
    const tokens = fold(query.trim()).split(/\s+/u).filter(Boolean);
    if (tokens.length === 0) {
        return [...visible].sort((a, b) =>
            sort === 'name'
                ? a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
                : sort === 'created'
                  ? b.createdAt.localeCompare(a.createdAt)
                  : b.updatedAt.localeCompare(a.updatedAt),
        );
    }
    return visible
        .flatMap((bookmark) => {
            const name = fold(bookmark.name);
            const description = fold(bookmark.description);
            let score = 0;
            let firstPosition = 0;
            for (const token of tokens) {
                const nameMatch = subsequenceMatch(name, token);
                const descriptionMatch = subsequenceMatch(description, token);
                let tokenScore = NEGATIVE_INFINITY;
                let tokenStart = 0;
                if (nameMatch) {
                    tokenScore = nameMatch.score * NAME_WEIGHT;
                    tokenStart = nameMatch.start;
                }
                if (descriptionMatch && descriptionMatch.score * DESCRIPTION_WEIGHT > tokenScore) {
                    tokenScore = descriptionMatch.score * DESCRIPTION_WEIGHT;
                    tokenStart = descriptionMatch.start + name.length + 1;
                }
                if (tokenScore === NEGATIVE_INFINITY) return [];
                score += tokenScore;
                firstPosition += tokenStart;
            }
            return [{ bookmark, score, firstPosition }];
        })
        .sort(
            (a, b) =>
                b.score - a.score ||
                a.firstPosition - b.firstPosition ||
                a.bookmark.name.localeCompare(b.bookmark.name, undefined, {
                    sensitivity: 'base',
                }) ||
                a.bookmark.id.localeCompare(b.bookmark.id),
        )
        .map((result) => result.bookmark);
}
