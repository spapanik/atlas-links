import {
  isIsoTimestamp,
  normalizeInput,
  normalizeTags,
  normalizeUrl,
  parseStore,
  type Bookmark,
  type BookmarkStore,
} from '../domain/model';

export const ATLAS_LINKS_EXPORT_FORMAT = 'atlas-links';
export const ATLAS_LINKS_EXPORT_SCHEMA_VERSION = 1;
export const MAX_ATLAS_LINKS_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_ATLAS_LINKS_ENTRIES = 10_000;

export type AtlasLinksImportRecord = {
  id?: string;
  url: string;
  name: string;
  description: string;
  tags: string[];
  createdAt?: string;
  updatedAt?: string;
};

export type AtlasLinksExportBookmark = Required<AtlasLinksImportRecord>;

export type AtlasLinksExport = {
  format: typeof ATLAS_LINKS_EXPORT_FORMAT;
  schemaVersion: typeof ATLAS_LINKS_EXPORT_SCHEMA_VERSION;
  exportedAt: string;
  bookmarks: AtlasLinksExportBookmark[];
};

export type AtlasLinksInvalidRecord = {
  index: number;
  id?: string;
  name: string;
  reason: string;
};

export type ParsedAtlasLinksExport = {
  exportedAt: string;
  total: number;
  bookmarks: AtlasLinksImportRecord[];
  invalid: AtlasLinksInvalidRecord[];
};

export type AtlasLinksImportProposal = {
  record: AtlasLinksImportRecord;
  target?: Bookmark;
  changes: Array<'url' | 'name' | 'description' | 'tags'>;
};

export type AtlasLinksImportConflict = {
  record: AtlasLinksImportRecord;
  reason: string;
};

export type AtlasLinksImportPreview = {
  newBookmarks: AtlasLinksImportProposal[];
  updated: AtlasLinksImportProposal[];
  unchanged: AtlasLinksImportProposal[];
  conflicts: AtlasLinksImportConflict[];
};

export class AtlasLinksImportError extends Error {}

export function downloadAtlasLinksExport(
  json: string,
  environment: Pick<Document, 'body' | 'createElement'> = document,
  objectUrls: Pick<typeof URL, 'createObjectURL' | 'revokeObjectURL'> = URL,
): void {
  const objectUrl = objectUrls.createObjectURL(
    new Blob([json], { type: 'application/json;charset=utf-8' }),
  );
  const anchor = environment.createElement('a');
  anchor.href = objectUrl;
  anchor.download = 'atlas-links.json';
  anchor.hidden = true;
  try {
    environment.body.append(anchor);
    anchor.click();
  } finally {
    anchor.remove();
    objectUrls.revokeObjectURL(objectUrl);
  }
}

const topLevelFields = new Set(['format', 'schemaVersion', 'exportedAt', 'bookmarks']);
const bookmarkFields = new Set([
  'id',
  'url',
  'name',
  'description',
  'tags',
  'createdAt',
  'updatedAt',
]);

function object(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new AtlasLinksImportError(message);
  return value as Record<string, unknown>;
}

function unknownFields(value: Record<string, unknown>, allowed: Set<string>): string[] {
  return Object.keys(value).filter((key) => !allowed.has(key));
}

function labelFromRaw(value: unknown): { id?: string; name: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { name: '' };
  const record = value as Record<string, unknown>;
  return {
    ...(typeof record.id === 'string' ? { id: record.id } : {}),
    name: typeof record.name === 'string' ? record.name.trim() : '',
  };
}

