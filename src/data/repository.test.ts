import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyStore, type BookmarkStore } from '../domain/model';
import { ChromeBookmarkRepository } from './repository';

const now = '2026-01-01T00:00:00.000Z';

function chromeMock(initial: BookmarkStore) {
  let stored = initial;
  let syncDirty = false;
  let failNextWrite = false;
  let blockCleanWrite:
    | {
        started: () => void;
        wait: Promise<void>;
      }
    | undefined;
  const listeners = new Set<
    (changes: Record<string, chrome.storage.StorageChange>, area: string) => void
  >();
  const set = vi.fn(async (value: Record<string, unknown>) => {
    if (failNextWrite) {
      failNextWrite = false;
      throw new Error('Storage unavailable');
    }
    if (value.syncDirty === false && blockCleanWrite) {
      const block = blockCleanWrite;
      blockCleanWrite = undefined;
      block.started();
      await block.wait;
    }
    if (value.bookmarkStore) stored = value.bookmarkStore as BookmarkStore;
    if (typeof value.syncDirty === 'boolean') syncDirty = value.syncDirty;
    for (const listener of listeners) listener({ bookmarkStore: { newValue: stored } }, 'local');
  });
  const sendMessage = vi.fn(async () => undefined);
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: vi.fn(async () => ({ bookmarkStore: stored })),
        set,
      },
      onChanged: {
        addListener: (
          listener: (changes: Record<string, chrome.storage.StorageChange>, area: string) => void,
        ) => listeners.add(listener),
        removeListener: (
          listener: (changes: Record<string, chrome.storage.StorageChange>, area: string) => void,
        ) => listeners.delete(listener),
      },
    },
    runtime: { sendMessage },
  });
  return {
    get stored() {
      return stored;
    },
    get syncDirty() {
      return syncDirty;
    },
    set,
    sendMessage,
    replaceStore: (store: BookmarkStore) => {
      stored = store;
    },
    blockNextCleanWrite: () => {
      let markStarted!: () => void;
      let release!: () => void;
      const started = new Promise<void>((resolve) => {
        markStarted = resolve;
      });
      const wait = new Promise<void>((resolve) => {
        release = resolve;
      });
      blockCleanWrite = { started: markStarted, wait };
      return { started, release };
    },
    failNextWrite: () => {
      failNextWrite = true;
    },
  };
}

describe('ChromeBookmarkRepository mutation validation', () => {
  beforeEach(() => vi.unstubAllGlobals());

  it('rejects an update for an unknown ID without writing or scheduling sync', async () => {
    const store = emptyStore(now, 'device');
    const state = chromeMock(store);

    await expect(
      new ChromeBookmarkRepository().update('missing', {
        url: 'https://missing.example',
        name: 'Missing',
        description: '',
        tags: [],
      }),
    ).rejects.toThrow('Bookmark not found.');

    expect(state.stored).toEqual(store);
    expect(state.stored.revision).toBe(0);
    expect(state.set).not.toHaveBeenCalled();
    expect(state.sendMessage).not.toHaveBeenCalled();
  });

  it('rejects removal of an unknown ID without writing or scheduling sync', async () => {
    const store = emptyStore(now, 'device');
    const state = chromeMock(store);

    await expect(new ChromeBookmarkRepository().remove('missing')).rejects.toThrow(
      'Bookmark not found.',
    );

    expect(state.stored).toEqual(store);
    expect(state.stored.revision).toBe(0);
    expect(state.set).not.toHaveBeenCalled();
    expect(state.sendMessage).not.toHaveBeenCalled();
  });

  it('marks a successful mutation pending without rewriting sync status', async () => {
    const state = chromeMock(emptyStore(now, 'device'));

    await new ChromeBookmarkRepository().create({
      url: 'https://example.com',
      name: 'Example',
      description: '',
      tags: [],
    });

    expect(state.syncDirty).toBe(true);
    expect(state.set).toHaveBeenCalledWith(
      expect.objectContaining({
        syncDirty: true,
      }),
    );
    expect(state.set).toHaveBeenCalledWith(
      expect.not.objectContaining({ syncStatus: expect.anything() }),
    );
  });
});

