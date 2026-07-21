import { mergeStores, parseStore, type BookmarkStore } from '../domain/model';
import type { BookmarkRepository } from '../data/repository';
import { classifyDriveResponse, SyncError, syncErrorStatus, toSyncError } from './failures';
import { clearSyncRetry, scheduleSyncRetry } from './scheduling';
import { parseSyncStatus, type SyncStatus } from './status';

export type { SyncStatus } from './status';
export type IdentitySignOutResult = { warning?: string };
export interface IdentityService {
  token(interactive: boolean): Promise<string>;
  signOut(): Promise<IdentitySignOutResult | void>;
}

export class ChromeIdentityService implements IdentityService {
  async token(interactive: boolean) {
    try {
      const token = (await chrome.identity.getAuthToken({ interactive })).token;
      if (!token) throw new SyncError('authorization');
      return token;
    } catch (error) {
      if (error instanceof SyncError) throw error;
      throw new SyncError('authorization');
    }
  }
  async signOut() {
    let token: string | undefined;
    let warning: string | undefined;
    try {
      token = (await chrome.identity.getAuthToken({ interactive: false })).token;
    } catch {
      warning =
        'Google access could not be confirmed revoked. Remove Atlas Links access in your Google Account if needed.';
    }

    if (token) {
      try {
        const response = await fetch('https://oauth2.googleapis.com/revoke', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ token }).toString(),
        });
        if (!response.ok) {
          warning =
            'Google access could not be revoked. Remove Atlas Links access in your Google Account.';
        }
      } catch {
        warning =
          'Google access could not be revoked. Remove Atlas Links access in your Google Account.';
      }
    } else if (!warning) {
      warning =
        'Google access could not be confirmed revoked. Remove Atlas Links access in your Google Account if needed.';
    }

    try {
      if (typeof chrome.identity.clearAllCachedAuthTokens === 'function') {
        await chrome.identity.clearAllCachedAuthTokens();
      } else if (token) {
        await chrome.identity.removeCachedAuthToken({ token });
      }
    } catch {
      const cacheWarning =
        'Cached Google authorization could not be fully cleared. Restart Chrome before signing in again.';
      warning = warning ? `${warning} ${cacheWarning}` : cacheWarning;
    }
    return warning ? { warning } : {};
  }
}
export type Remote = { store: BookmarkStore; id: string };
export interface DriveStore {
  download(token: string, fileId?: string): Promise<Remote | undefined>;
  upload(token: string, store: BookmarkStore, fileId?: string): Promise<string>;
}

export const MAX_REMOTE_DOCUMENT_BYTES = 5 * 1024 * 1024;

export function parseDriveFileId(value: unknown) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,200}$/.test(value) ? value : undefined;
}

export class GoogleDriveStore implements DriveStore {
  private async request(token: string, url: string, init?: RequestInit) {
    let response: Response;
    try {
      response = await fetch(url, {
        ...init,
        headers: { Authorization: `Bearer ${token}`, ...init?.headers },
      });
    } catch (error) {
      throw toSyncError(error);
    }
    if (!response.ok) throw await classifyDriveResponse(response);
    return response;
  }

  private async discover(token: string) {
    const q = encodeURIComponent(
      "name='atlas-links.v1.json' and 'appDataFolder' in parents and trashed=false",
    );
    const list = (await (
      await this.request(
        token,
        `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${q}&fields=files(id)&pageSize=1`,
      )
    ).json()) as { files: { id: string }[] };
    return parseDriveFileId(list.files?.[0]?.id);
  }

