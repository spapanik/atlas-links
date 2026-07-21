export type Bookmark = {
  id: string;
  url: string;
  name: string;
  description: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
};
export type BookmarkStore = {
  schemaVersion: 1;
  revision: number;
  deviceId: string;
  updatedAt: string;
  bookmarks: Bookmark[];
};
export type BookmarkInput = Pick<Bookmark, 'url' | 'name' | 'description' | 'tags'>;

export const isIsoTimestamp = (value: unknown): value is string =>
  typeof value === 'string' &&
  !Number.isNaN(Date.parse(value)) &&
  new Date(value).toISOString() === value;

export function normalizeUrl(value: string): string {
  const url = new URL(value.trim());
  if (!['http:', 'https:'].includes(url.protocol))
    throw new Error('Only HTTP and HTTPS links can be saved.');
  url.hostname = url.hostname.toLowerCase();
  url.hash = '';
  if (url.pathname === '/' && !url.search) url.pathname = '';
  return url.toString().replace(/\/$/, '');
}

export function normalizeTags(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of values) {
    const value = raw.trim().replace(/\s+/g, ' ');
    const key = value.toLocaleLowerCase();
    if (value && !seen.has(key)) {
      seen.add(key);
      result.push(value);
    }
  }
  return result;
}

export function normalizeInput(input: BookmarkInput): BookmarkInput {
  const name = input.name.trim();
  if (!name) throw new Error('A name is required.');
  return {
    url: normalizeUrl(input.url),
    name,
    description: input.description.trim(),
    tags: normalizeTags(input.tags),
  };
}

export function parseStore(value: unknown): BookmarkStore {
  if (!value || typeof value !== 'object') throw new Error('Bookmark data is missing or invalid.');
  const store = value as Record<string, unknown>;
  if (
    store.schemaVersion !== 1 ||
    !Number.isInteger(store.revision) ||
    typeof store.deviceId !== 'string' ||
    !store.deviceId ||
    !isIsoTimestamp(store.updatedAt) ||
    !Array.isArray(store.bookmarks)
  )
    throw new Error('Unsupported or malformed bookmark store.');
  const bookmarks = store.bookmarks.map((raw) => {
    if (!raw || typeof raw !== 'object') throw new Error('Malformed bookmark.');
    const b = raw as Record<string, unknown>;
    if (
      typeof b.id !== 'string' ||
      !b.id ||
      typeof b.url !== 'string' ||
      typeof b.name !== 'string' ||
      typeof b.description !== 'string' ||
      !Array.isArray(b.tags) ||
      !b.tags.every((x) => typeof x === 'string') ||
      !isIsoTimestamp(b.createdAt) ||
      !isIsoTimestamp(b.updatedAt) ||
      (b.deletedAt !== undefined && !isIsoTimestamp(b.deletedAt))
    )
      throw new Error('Malformed bookmark.');
    const input = normalizeInput({
      url: b.url,
      name: b.name,
      description: b.description,
      tags: b.tags as string[],
    });
    return {
      id: b.id,
      ...input,
      createdAt: b.createdAt,
      updatedAt: b.updatedAt,
      ...(b.deletedAt ? { deletedAt: b.deletedAt as string } : {}),
    };
  });
  return {
    schemaVersion: 1,
    revision: store.revision as number,
    deviceId: store.deviceId,
    updatedAt: store.updatedAt as string,
    bookmarks,
  };
}

export function emptyStore(
  now = new Date().toISOString(),
  deviceId: string = crypto.randomUUID(),
): BookmarkStore {
  return { schemaVersion: 1, revision: 0, deviceId, updatedAt: now, bookmarks: [] };
}

const canonical = (value: unknown) => JSON.stringify(value, Object.keys(value as object).sort());
export function mergeStores(
  local: BookmarkStore,
  remote: BookmarkStore,
  now = new Date().toISOString(),
): BookmarkStore {
  const records = new Map(local.bookmarks.map((b) => [b.id, b]));
  for (const incoming of remote.bookmarks) {
    const current = records.get(incoming.id);
    if (
      !current ||
      incoming.updatedAt > current.updatedAt ||
      (incoming.updatedAt === current.updatedAt && canonical(incoming) > canonical(current))
    )
      records.set(incoming.id, incoming);
  }
  return {
    schemaVersion: 1,
    revision: Math.max(local.revision, remote.revision) + 1,
    deviceId: local.deviceId,
    updatedAt: now,
    bookmarks: [...records.values()].sort((a, b) => a.id.localeCompare(b.id)),
  };
}