describe('ChromeBookmarkRepository sync reconciliation', () => {
  beforeEach(() => vi.unstubAllGlobals());

  it('merges different content even when the current revision equals the snapshot revision', async () => {
    const snapshot = emptyStore(now, 'device');
    snapshot.revision = 4;
    snapshot.bookmarks.push({
      id: 'existing',
      url: 'https://existing.example',
      name: 'Existing',
      description: '',
      tags: [],
      createdAt: now,
      updatedAt: now,
    });
    const state = chromeMock(snapshot);
    const concurrent = structuredClone(snapshot);
    concurrent.bookmarks.push({
      id: 'concurrent',
      url: 'https://concurrent.example',
      name: 'Concurrent',
      description: '',
      tags: [],
      createdAt: now,
      updatedAt: now,
    });
    state.replaceStore(concurrent);
    const synced = { ...snapshot, revision: 5 };

    const result = await new ChromeBookmarkRepository().commitSync(snapshot, synced);

    expect(result.concurrentChanges).toBe(true);
    expect(result.store.bookmarks.map((bookmark) => bookmark.id)).toEqual([
      'concurrent',
      'existing',
    ]);
    expect(state.stored.bookmarks.map((bookmark) => bookmark.id)).toEqual([
      'concurrent',
      'existing',
    ]);
    expect(state.stored.revision).toBe(6);
    expect(state.syncDirty).toBe(true);
  });

  it('serializes a mutation queued during the final clean sync write', async () => {
    const snapshot = emptyStore(now, 'device');
    const state = chromeMock(snapshot);
    const repository = new ChromeBookmarkRepository();
    const synced = {
      ...snapshot,
      revision: 1,
      bookmarks: [
        {
          id: 'remote',
          url: 'https://remote.example',
          name: 'Remote',
          description: '',
          tags: [],
          createdAt: now,
          updatedAt: now,
        },
      ],
    };
    const cleanWrite = state.blockNextCleanWrite();

    const commit = repository.commitSync(snapshot, synced);
    await cleanWrite.started;
    const mutation = repository.create({
      url: 'https://local.example',
      name: 'Local',
      description: '',
      tags: [],
    });
    cleanWrite.release();

    const [commitResult] = await Promise.all([commit, mutation]);
    expect(commitResult.concurrentChanges).toBe(false);
    expect(state.stored.bookmarks.map((bookmark) => bookmark.name).sort()).toEqual([
      'Local',
      'Remote',
    ]);
    expect(state.syncDirty).toBe(true);
  });
});

describe('ChromeBookmarkRepository browser import', () => {
  beforeEach(() => vi.unstubAllGlobals());

  it('commits valid unique bookmarks in one revision and one storage write', async () => {
    const state = chromeMock(emptyStore(now, 'device'));
    const repository = new ChromeBookmarkRepository();
    const subscriber = vi.fn();
    repository.subscribe(subscriber);

    const result = await repository.importBrowserBookmarks([
      {
        url: 'HTTPS://EXAMPLE.COM/#part',
        name: ' Example ',
        description: ' Notes ',
        createdAt: '2023-11-14T22:13:20.000Z',
      },
      { url: 'https://example.com', name: 'Repeated', description: '' },
      { url: 'https://two.example', name: 'Two', description: '', createdAt: 'invalid' },
    ]);

    expect(result.imported).toHaveLength(2);
    expect(result.skipped).toBe(1);
    expect(result.imported[0]).toMatchObject({
      url: 'https://example.com',
      name: 'Example',
      description: 'Notes',
      tags: [],
      createdAt: '2023-11-14T22:13:20.000Z',
    });
    expect(result.imported[1].createdAt).not.toBe('invalid');
    expect(state.stored.revision).toBe(1);
    expect(state.stored.bookmarks).toHaveLength(2);
    expect(state.set).toHaveBeenCalledTimes(1);
    expect(state.set).toHaveBeenCalledWith(
      expect.objectContaining({ bookmarkStore: expect.any(Object), syncDirty: true }),
    );
    expect(subscriber).toHaveBeenCalledTimes(1);
    expect(state.sendMessage).toHaveBeenCalledWith({ type: 'schedule-sync' });
  });

  it('skips a URL added since review without creating another revision', async () => {
    const store = emptyStore(now, 'device');
    store.bookmarks.push({
      id: 'existing',
      url: 'https://example.com',
      name: 'Existing',
      description: '',
      tags: [],
      createdAt: now,
      updatedAt: now,
    });
    const state = chromeMock(store);
    const repository = new ChromeBookmarkRepository();
    const result = await repository.importBrowserBookmarks([
      { url: 'https://EXAMPLE.com/#new', name: 'Duplicate', description: '' },
    ]);

    expect(result).toEqual({ imported: [], skipped: 1 });
    expect(state.set).not.toHaveBeenCalled();
    expect(state.stored.revision).toBe(0);
  });

  it('leaves the store unchanged after persistence failure and can retry safely', async () => {
    const state = chromeMock(emptyStore(now, 'device'));
    const repository = new ChromeBookmarkRepository();
    const input = [{ url: 'https://example.com', name: 'Example', description: '' }];
    state.failNextWrite();

    await expect(repository.importBrowserBookmarks(input)).rejects.toThrow('Storage unavailable');
    expect(state.stored.bookmarks).toEqual([]);
    expect(state.stored.revision).toBe(0);

    await expect(repository.importBrowserBookmarks(input)).resolves.toMatchObject({ skipped: 0 });
    expect(state.stored.bookmarks).toHaveLength(1);
    expect(state.stored.revision).toBe(1);
  });
});

