import {
  emptyStore,
  isIsoTimestamp,
  mergeStores,
  normalizeInput,
  normalizeUrl,
  parseStore,
  type Bookmark,
  type BookmarkInput,
  type BookmarkStore,
} from '../domain/model';
import type { BrowserBookmarkImport } from '../import/browserBookmarks';
import {
  prepareAtlasLinksImport,
  type AtlasLinksImportConflict,
  type AtlasLinksImportRecord,
} from '../import/atlasLinks';
import { withBookmarkStoreLock } from './storeLock';

const STORE_KEY = 'bookmarkStore';
export interface BookmarkRepository {
  getStore(): Promise<BookmarkStore>;
  saveStore(store: BookmarkStore): Promise<void>;
  commitSync(snapshot: BookmarkStore, syncedStore: BookmarkStore): Promise<SyncCommitResult>;
  create(input: BookmarkInput): Promise<Bookmark>;
  update(id: string, input: BookmarkInput): Promise<Bookmark>;
  /** Creates a tombstone, or throws "Bookmark not found." without writing for an unknown ID. */
  remove(id: string): Promise<void>;
  importBrowserBookmarks(inputs: readonly BrowserBookmarkImport[]): Promise<BrowserImportResult>;
  importAtlasLinks(inputs: readonly AtlasLinksImportRecord[]): Promise<AtlasLinksImportResult>;
  overwriteAtlasLinks(inputs: readonly AtlasLinksImportRecord[]): Promise<AtlasLinksImportResult>;
  subscribe(listener: () => void): () => void;
}

export type BrowserImportResult = {
  imported: Bookmark[];
  skipped: number;
};

export type AtlasLinksImportResult = {
  created: Bookmark[];
  updated: Bookmark[];
  unchanged: number;
  conflicts: AtlasLinksImportConflict[];
};

export type SyncCommitResult = {
  store: BookmarkStore;
  concurrentChanges: boolean;
};

