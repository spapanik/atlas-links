import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BookmarkRepository } from '../data/repository';
import { emptyStore, mergeStores, type BookmarkStore } from '../domain/model';
import {
  ChromeIdentityService,
  GoogleDriveStore,
  MAX_REMOTE_DOCUMENT_BYTES,
  SyncEngine,
  type DriveStore,
  type IdentityService,
} from './services';
import { SyncError } from './failures';

const now = '2026-01-01T00:00:00.000Z';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function concurrentStore(snapshot: BookmarkStore) {
  return {
    ...snapshot,
    revision: snapshot.revision + 1,
    bookmarks: [
      ...snapshot.bookmarks,
      {
        id: 'concurrent',
        url: 'https://concurrent.example',
        name: 'Concurrent',
        description: '',
        tags: [],
        createdAt: now,
        updatedAt: now,
      },
    ],
  };
}

function chromeSyncState(initial: Record<string, unknown> = {}) {
  const values: Record<string, unknown> = { ...initial };
  const get = vi.fn(async (keys: string | string[]) => {
    const selected = Array.isArray(keys) ? keys : [keys];
    return Object.fromEntries(selected.map((key) => [key, values[key]]));
  });
  const set = vi.fn(async (items: Record<string, unknown>) => {
    Object.assign(values, items);
  });
  const remove = vi.fn(async (keys: string | string[]) => {
    for (const key of Array.isArray(keys) ? keys : [keys]) delete values[key];
  });
  const create = vi.fn(async () => undefined);
  const clear = vi.fn(async () => true);
  vi.stubGlobal('chrome', {
    storage: { local: { get, set, remove } },
    alarms: { create, clear },
    runtime: { sendMessage: vi.fn(async () => undefined) },
  });
  return { values, get, set, remove, create, clear };
}

function repositoryFor(snapshot: BookmarkStore) {
  return {
    getStore: vi.fn(async () => snapshot),
    saveStore: vi.fn(async () => undefined),
    commitSync: vi.fn(async (_base: BookmarkStore, synced: BookmarkStore) => ({
      store: synced,
      concurrentChanges: false,
    })),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    importBrowserBookmarks: vi.fn(),
    importAtlasLinks: vi.fn(),
    overwriteAtlasLinks: vi.fn(),
    subscribe: () => () => undefined,
  } satisfies BookmarkRepository;
}