function parseRecord(value: unknown): AtlasLinksImportRecord {
  const record = object(value, 'The bookmark must be a JSON object.');
  const extras = unknownFields(record, bookmarkFields);
  if (extras.length > 0)
    throw new AtlasLinksImportError(`Unsupported bookmark field: ${extras.join(', ')}.`);
  if (record.id !== undefined && (typeof record.id !== 'string' || !record.id.trim()))
    throw new AtlasLinksImportError('The bookmark ID must be a non-empty string when provided.');
  if (
    typeof record.url !== 'string' ||
    typeof record.name !== 'string' ||
    typeof record.description !== 'string' ||
    !Array.isArray(record.tags) ||
    !record.tags.every((tag) => typeof tag === 'string')
  )
    throw new AtlasLinksImportError(
      'The bookmark must include string URL, name, and description fields plus a string tags array.',
    );
  if (record.createdAt !== undefined && !isIsoTimestamp(record.createdAt))
    throw new AtlasLinksImportError('The bookmark createdAt value is not a valid UTC timestamp.');
  if (record.updatedAt !== undefined && !isIsoTimestamp(record.updatedAt))
    throw new AtlasLinksImportError('The bookmark updatedAt value is not a valid UTC timestamp.');

  const tags = normalizeTags(record.tags);
  if (tags.length !== record.tags.length)
    throw new AtlasLinksImportError('Bookmark tags cannot be empty or duplicated.');
  const input = normalizeInput({
    url: record.url,
    name: record.name,
    description: record.description,
    tags: record.tags,
  });
  return {
    ...(record.id !== undefined ? { id: record.id } : {}),
    ...input,
    ...(record.createdAt !== undefined ? { createdAt: record.createdAt } : {}),
    ...(record.updatedAt !== undefined ? { updatedAt: record.updatedAt } : {}),
  };
}

export function serializeAtlasLinksExport(
  storeValue: BookmarkStore,
  exportedAt = new Date().toISOString(),
): string {
  if (!isIsoTimestamp(exportedAt)) throw new Error('The export timestamp is invalid.');
  const store = parseStore(storeValue);
  const bookmarks = store.bookmarks
    .filter((bookmark) => !bookmark.deletedAt)
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((bookmark): AtlasLinksExportBookmark => ({
      id: bookmark.id,
      url: bookmark.url,
      name: bookmark.name,
      description: bookmark.description,
      tags: bookmark.tags,
      createdAt: bookmark.createdAt,
      updatedAt: bookmark.updatedAt,
    }));
  const exported: AtlasLinksExport = {
    format: ATLAS_LINKS_EXPORT_FORMAT,
    schemaVersion: ATLAS_LINKS_EXPORT_SCHEMA_VERSION,
    exportedAt,
    bookmarks,
  };
  return `${JSON.stringify(exported, null, 2)}\n`;
}

export function parseAtlasLinksExport(
  json: string,
  options: { maxFileSizeBytes?: number; maxEntries?: number } = {},
): ParsedAtlasLinksExport {
  const maxFileSizeBytes = options.maxFileSizeBytes ?? MAX_ATLAS_LINKS_FILE_BYTES;
  const maxEntries = options.maxEntries ?? MAX_ATLAS_LINKS_ENTRIES;
  if (new TextEncoder().encode(json).byteLength > maxFileSizeBytes)
    throw new AtlasLinksImportError(
      `The Atlas Links file is larger than ${Math.floor(maxFileSizeBytes / 1024 / 1024)} MB.`,
    );

  let decoded: unknown;
  try {
    decoded = JSON.parse(json) as unknown;
  } catch {
    throw new AtlasLinksImportError('The selected file is not valid JSON.');
  }
  const exported = object(decoded, 'The Atlas Links export must be a JSON object.');
  const extras = unknownFields(exported, topLevelFields);
  if (extras.length > 0)
    throw new AtlasLinksImportError(`Unsupported top-level field: ${extras.join(', ')}.`);
  if (exported.format !== ATLAS_LINKS_EXPORT_FORMAT)
    throw new AtlasLinksImportError('This is not an Atlas Links export file.');
  if (exported.schemaVersion !== ATLAS_LINKS_EXPORT_SCHEMA_VERSION)
    throw new AtlasLinksImportError('This Atlas Links export version is not supported.');
  if (!isIsoTimestamp(exported.exportedAt))
    throw new AtlasLinksImportError('The export timestamp is missing or invalid.');
  if (!Array.isArray(exported.bookmarks))
    throw new AtlasLinksImportError('The export bookmarks field must be an array.');
  if (exported.bookmarks.length > maxEntries)
    throw new AtlasLinksImportError(
      `The Atlas Links file contains more than ${maxEntries.toLocaleString()} entries.`,
    );

  const seenIds = new Set<string>();
  for (const raw of exported.bookmarks) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const id = (raw as Record<string, unknown>).id;
    if (typeof id !== 'string' || !id) continue;
    if (seenIds.has(id))
      throw new AtlasLinksImportError(`The export contains the duplicate bookmark ID “${id}”.`);
    seenIds.add(id);
  }

  const bookmarks: AtlasLinksImportRecord[] = [];
  const invalid: AtlasLinksInvalidRecord[] = [];
  exported.bookmarks.forEach((raw, index) => {
    try {
      bookmarks.push(parseRecord(raw));
    } catch (cause) {
      const label = labelFromRaw(raw);
      invalid.push({
        index,
        ...label,
        reason: cause instanceof Error ? cause.message : 'The bookmark is invalid.',
      });
    }
  });
  return {
    exportedAt: exported.exportedAt,
    total: exported.bookmarks.length,
    bookmarks,
    invalid,
  };
}