  async download(token: string, cachedFileId?: string): Promise<Remote | undefined> {
    const fileId = cachedFileId ?? (await this.discover(token));
    if (!fileId) return;
    const response = await this.request(
      token,
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    );
    const declaredSize = Number(response.headers.get('Content-Length'));
    if (Number.isFinite(declaredSize) && declaredSize > MAX_REMOTE_DOCUMENT_BYTES)
      throw new SyncError('corrupt-remote', undefined, { remoteFileId: fileId });
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > MAX_REMOTE_DOCUMENT_BYTES)
      throw new SyncError('corrupt-remote', undefined, { remoteFileId: fileId });
    try {
      return { id: fileId, store: parseStore(JSON.parse(text) as unknown) };
    } catch {
      throw new SyncError('corrupt-remote', undefined, { remoteFileId: fileId });
    }
  }
  async upload(token: string, store: BookmarkStore, fileId?: string) {
    const body = JSON.stringify(store);
    if (fileId) {
      // Atlas Links does not send an unverified conditional header for this Drive v3
      // media update. Uploads are file-level last-writer-wins; the deterministic
      // bookmark merge makes concurrent device changes converge on a subsequent sync.
      await this.request(
        token,
        `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body,
        },
      );
      return fileId;
    }
    const boundary = 'atlas_links_boundary';
    const multipart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: 'atlas-links.v1.json', parents: ['appDataFolder'] })}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${boundary}--`;
    const response = await this.request(
      token,
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
      {
        method: 'POST',
        headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
        body: multipart,
      },
    );
    const created = (await response.json()) as { id?: unknown };
    const createdId = parseDriveFileId(created.id);
    if (!createdId) throw new SyncError('transient-service');
    return createdId;
  }
}

const DRIVE_FILE_ID_KEY = 'driveFileId';
const SYNC_RECOVERY_KEY = 'syncRecovery';

function parseCorruptRecovery(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  const candidate = value as Record<string, unknown>;
  if (candidate.code !== 'corrupt-remote') return;
  const fileId = parseDriveFileId(candidate.fileId);
  return fileId ? { code: 'corrupt-remote' as const, fileId } : undefined;
}

export class SyncEngine {
  private syncInFlight?: Promise<SyncStatus>;
  private authGeneration = 0;

  constructor(
    private repository: BookmarkRepository,
    private identity: IdentityService = new ChromeIdentityService(),
    private drive: DriveStore = new GoogleDriveStore(),
  ) {}

  sync(interactive = false) {
    if (this.syncInFlight) return this.syncInFlight;
    const operation = this.performSync(interactive, this.authGeneration);
    this.syncInFlight = operation;
    const clear = () => {
      if (this.syncInFlight === operation) this.syncInFlight = undefined;
    };
    void operation.then(clear, clear);
    return operation;
  }

  async retryNow() {
    if (this.syncInFlight) return this.syncInFlight;
    await clearSyncRetry();
    return this.sync(false);
  }

  replaceCorruptBackup() {
    if (this.syncInFlight) return this.syncInFlight;
    const operation = this.performCorruptReplacement(this.authGeneration);
    this.syncInFlight = operation;
    const clear = () => {
      if (this.syncInFlight === operation) this.syncInFlight = undefined;
    };
    void operation.then(clear, clear);
    return operation;
  }

  private async performSync(interactive: boolean, authGeneration: number) {
    try {
      if (authGeneration !== this.authGeneration)
        return { state: 'signed-out' } satisfies SyncStatus;
      if (!interactive) {
        const stored = await chrome.storage.local.get('syncStatus');
        const syncStatus = parseSyncStatus(stored.syncStatus);
        if (
          authGeneration !== this.authGeneration ||
          !syncStatus ||
          syncStatus.state === 'signed-out'
        )
          return { state: 'signed-out' } satisfies SyncStatus;
      }
      const token = await this.identity.token(interactive);
      if (authGeneration !== this.authGeneration)
        return { state: 'signed-out' } satisfies SyncStatus;
      await chrome.storage.local.set({ syncStatus: { state: 'syncing' } satisfies SyncStatus });
      if (authGeneration !== this.authGeneration)
        return { state: 'signed-out' } satisfies SyncStatus;
      const local = await this.repository.getStore();
      if (authGeneration !== this.authGeneration)
        return { state: 'signed-out' } satisfies SyncStatus;
      const storedDrive = await chrome.storage.local.get(DRIVE_FILE_ID_KEY);
      let cachedFileId = parseDriveFileId(storedDrive[DRIVE_FILE_ID_KEY]);
      if (storedDrive[DRIVE_FILE_ID_KEY] !== undefined && !cachedFileId)
        await chrome.storage.local.remove(DRIVE_FILE_ID_KEY);
      let remote: Remote | undefined;
      let rediscoveredAfter404 = false;
      try {
        remote = await this.drive.download(token, cachedFileId);
      } catch (error) {
        const failure = toSyncError(error);
        if (cachedFileId && failure.details.status === 404) {
          await chrome.storage.local.remove(DRIVE_FILE_ID_KEY);
          cachedFileId = undefined;
          rediscoveredAfter404 = true;
          remote = await this.drive.download(token);
        } else {
          throw failure;
        }
      }
      if (authGeneration !== this.authGeneration)
        return { state: 'signed-out' } satisfies SyncStatus;
      if (remote) await chrome.storage.local.set({ [DRIVE_FILE_ID_KEY]: remote.id });
      let merged = remote ? mergeStores(local, remote.store) : local;
      let uploadedFileId: string;
      try {
        uploadedFileId = await this.drive.upload(token, merged, remote?.id);
      } catch (error) {
        const failure = toSyncError(error);
        if (!rediscoveredAfter404 && remote && failure.details.status === 404) {
          await chrome.storage.local.remove(DRIVE_FILE_ID_KEY);
          remote = await this.drive.download(token);
          if (remote) await chrome.storage.local.set({ [DRIVE_FILE_ID_KEY]: remote.id });
          merged = remote ? mergeStores(local, remote.store) : local;
          uploadedFileId = await this.drive.upload(token, merged, remote?.id);
        } else {
          throw failure;
        }
      }
      if (authGeneration !== this.authGeneration)
        return { state: 'signed-out' } satisfies SyncStatus;
      await chrome.storage.local.set({ [DRIVE_FILE_ID_KEY]: uploadedFileId });
      const committed = await this.repository.commitSync(local, merged);
      if (authGeneration !== this.authGeneration)
        return { state: 'signed-out' } satisfies SyncStatus;
      const lastSyncedAt = new Date().toISOString();
      const status: SyncStatus = committed.concurrentChanges
        ? { state: 'dirty', lastSyncedAt }
        : { state: 'idle', lastSyncedAt };
      await chrome.storage.local.set({ syncStatus: status });
      await this.clearRecoveryState();
      if (committed.concurrentChanges) {
        void chrome.runtime.sendMessage({ type: 'schedule-sync' }).catch(() => undefined);
      }
      return status;
    } catch (e) {
      if (authGeneration !== this.authGeneration)
        return { state: 'signed-out' } satisfies SyncStatus;
      throw await this.recordFailure(e);
    }
  }

  private async recordFailure(error: unknown) {
    const failure = toSyncError(error);
    if (failure.code === 'corrupt-remote' && failure.details.remoteFileId) {
      await chrome.storage.local.set({
        [DRIVE_FILE_ID_KEY]: failure.details.remoteFileId,
        [SYNC_RECOVERY_KEY]: {
          code: 'corrupt-remote',
          fileId: failure.details.remoteFileId,
        },
      });
    }
    let retryExhausted = false;
    if (
      failure.code === 'offline' ||
      failure.code === 'rate-limit' ||
      failure.code === 'transient-service'
    ) {
      retryExhausted = (await scheduleSyncRetry(failure)).exhausted;
    } else {
      await clearSyncRetry();
    }
    if (retryExhausted) failure.details.retryExhausted = true;
    await chrome.storage.local.set({ syncStatus: syncErrorStatus(failure, retryExhausted) });
    return failure;
  }

  private async clearRecoveryState() {
    await clearSyncRetry();
    await chrome.storage.local.remove(SYNC_RECOVERY_KEY);
  }

  private async performCorruptReplacement(authGeneration: number) {
    try {
      const stored = await chrome.storage.local.get(SYNC_RECOVERY_KEY);
      const recovery = parseCorruptRecovery(stored[SYNC_RECOVERY_KEY]);
      if (!recovery) throw new SyncError('corrupt-remote');
      const token = await this.identity.token(false);
      if (authGeneration !== this.authGeneration)
        return { state: 'signed-out' } satisfies SyncStatus;
      await chrome.storage.local.set({ syncStatus: { state: 'syncing' } satisfies SyncStatus });
      const local = await this.repository.getStore();
      const fileId = await this.drive.upload(token, local, recovery.fileId);
      if (authGeneration !== this.authGeneration)
        return { state: 'signed-out' } satisfies SyncStatus;
      await chrome.storage.local.set({ [DRIVE_FILE_ID_KEY]: fileId });
      const committed = await this.repository.commitSync(local, local);
      if (authGeneration !== this.authGeneration)
        return { state: 'signed-out' } satisfies SyncStatus;
      const lastSyncedAt = new Date().toISOString();
      const status: SyncStatus = committed.concurrentChanges
        ? { state: 'dirty', lastSyncedAt }
        : { state: 'idle', lastSyncedAt };
      await chrome.storage.local.set({ syncStatus: status });
      await this.clearRecoveryState();
      if (committed.concurrentChanges)
        void chrome.runtime.sendMessage({ type: 'schedule-sync' }).catch(() => undefined);
      return status;
    } catch (error) {
      if (authGeneration !== this.authGeneration)
        return { state: 'signed-out' } satisfies SyncStatus;
      throw await this.recordFailure(error);
    }
  }

  async signOut() {
    this.authGeneration += 1;
    await chrome.storage.local.set({ syncStatus: { state: 'signed-out' } satisfies SyncStatus });
    let warning: string | undefined;
    try {
      warning = (await this.identity.signOut())?.warning;
    } catch {
      warning =
        'Google access could not be revoked. Remove Atlas Links access in your Google Account.';
    }
    await clearSyncRetry();
    await chrome.storage.local.remove([DRIVE_FILE_ID_KEY, 'syncDirty', SYNC_RECOVERY_KEY]);
    const status: SyncStatus = { state: 'signed-out', ...(warning ? { message: warning } : {}) };
    await chrome.storage.local.set({ syncStatus: status });
    return status;
  }
}