function storesMatch(left: BookmarkStore, right: BookmarkStore) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export class ChromeBookmarkRepository implements BookmarkRepository {
  private async readStore() {
    const raw = (await chrome.storage.local.get(STORE_KEY))[STORE_KEY];
    if (!raw) {
      const store = emptyStore();
      await this.writeStore(store, true);
      return store;
    }
    return parseStore(raw);
  }
  private async writeStore(store: BookmarkStore, syncDirty: boolean) {
    const parsed = parseStore(store);
    await chrome.storage.local.set({ [STORE_KEY]: parsed, syncDirty });
    return parsed;
  }
  getStore() {
    return withBookmarkStoreLock(() => this.readStore());
  }
  saveStore(store: BookmarkStore) {
    return withBookmarkStoreLock(async () => {
      await this.writeStore(store, true);
    });
  }
  commitSync(snapshot: BookmarkStore, syncedStore: BookmarkStore) {
    return withBookmarkStoreLock(async () => {
      const current = await this.readStore();
      const concurrentChanges = !storesMatch(current, snapshot);
      const store = concurrentChanges ? mergeStores(current, syncedStore) : syncedStore;
      return {
        store: await this.writeStore(store, concurrentChanges),
        concurrentChanges,
      };
    });
  }
  private async mutate(fn: (items: Bookmark[], now: string) => Bookmark[]) {
    const next = await withBookmarkStoreLock(async () => {
      const store = await this.readStore();
      const now = new Date().toISOString();
      const result = {
        ...store,
        revision: store.revision + 1,
        updatedAt: now,
        bookmarks: fn(store.bookmarks, now),
      };
      await this.writeStore(result, true);
      return result;
    });
    void chrome.runtime.sendMessage({ type: 'schedule-sync' }).catch(() => undefined);
    return next;
  }
  async create(input: BookmarkInput) {
    const normalized = normalizeInput(input);
    let created!: Bookmark;
    await this.mutate((items, now) => {
      if (items.some((b) => !b.deletedAt && normalizeUrl(b.url) === normalized.url))
        throw new Error('This URL is already saved.');
      created = { id: crypto.randomUUID(), ...normalized, createdAt: now, updatedAt: now };
      return [...items, created];
    });
    return created;
  }
  async update(id: string, input: BookmarkInput) {
    const normalized = normalizeInput(input);
    let updated!: Bookmark;
    await this.mutate((items, now) => {
      if (!items.some((bookmark) => bookmark.id === id)) throw new Error('Bookmark not found.');
      if (items.some((b) => b.id !== id && !b.deletedAt && normalizeUrl(b.url) === normalized.url))
        throw new Error('Another bookmark already uses this URL.');
      return items.map((b) =>
        b.id === id ? (updated = { ...b, ...normalized, updatedAt: now, deletedAt: undefined }) : b,
      );
    });
    return updated;
  }
  async remove(id: string) {
    await this.mutate((items, now) => {
      if (!items.some((bookmark) => bookmark.id === id)) throw new Error('Bookmark not found.');
      return items.map((b) => (b.id === id ? { ...b, deletedAt: now, updatedAt: now } : b));
    });
  }
  async importBrowserBookmarks(inputs: readonly BrowserBookmarkImport[]) {
    const normalized = inputs.map((input) => ({
      ...normalizeInput({ ...input, tags: [] }),
      createdAt: isIsoTimestamp(input.createdAt) ? input.createdAt : undefined,
    }));
    const result = await withBookmarkStoreLock(async () => {
      const store = await this.readStore();
      const existingUrls = new Set(
        store.bookmarks
          .filter((bookmark) => !bookmark.deletedAt)
          .map((bookmark) => normalizeUrl(bookmark.url)),
      );
      const now = new Date().toISOString();
      const imported: Bookmark[] = [];
      let skipped = 0;
      for (const input of normalized) {
        if (existingUrls.has(input.url)) {
          skipped += 1;
          continue;
        }
        existingUrls.add(input.url);
        imported.push({
          id: crypto.randomUUID(),
          url: input.url,
          name: input.name,
          description: input.description,
          tags: [],
          createdAt: input.createdAt ?? now,
          updatedAt: now,
        });
      }
      if (imported.length === 0) return { imported, skipped };

      await this.writeStore(
        {
          ...store,
          revision: store.revision + 1,
          updatedAt: now,
          bookmarks: [...store.bookmarks, ...imported],
        },
        true,
      );
      return { imported, skipped };
    });
    if (result.imported.length === 0) return result;
    void chrome.runtime.sendMessage({ type: 'schedule-sync' }).catch(() => undefined);
    return result;
  }
  async importAtlasLinks(inputs: readonly AtlasLinksImportRecord[]) {
    const result = await withBookmarkStoreLock(async () => {
      const store = await this.readStore();
      const preview = prepareAtlasLinksImport(inputs, store.bookmarks);
      const now = new Date().toISOString();
      const updates = new Map(
        preview.updated.map((proposal) => [proposal.target!.id, proposal.record]),
      );
      const updated: Bookmark[] = [];
      const bookmarks = store.bookmarks.map((bookmark) => {
        const record = updates.get(bookmark.id);
        if (!record) return bookmark;
        const next: Bookmark = {
          ...bookmark,
          url: record.url,
          name: record.name,
          description: record.description,
          tags: record.tags,
          updatedAt: now,
          deletedAt: undefined,
        };
        updated.push(next);
        return next;
      });

      const usedIds = new Set(bookmarks.map((bookmark) => bookmark.id));
      const created: Bookmark[] = preview.newBookmarks.map(({ record }) => {
        let id = record.id;
        while (!id || usedIds.has(id)) id = crypto.randomUUID();
        usedIds.add(id);
        return {
          id,
          url: record.url,
          name: record.name,
          description: record.description,
          tags: record.tags,
          createdAt: record.createdAt ?? now,
          updatedAt: record.updatedAt ?? now,
        };
      });

      if (created.length > 0 || updated.length > 0) {
        await this.writeStore(
          {
            ...store,
            revision: store.revision + 1,
            updatedAt: now,
            bookmarks: [...bookmarks, ...created],
          },
          true,
        );
      }
      return {
        created,
        updated,
        unchanged: preview.unchanged.length,
        conflicts: preview.conflicts,
      };
    });
    if (result.created.length > 0 || result.updated.length > 0) {
      void chrome.runtime.sendMessage({ type: 'schedule-sync' }).catch(() => undefined);
    }
    return result;
  }
  subscribe(listener: () => void) {
    const handler = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && changes[STORE_KEY]) listener();
    };
    chrome.storage.onChanged.addListener(handler);
    return () => chrome.storage.onChanged.removeListener(handler);
  }

  async overwriteAtlasLinks(inputs: readonly AtlasLinksImportRecord[]) {
    const result = await withBookmarkStoreLock(async () => {
      const store = await this.readStore();
      const now = new Date().toISOString();
      const usedIds = new Set<string>();
      const created: Bookmark[] = inputs.map((record) => {
        let id = record.id;
        while (!id || usedIds.has(id)) id = crypto.randomUUID();
        usedIds.add(id);
        return {
          id,
          url: record.url,
          name: record.name,
          description: record.description,
          tags: record.tags,
          createdAt: record.createdAt ?? now,
          updatedAt: record.updatedAt ?? now,
        };
      });
      await this.writeStore(
        {
          ...store,
          schemaVersion: 1,
          revision: store.revision + 1,
          updatedAt: now,
          bookmarks: created,
        },
        true,
      );
      return { created, updated: [], unchanged: 0, conflicts: [] };
    });
    if (result.created.length > 0) {
      void chrome.runtime.sendMessage({ type: 'schedule-sync' }).catch(() => undefined);
    }
    return result;
  }
}