describe('ChromeBookmarkRepository Atlas Links import', () => {
  beforeEach(() => vi.unstubAllGlobals());

  it('atomically applies mixed updates and additions in one dirty revision', async () => {
    const store = emptyStore(now, 'device');
    store.bookmarks = [
      {
        id: 'existing',
        url: 'https://old.example',
        name: 'Old name',
        description: '',
        tags: ['Old'],
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'omitted',
        url: 'https://omitted.example',
        name: 'Untouched',
        description: '',
        tags: [],
        createdAt: now,
        updatedAt: now,
      },
    ];
    const state = chromeMock(store);
    const repository = new ChromeBookmarkRepository();
    const subscriber = vi.fn();
    repository.subscribe(subscriber);

    const result = await repository.importAtlasLinks([
      {
        id: 'existing',
        url: 'https://changed.example',
        name: 'Edited name',
        description: 'Edited description',
        tags: ['Work'],
      },
      {
        id: 'preserved-new-id',
        url: 'https://new.example',
        name: 'New',
        description: '',
        tags: ['Reference'],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      },
      { url: 'https://generated.example', name: 'Generated', description: '', tags: [] },
    ]);

    expect(result.updated).toHaveLength(1);
    expect(result.created).toHaveLength(2);
    expect(result.created[0]).toMatchObject({
      id: 'preserved-new-id',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    });
    expect(result.created[1].id).toBeTruthy();
    expect(state.stored.revision).toBe(1);
    expect(state.stored.bookmarks.find((item) => item.id === 'existing')).toMatchObject({
      url: 'https://changed.example',
      name: 'Edited name',
      tags: ['Work'],
      createdAt: now,
    });
    expect(state.stored.bookmarks.find((item) => item.id === 'existing')?.updatedAt).not.toBe(now);
    expect(state.stored.bookmarks.find((item) => item.id === 'omitted')?.name).toBe('Untouched');
    expect(state.set).toHaveBeenCalledTimes(1);
    expect(state.set).toHaveBeenCalledWith(
      expect.objectContaining({ bookmarkStore: expect.any(Object), syncDirty: true }),
    );
    expect(subscriber).toHaveBeenCalledTimes(1);
    expect(state.sendMessage).toHaveBeenCalledWith({ type: 'schedule-sync' });
  });

  it('does not write for an unchanged round trip or conflicts', async () => {
    const store = emptyStore(now, 'device');
    store.bookmarks = [
      {
        id: 'one',
        url: 'https://one.example',
        name: 'One',
        description: '',
        tags: [],
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'two',
        url: 'https://two.example',
        name: 'Two',
        description: '',
        tags: [],
        createdAt: now,
        updatedAt: now,
      },
    ];
    const state = chromeMock(store);
    const repository = new ChromeBookmarkRepository();
    const result = await repository.importAtlasLinks([
      { id: 'one', url: 'https://one.example', name: 'One', description: '', tags: [] },
      { id: 'two', url: 'https://one.example', name: 'Conflict', description: '', tags: [] },
    ]);

    expect(result.created).toEqual([]);
    expect(result.updated).toEqual([]);
    expect(result.conflicts).toHaveLength(2);
    expect(state.set).not.toHaveBeenCalled();
    expect(state.stored.revision).toBe(0);
  });

  it('leaves persistence atomic and retries without duplicate creation', async () => {
    const state = chromeMock(emptyStore(now, 'device'));
    const repository = new ChromeBookmarkRepository();
    const input = [
      {
        id: 'new',
        url: 'https://new.example',
        name: 'New',
        description: '',
        tags: ['Work'],
      },
    ];
    state.failNextWrite();

    await expect(repository.importAtlasLinks(input)).rejects.toThrow('Storage unavailable');
    expect(state.stored.bookmarks).toEqual([]);
    expect(state.stored.revision).toBe(0);

    await expect(repository.importAtlasLinks(input)).resolves.toMatchObject({ unchanged: 0 });
    expect(state.stored.bookmarks.map((bookmark) => bookmark.id)).toEqual(['new']);
    expect(state.stored.revision).toBe(1);
  });
});