describe('ChromeIdentityService sign out', () => {
  beforeEach(() => vi.unstubAllGlobals());

  function chromeIdentityMock(getAuthToken: ReturnType<typeof vi.fn>) {
    const clearAllCachedAuthTokens = vi.fn(async () => undefined);
    const removeCachedAuthToken = vi.fn(async () => undefined);
    vi.stubGlobal('chrome', {
      identity: { getAuthToken, clearAllCachedAuthTokens, removeCachedAuthToken },
    });
    return { clearAllCachedAuthTokens, removeCachedAuthToken };
  }

  it('revokes the current token once in form-encoded POST data and clears all caches', async () => {
    const identity = chromeIdentityMock(vi.fn(async () => ({ token: 'access token/one' })));
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(new ChromeIdentityService().signOut()).resolves.toEqual({});

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith('https://oauth2.googleapis.com/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'token=access+token%2Fone',
    });
    expect(identity.clearAllCachedAuthTokens).toHaveBeenCalledOnce();
    expect(identity.removeCachedAuthToken).not.toHaveBeenCalled();
    expect(fetchMock.mock.invocationCallOrder[0]).toBeLessThan(
      identity.clearAllCachedAuthTokens.mock.invocationCallOrder[0]!,
    );
  });

  it('clears all caches and returns a warning when no token is available', async () => {
    const identity = chromeIdentityMock(vi.fn(async () => ({})));
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(new ChromeIdentityService().signOut()).resolves.toEqual({
      warning: expect.stringMatching(/could not be confirmed revoked/i),
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(identity.clearAllCachedAuthTokens).toHaveBeenCalledOnce();
  });

  it('clears all caches when token lookup fails', async () => {
    const identity = chromeIdentityMock(
      vi.fn(async () => Promise.reject(new Error('Identity unavailable'))),
    );
    vi.stubGlobal('fetch', vi.fn());

    await expect(new ChromeIdentityService().signOut()).resolves.toEqual({
      warning: expect.stringMatching(/could not be confirmed revoked/i),
    });
    expect(identity.clearAllCachedAuthTokens).toHaveBeenCalledOnce();
  });

  it.each([
    ['an error response', vi.fn(async () => new Response(null, { status: 400 }))],
    ['a network rejection', vi.fn(async () => Promise.reject(new Error('Offline')))],
  ])('clears all caches and returns a warning after %s', async (_label, fetchMock) => {
    const identity = chromeIdentityMock(vi.fn(async () => ({ token: 'access-token' })));
    vi.stubGlobal('fetch', fetchMock);

    await expect(new ChromeIdentityService().signOut()).resolves.toEqual({
      warning: expect.stringMatching(/could not be revoked/i),
    });
    expect(identity.clearAllCachedAuthTokens).toHaveBeenCalledOnce();
  });

  it('reports a cache-clearing failure without rejecting sign out', async () => {
    const clearAllCachedAuthTokens = vi.fn(async () =>
      Promise.reject(new Error('Cache unavailable')),
    );
    vi.stubGlobal('chrome', {
      identity: {
        getAuthToken: vi.fn(async () => ({ token: 'access-token' })),
        clearAllCachedAuthTokens,
        removeCachedAuthToken: vi.fn(async () => undefined),
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 200 })),
    );

    await expect(new ChromeIdentityService().signOut()).resolves.toEqual({
      warning: expect.stringMatching(/cached Google authorization/i),
    });
  });

  it('falls back to removing the fetched token when clear-all is unavailable', async () => {
    const removeCachedAuthToken = vi.fn(async () => undefined);
    vi.stubGlobal('chrome', {
      identity: {
        getAuthToken: vi.fn(async () => ({ token: 'access-token' })),
        clearAllCachedAuthTokens: undefined,
        removeCachedAuthToken,
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 200 })),
    );

    await expect(new ChromeIdentityService().signOut()).resolves.toEqual({});
    expect(removeCachedAuthToken).toHaveBeenCalledWith({ token: 'access-token' });
  });
});

describe('ChromeIdentityService authorization', () => {
  beforeEach(() => vi.unstubAllGlobals());

  it.each([
    ['consent denial', vi.fn(async () => Promise.reject(new Error('The user did not approve.')))],
    ['missing token', vi.fn(async () => ({}))],
  ])('classifies %s without depending on Chrome error text', async (_label, getAuthToken) => {
    vi.stubGlobal('chrome', { identity: { getAuthToken } });

    await expect(new ChromeIdentityService().token(true)).rejects.toMatchObject({
      code: 'authorization',
    });
  });
});