function editableChanges(
  record: AtlasLinksImportRecord,
  target: Bookmark,
): AtlasLinksImportProposal['changes'] {
  const changes: AtlasLinksImportProposal['changes'] = [];
  if (record.url !== target.url) changes.push('url');
  if (record.name !== target.name) changes.push('name');
  if (record.description !== target.description) changes.push('description');
  if (JSON.stringify(record.tags) !== JSON.stringify(target.tags)) changes.push('tags');
  return changes;
}

export function prepareAtlasLinksImport(
  records: readonly AtlasLinksImportRecord[],
  existingBookmarks: readonly Bookmark[],
): AtlasLinksImportPreview {
  const normalizedRecords = records.map((record) => ({
    ...record,
    ...normalizeInput(record),
  }));
  const byId = new Map(existingBookmarks.map((bookmark) => [bookmark.id, bookmark]));
  const activeByUrl = new Map(
    existingBookmarks
      .filter((bookmark) => !bookmark.deletedAt)
      .map((bookmark) => [normalizeUrl(bookmark.url), bookmark]),
  );
  const urlCounts = new Map<string, number>();
  const idCounts = new Map<string, number>();
  for (const record of normalizedRecords)
    urlCounts.set(record.url, (urlCounts.get(record.url) ?? 0) + 1);
  for (const record of normalizedRecords)
    if (record.id) idCounts.set(record.id, (idCounts.get(record.id) ?? 0) + 1);

  const candidates: Array<
    | { proposal: AtlasLinksImportProposal; kind: 'new' | 'updated' | 'unchanged' }
    | { conflict: AtlasLinksImportConflict }
  > = normalizedRecords.map((record) => {
    if (record.id && (idCounts.get(record.id) ?? 0) > 1)
      return { conflict: { record, reason: 'Multiple imported records use the same ID.' } };
    if ((urlCounts.get(record.url) ?? 0) > 1)
      return {
        conflict: { record, reason: 'Multiple imported records use the same normalized URL.' },
      };
    const idMatch = record.id ? byId.get(record.id) : undefined;
    const urlMatch = activeByUrl.get(record.url);
    if (idMatch?.deletedAt)
      return { conflict: { record, reason: 'The bookmark ID belongs to a deleted local record.' } };
    if (idMatch && urlMatch && idMatch.id !== urlMatch.id)
      return {
        conflict: {
          record,
          reason: 'The imported ID and URL match two different local bookmarks.',
        },
      };
    const target = idMatch ?? urlMatch;
    if (!target) return { proposal: { record, changes: [] }, kind: 'new' };
    const changes = editableChanges(record, target);
    return {
      proposal: { record, target, changes },
      kind: changes.length > 0 ? 'updated' : 'unchanged',
    };
  });

  const targetCounts = new Map<string, number>();
  for (const candidate of candidates)
    if ('proposal' in candidate && candidate.proposal.target)
      targetCounts.set(
        candidate.proposal.target.id,
        (targetCounts.get(candidate.proposal.target.id) ?? 0) + 1,
      );

  const preview: AtlasLinksImportPreview = {
    newBookmarks: [],
    updated: [],
    unchanged: [],
    conflicts: [],
  };
  for (const candidate of candidates) {
    if ('conflict' in candidate) {
      preview.conflicts.push(candidate.conflict);
      continue;
    }
    const target = candidate.proposal.target;
    if (target && (targetCounts.get(target.id) ?? 0) > 1) {
      preview.conflicts.push({
        record: candidate.proposal.record,
        reason: 'Multiple imported records match the same local bookmark.',
      });
      continue;
    }
    preview[candidate.kind === 'new' ? 'newBookmarks' : candidate.kind].push(candidate.proposal);
  }
  return preview;
}