describe('GoogleDriveStore', () => {
  beforeEach(() => vi.unstubAllGlobals());

  it('lists app data with a valid minimal field selection', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ files: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const q = encodeURIComponent(
      "name='atlas-links.v1.json' and 'appDataFolder' in parents and trashed=false",
    );

    await expect(new GoogleDriveStore().download('access-token')).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${q}&fields=files(id)&pageSize=1`,
      { headers: { Authorization: 'Bearer access-token' } },
    );
  });

  it('downloads an existing app-data file using its listed ID', async () => {
    const store = emptyStore(now, 'remote-device');
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ files: [{ id: 'drive-file' }] }), { status: 200 }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify(store), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const q = encodeURIComponent(
      "name='atlas-links.v1.json' and 'appDataFolder' in parents and trashed=false",
    );

    await expect(new GoogleDriveStore().download('access-token')).resolves.toEqual({
      id: 'drive-file',
      store,
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${q}&fields=files(id)&pageSize=1`,
      { headers: { Authorization: 'Bearer access-token' } },
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://www.googleapis.com/drive/v3/files/drive-file?alt=media',
      { headers: { Authorization: 'Bearer access-token' } },
    );
  });

  it('uses a cached file ID without listing app data', async () => {
    const store = emptyStore(now, 'remote-device');
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(store), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(new GoogleDriveStore().download('access-token', 'cached-file')).resolves.toEqual({
      id: 'cached-file',
      store,
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      'https://www.googleapis.com/drive/v3/files/cached-file?alt=media',
      { headers: { Authorization: 'Bearer access-token' } },
    );
  });

  it('classifies invalid remote JSON without returning partial data', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{not json', { status: 200 })));

    await expect(
      new GoogleDriveStore().download('access-token', 'drive-file'),
    ).rejects.toMatchObject({
      code: 'corrupt-remote',
      details: { remoteFileId: 'drive-file' },
    });
  });

  it('rejects an oversized remote document before reading it', async () => {
    const text = vi.fn(async () => '{}');
    const response = {
      ok: true,
      headers: new Headers({ 'Content-Length': String(MAX_REMOTE_DOCUMENT_BYTES + 1) }),
      text,
    } as unknown as Response;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));

    await expect(
      new GoogleDriveStore().download('access-token', 'drive-file'),
    ).rejects.toMatchObject({ code: 'corrupt-remote' });
    expect(text).not.toHaveBeenCalled();
  });

  it('updates an existing file without an unverified conditional header', async () => {
    const previous = emptyStore(now, 'remote-device');
    const store = { ...previous, revision: 1 };
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await new GoogleDriveStore().upload('access-token', store, 'drive-file');

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      'https://www.googleapis.com/upload/drive/v3/files/drive-file?uploadType=media',
      {
        method: 'PATCH',
        headers: {
          Authorization: 'Bearer access-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(store),
      },
    );
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(new Headers(init.headers).has('If-Match')).toBe(false);
  });

  it('creates the app-data file with the expected multipart request', async () => {
    const store = emptyStore(now, 'local-device');
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ id: 'created-file' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const boundary = 'atlas_links_boundary';
    const metadata = JSON.stringify({
      name: 'atlas-links.v1.json',
      parents: ['appDataFolder'],
    });
    const multipart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(store)}\r\n--${boundary}--`;

    await expect(new GoogleDriveStore().upload('access-token', store)).resolves.toBe(
      'created-file',
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer access-token',
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body: multipart,
      },
    );
  });

  it.each([
    [401, 'authorization'],
    [429, 'rate-limit'],
    [503, 'transient-service'],
  ])('returns a structured error for HTTP %i', async (status, code) => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(null, { status, statusText: 'Failure' })),
    );

    await expect(new GoogleDriveStore().download('access-token')).rejects.toMatchObject({ code });
  });
});

describe('SyncEngine concurrency', () => {
  beforeEach(() => vi.unstubAllGlobals());

  it('is single-flight and preserves a local mutation made while upload is pending', async () => {
    const snapshot = emptyStore(now, 'device');
    let current = snapshot;
    const uploadStarted = deferred();
    const releaseUpload = deferred();
    const sendMessage = vi.fn(async () => undefined);
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: vi.fn(async () => ({})),
          set: vi.fn(async () => undefined),
          remove: vi.fn(async () => undefined),
        },
      },
      alarms: {
        create: vi.fn(async () => undefined),
        clear: vi.fn(async () => true),
      },
      runtime: { sendMessage },
    });

    const repository = {
      getStore: vi.fn(async () => snapshot),
      saveStore: vi.fn(async (store: BookmarkStore) => {
        current = store;
      }),
      commitSync: vi.fn(async (base: BookmarkStore, synced: BookmarkStore) => {
        const concurrentChanges = JSON.stringify(current) !== JSON.stringify(base);
        current = concurrentChanges ? mergeStores(current, synced, now) : synced;
        return { store: current, concurrentChanges };
      }),
      create: async () => Promise.reject(new Error('Not used in this test.')),
      update: async () => Promise.reject(new Error('Not used in this test.')),
      remove: async () => Promise.reject(new Error('Not used in this test.')),
      importBrowserBookmarks: async () => Promise.reject(new Error('Not used in this test.')),
      importAtlasLinks: async () => Promise.reject(new Error('Not used in this test.')),
      overwriteAtlasLinks: async () => Promise.reject(new Error('Not used in this test.')),
      subscribe: () => () => undefined,
    } satisfies BookmarkRepository;
    const identity = {
      token: vi.fn(async () => 'token'),
      signOut: vi.fn(async () => undefined),
    } satisfies IdentityService;
    const drive = {
      download: vi.fn(async () => undefined),
      upload: vi.fn(async () => {
        uploadStarted.resolve();
        await releaseUpload.promise;
        return 'drive-file';
      }),
    } satisfies DriveStore;
    const engine = new SyncEngine(repository, identity, drive);

    const first = engine.sync(true);
    const second = engine.sync(true);
    await uploadStarted.promise;
    current = concurrentStore(snapshot);
    releaseUpload.resolve();
    await Promise.all([first, second]);

    expect(drive.upload).toHaveBeenCalledTimes(1);
    expect(repository.commitSync).toHaveBeenCalledTimes(1);
    expect(current.bookmarks.map((bookmark) => bookmark.id)).toContain('concurrent');
    expect(sendMessage).toHaveBeenCalledWith({ type: 'schedule-sync' });
    expect(chrome.storage.local.set).toHaveBeenLastCalledWith({
      syncStatus: expect.objectContaining({ state: 'dirty' }),
    });
  });

  it('transitions from syncing to idle after a clean sync commit', async () => {
    const snapshot = emptyStore(now, 'device');
    const set = vi.fn(async () => undefined);
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: vi.fn(async () => ({})),
          set,
          remove: vi.fn(async () => undefined),
        },
      },
      alarms: {
        create: vi.fn(async () => undefined),
        clear: vi.fn(async () => true),
      },
      runtime: { sendMessage: vi.fn(async () => undefined) },
    });
    const repository = {
      getStore: vi.fn(async () => snapshot),
      saveStore: vi.fn(async () => undefined),
      commitSync: vi.fn(async () => ({ store: snapshot, concurrentChanges: false })),
      create: async () => Promise.reject(new Error('Not used in this test.')),
      update: async () => Promise.reject(new Error('Not used in this test.')),
      remove: async () => Promise.reject(new Error('Not used in this test.')),
      importBrowserBookmarks: async () => Promise.reject(new Error('Not used in this test.')),
      importAtlasLinks: async () => Promise.reject(new Error('Not used in this test.')),
      overwriteAtlasLinks: async () => Promise.reject(new Error('Not used in this test.')),
      subscribe: () => () => undefined,
    } satisfies BookmarkRepository;
    const identity = {
      token: vi.fn(async () => 'token'),
      signOut: vi.fn(async () => undefined),
    } satisfies IdentityService;
    const drive = {
      download: vi.fn(async () => undefined),
      upload: vi.fn(async () => 'drive-file'),
    } satisfies DriveStore;

    await new SyncEngine(repository, identity, drive).sync(true);

    expect(set).toHaveBeenNthCalledWith(1, { syncStatus: { state: 'syncing' } });
    expect(set).toHaveBeenLastCalledWith({
      syncStatus: expect.objectContaining({ state: 'idle' }),
    });
  });

  it('does not publish a syncing status when non-interactive authorization is unavailable', async () => {
    const set = vi.fn(async () => undefined);
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: vi.fn(async () => ({ syncStatus: { state: 'idle' } })),
          set,
          remove: vi.fn(async () => undefined),
        },
      },
      alarms: {
        create: vi.fn(async () => undefined),
        clear: vi.fn(async () => true),
      },
      runtime: { sendMessage: vi.fn(async () => undefined) },
    });
    const repository = {
      getStore: vi.fn(),
      saveStore: vi.fn(),
      commitSync: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
      importBrowserBookmarks: vi.fn(),
      importAtlasLinks: vi.fn(),
      overwriteAtlasLinks: vi.fn(),
      subscribe: () => () => undefined,
    } satisfies BookmarkRepository;
    const identity = {
      token: vi.fn(async () => Promise.reject(new SyncError('authorization'))),
      signOut: vi.fn(async () => undefined),
    } satisfies IdentityService;
    const drive = { download: vi.fn(), upload: vi.fn() } satisfies DriveStore;

    await expect(new SyncEngine(repository, identity, drive).sync(false)).rejects.toMatchObject({
      code: 'authorization',
    });

    expect(identity.token).toHaveBeenCalledWith(false);
    expect(set).toHaveBeenCalledWith({
      syncStatus: expect.objectContaining({ state: 'error', code: 'authorization' }),
    });
    expect(repository.getStore).not.toHaveBeenCalled();
    expect(drive.download).not.toHaveBeenCalled();
  });

  it('does not request a token when non-interactive sync is invoked while signed out', async () => {
    const set = vi.fn(async () => undefined);
    vi.stubGlobal('chrome', {
      storage: {
        local: { get: vi.fn(async () => ({ syncStatus: { state: 'signed-out' } })), set },
      },
      runtime: { sendMessage: vi.fn(async () => undefined) },
    });
    const repository = {
      getStore: vi.fn(),
      saveStore: vi.fn(),
      commitSync: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
      importBrowserBookmarks: vi.fn(),
      importAtlasLinks: vi.fn(),
      overwriteAtlasLinks: vi.fn(),
      subscribe: () => () => undefined,
    } satisfies BookmarkRepository;
    const identity = { token: vi.fn(), signOut: vi.fn() } satisfies IdentityService;
    const drive = { download: vi.fn(), upload: vi.fn() } satisfies DriveStore;

    await expect(new SyncEngine(repository, identity, drive).sync(false)).resolves.toEqual({
      state: 'signed-out',
    });

    expect(identity.token).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
    expect(repository.getStore).not.toHaveBeenCalled();
    expect(drive.download).not.toHaveBeenCalled();
  });

  it('persists signed-out immediately, retains bookmarks, and exposes a revocation warning', async () => {
    const set = vi.fn<(value: Record<string, unknown>) => Promise<void>>(async () => undefined);
    const remove = vi.fn(async () => undefined);
    vi.stubGlobal('chrome', {
      storage: { local: { set, remove } },
      alarms: { clear: vi.fn(async () => true) },
      runtime: { sendMessage: vi.fn(async () => undefined) },
    });
    const repository = {
      getStore: vi.fn(),
      saveStore: vi.fn(),
      commitSync: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
      importBrowserBookmarks: vi.fn(),
      importAtlasLinks: vi.fn(),
      overwriteAtlasLinks: vi.fn(),
      subscribe: () => () => undefined,
    } satisfies BookmarkRepository;
    const identity = {
      token: vi.fn(),
      signOut: vi.fn(async () => ({ warning: 'Google access could not be revoked.' })),
    } satisfies IdentityService;
    const drive = { download: vi.fn(), upload: vi.fn() } satisfies DriveStore;

    await expect(new SyncEngine(repository, identity, drive).signOut()).resolves.toEqual({
      state: 'signed-out',
      message: 'Google access could not be revoked.',
    });

    expect(set).toHaveBeenNthCalledWith(1, { syncStatus: { state: 'signed-out' } });
    expect(remove).toHaveBeenCalledWith(['driveFileId', 'syncDirty', 'syncRecovery']);
    expect(set).toHaveBeenLastCalledWith({
      syncStatus: {
        state: 'signed-out',
        message: 'Google access could not be revoked.',
      },
    });
    expect(repository.getStore).not.toHaveBeenCalled();
    expect(set.mock.calls.some(([value]) => 'bookmarkStore' in value)).toBe(false);
  });

  it('cannot be returned to idle by a token request that finishes after sign out', async () => {
    const tokenStarted = deferred();
    let releaseToken!: (token: string) => void;
    const token = new Promise<string>((resolve) => {
      releaseToken = resolve;
    });
    const set = vi.fn<(value: Record<string, unknown>) => Promise<void>>(async () => undefined);
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: vi.fn(async () => ({ syncStatus: { state: 'idle' } })),
          set,
          remove: vi.fn(async () => undefined),
        },
      },
      alarms: { clear: vi.fn(async () => true) },
      runtime: { sendMessage: vi.fn(async () => undefined) },
    });
    const repository = {
      getStore: vi.fn(),
      saveStore: vi.fn(),
      commitSync: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
      importBrowserBookmarks: vi.fn(),
      importAtlasLinks: vi.fn(),
      overwriteAtlasLinks: vi.fn(),
      subscribe: () => () => undefined,
    } satisfies BookmarkRepository;
    const identity = {
      token: vi.fn(async () => {
        tokenStarted.resolve();
        return token;
      }),
      signOut: vi.fn(async () => ({})),
    } satisfies IdentityService;
    const drive = { download: vi.fn(), upload: vi.fn() } satisfies DriveStore;
    const engine = new SyncEngine(repository, identity, drive);

    const pendingSync = engine.sync(false);
    await tokenStarted.promise;
    await engine.signOut();
    releaseToken('stale-token');

    await expect(pendingSync).resolves.toEqual({ state: 'signed-out' });
    expect(repository.getStore).not.toHaveBeenCalled();
    expect(drive.download).not.toHaveBeenCalled();
    expect(
      set.mock.calls.every(
        ([value]) => (value.syncStatus as { state?: string } | undefined)?.state === 'signed-out',
      ),
    ).toBe(true);
  });
});

describe('SyncEngine Drive state and recovery', () => {
  beforeEach(() => vi.unstubAllGlobals());

  it('persists a discovered ID and reuses it without another listing pass', async () => {
    const snapshot = emptyStore(now, 'device');
    const state = chromeSyncState({ syncStatus: { state: 'idle' }, syncDirty: true });
    const repository = repositoryFor(snapshot);
    const identity = {
      token: vi.fn(async () => 'token'),
      signOut: vi.fn(async () => undefined),
    } satisfies IdentityService;
    const drive = {
      download: vi.fn(async (_token: string, fileId?: string) => ({
        id: fileId ?? 'discovered-file',
        store: snapshot,
      })),
      upload: vi.fn(async (_token: string, _store: BookmarkStore, fileId?: string) =>
        Promise.resolve(fileId ?? 'created-file'),
      ),
    } satisfies DriveStore;
    const engine = new SyncEngine(repository, identity, drive);

    await engine.sync(true);
    await engine.sync(true);

    expect(drive.download).toHaveBeenNthCalledWith(1, 'token', undefined);
    expect(drive.download).toHaveBeenNthCalledWith(2, 'token', 'discovered-file');
    expect(state.values.driveFileId).toBe('discovered-file');
  });

  it('persists the ID returned after creating a new Drive file', async () => {
    const snapshot = emptyStore(now, 'device');
    const state = chromeSyncState({
      syncStatus: { state: 'idle' },
      syncRetry: {
        code: 'offline',
        attempt: 2,
        nextAttemptAt: '2026-07-16T12:01:00.000Z',
      },
    });
    const repository = repositoryFor(snapshot);
    const identity = {
      token: vi.fn(async () => 'token'),
      signOut: vi.fn(async () => undefined),
    } satisfies IdentityService;
    const drive = {
      download: vi.fn(async () => undefined),
      upload: vi.fn(async () => 'created-file'),
    } satisfies DriveStore;

    await new SyncEngine(repository, identity, drive).sync(true);

    expect(state.values.driveFileId).toBe('created-file');
    expect(state.values.syncRetry).toBeUndefined();
    expect(state.clear).toHaveBeenCalledWith('atlas-sync-retry');
    expect(drive.upload).toHaveBeenCalledWith('token', snapshot, undefined);
  });

  it('clears a stale cached ID and performs one discovery pass after 404', async () => {
    const snapshot = emptyStore(now, 'device');
    const state = chromeSyncState({
      syncStatus: { state: 'idle' },
      driveFileId: 'stale-file',
    });
    const repository = repositoryFor(snapshot);
    const identity = {
      token: vi.fn(async () => 'token'),
      signOut: vi.fn(async () => undefined),
    } satisfies IdentityService;
    const drive = {
      download: vi
        .fn()
        .mockRejectedValueOnce(new SyncError('request', undefined, { status: 404 }))
        .mockResolvedValueOnce(undefined),
      upload: vi.fn(async () => 'created-file'),
    } satisfies DriveStore;

    await new SyncEngine(repository, identity, drive).sync(true);

    expect(drive.download).toHaveBeenNthCalledWith(1, 'token', 'stale-file');
    expect(drive.download).toHaveBeenNthCalledWith(2, 'token');
    expect(state.values.driveFileId).toBe('created-file');
  });

  it('performs one discovery pass when a cached file disappears before upload', async () => {
    const snapshot = emptyStore(now, 'device');
    const replacement = emptyStore(now, 'remote-device');
    const state = chromeSyncState({
      syncStatus: { state: 'idle' },
      driveFileId: 'stale-file',
    });
    const repository = repositoryFor(snapshot);
    const identity = {
      token: vi.fn(async () => 'token'),
      signOut: vi.fn(async () => undefined),
    } satisfies IdentityService;
    const drive = {
      download: vi
        .fn()
        .mockResolvedValueOnce({ id: 'stale-file', store: snapshot })
        .mockResolvedValueOnce({ id: 'replacement-file', store: replacement }),
      upload: vi
        .fn()
        .mockRejectedValueOnce(new SyncError('request', undefined, { status: 404 }))
        .mockResolvedValueOnce('replacement-file'),
    } satisfies DriveStore;

    await new SyncEngine(repository, identity, drive).sync(true);

    expect(drive.download).toHaveBeenNthCalledWith(1, 'token', 'stale-file');
    expect(drive.download).toHaveBeenNthCalledWith(2, 'token');
    expect(drive.upload).toHaveBeenCalledTimes(2);
    expect(state.values.driveFileId).toBe('replacement-file');
  });

  it.each(['authorization', 'quota'] as const)(
    'does not rediscover a cached ID after %s failure',
    async (code) => {
      const snapshot = emptyStore(now, 'device');
      chromeSyncState({ syncStatus: { state: 'idle' }, driveFileId: 'cached-file' });
      const repository = repositoryFor(snapshot);
      const identity = {
        token: vi.fn(async () => 'token'),
        signOut: vi.fn(async () => undefined),
      } satisfies IdentityService;
      const drive = {
        download: vi.fn(async () =>
          Promise.reject(new SyncError(code, undefined, { status: 403 })),
        ),
        upload: vi.fn(),
      } satisfies DriveStore;

      await expect(new SyncEngine(repository, identity, drive).sync(true)).rejects.toMatchObject({
        code,
      });
      expect(drive.download).toHaveBeenCalledOnce();
      expect(drive.download).toHaveBeenCalledWith('token', 'cached-file');
    },
  );

  it('keeps local data untouched until corrupt-backup replacement is confirmed', async () => {
    const snapshot = emptyStore(now, 'device');
    const before = JSON.stringify(snapshot);
    const state = chromeSyncState({ syncStatus: { state: 'idle' }, syncDirty: true });
    const repository = repositoryFor(snapshot);
    const identity = {
      token: vi.fn(async () => 'token'),
      signOut: vi.fn(async () => undefined),
    } satisfies IdentityService;
    const drive = {
      download: vi.fn(async () =>
        Promise.reject(
          new SyncError('corrupt-remote', undefined, { remoteFileId: 'corrupt-file' }),
        ),
      ),
      upload: vi.fn(async () => 'corrupt-file'),
    } satisfies DriveStore;
    const engine = new SyncEngine(repository, identity, drive);

    await expect(engine.sync(true)).rejects.toMatchObject({ code: 'corrupt-remote' });

    expect(JSON.stringify(snapshot)).toBe(before);
    expect(repository.commitSync).not.toHaveBeenCalled();
    expect(drive.upload).not.toHaveBeenCalled();
    expect(state.values.syncRecovery).toEqual({
      code: 'corrupt-remote',
      fileId: 'corrupt-file',
    });

    await engine.replaceCorruptBackup();

    expect(drive.upload).toHaveBeenCalledWith('token', snapshot, 'corrupt-file');
    expect(repository.commitSync).toHaveBeenCalledWith(snapshot, snapshot);
    expect(state.values.syncRecovery).toBeUndefined();
    expect(state.values.syncStatus).toMatchObject({ state: 'idle' });
  });

  it('can remain local-only after corruption without another Drive request', async () => {
    const snapshot = emptyStore(now, 'device');
    const state = chromeSyncState({ syncStatus: { state: 'idle' } });
    const repository = repositoryFor(snapshot);
    const identity = {
      token: vi.fn(async () => 'token'),
      signOut: vi.fn(async () => undefined),
    } satisfies IdentityService;
    const drive = {
      download: vi.fn(async () =>
        Promise.reject(
          new SyncError('corrupt-remote', undefined, { remoteFileId: 'corrupt-file' }),
        ),
      ),
      upload: vi.fn(),
    } satisfies DriveStore;
    const engine = new SyncEngine(repository, identity, drive);

    await expect(engine.sync(true)).rejects.toMatchObject({ code: 'corrupt-remote' });
    await engine.signOut();

    expect(drive.download).toHaveBeenCalledOnce();
    expect(drive.upload).not.toHaveBeenCalled();
    expect(state.values.syncStatus).toEqual({ state: 'signed-out' });
    expect(state.values.driveFileId).toBeUndefined();
    expect(state.values.syncRetry).toBeUndefined();
  });

  it('stops visibly at the retry cap and manual retry starts a new sequence', async () => {
    const snapshot = emptyStore(now, 'device');
    const state = chromeSyncState({ syncStatus: { state: 'idle' }, syncDirty: true });
    const repository = repositoryFor(snapshot);
    const identity = {
      token: vi.fn(async () => 'token'),
      signOut: vi.fn(async () => undefined),
    } satisfies IdentityService;
    const drive = {
      download: vi.fn(async () => Promise.reject(new SyncError('transient-service'))),
      upload: vi.fn(),
    } satisfies DriveStore;
    const engine = new SyncEngine(repository, identity, drive);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(engine.sync(true)).rejects.toMatchObject({ code: 'transient-service' });
    }

    expect(state.values.syncRetry).toEqual({
      code: 'transient-service',
      attempt: 4,
      nextAttemptAt: null,
    });
    expect(state.values.syncStatus).toMatchObject({
      state: 'error',
      code: 'transient-service',
      retryExhausted: true,
    });
    expect(state.create).toHaveBeenCalledTimes(4);

    await expect(engine.retryNow()).rejects.toMatchObject({ code: 'transient-service' });
    expect(state.values.syncRetry).toMatchObject({ attempt: 1 });
    expect(state.values.syncStatus).not.toHaveProperty('retryExhausted');
  });

  it('collapses repeated manual retries and an overlapping sync into one upload', async () => {
    const snapshot = emptyStore(now, 'device');
    chromeSyncState({
      syncStatus: { state: 'error', code: 'offline', message: 'Offline.' },
      syncRetry: {
        code: 'offline',
        attempt: 1,
        nextAttemptAt: '2026-07-16T12:00:30.000Z',
      },
    });
    const repository = repositoryFor(snapshot);
    const identity = {
      token: vi.fn(async () => 'token'),
      signOut: vi.fn(async () => undefined),
    } satisfies IdentityService;
    const release = deferred();
    const drive = {
      download: vi.fn(async () => undefined),
      upload: vi.fn(async () => {
        await release.promise;
        return 'drive-file';
      }),
    } satisfies DriveStore;
    const engine = new SyncEngine(repository, identity, drive);

    const first = engine.retryNow();
    const second = engine.retryNow();
    const alarm = engine.sync(false);
    await vi.waitFor(() => expect(drive.upload).toHaveBeenCalledOnce());
    release.resolve();
    await Promise.all([first, second, alarm]);

    expect(drive.upload).toHaveBeenCalledOnce();
  });
});
