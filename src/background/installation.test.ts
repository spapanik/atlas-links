import { describe, expect, it, vi } from 'vitest';
import { syncIfDirty, type BackgroundSyncRunner } from '../sync/scheduling';
import { handleInstalled, type InstallationStorage } from './installation';

function storageWith(syncStatus: unknown, syncDirty?: unknown) {
  const values: Record<string, unknown> = { syncStatus, syncDirty };
  const storage: InstallationStorage & {
    get: ReturnType<typeof vi.fn>;
    set: ReturnType<typeof vi.fn>;
  } = {
    get: vi.fn(async (key: string | string[]) => {
      const keys = Array.isArray(key) ? key : [key];
      return Object.fromEntries(keys.map((item) => [item, values[item]]));
    }),
    set: vi.fn(async (items: { syncStatus: unknown }) => {
      Object.assign(values, items);
    }),
  };
  return { storage, values };
}

describe('background installation', () => {
  it('seeds signed-out state on a fresh install', async () => {
    const { storage, values } = storageWith(undefined);

    await expect(handleInstalled({ reason: 'install' }, storage)).resolves.toBe(true);

    expect(storage.set).toHaveBeenCalledOnce();
    expect(storage.set).toHaveBeenCalledWith({ syncStatus: { state: 'signed-out' } });
    expect(values.syncStatus).toEqual({ state: 'signed-out' });
  });

  it.each(['install', 'update', 'chrome_update'] as const)(
    'repairs corrupted sync state after %s',
    async (reason) => {
      const { storage, values } = storageWith({ state: 'not-a-sync-state' });

      await expect(handleInstalled({ reason }, storage)).resolves.toBe(true);

      expect(storage.set).toHaveBeenCalledWith({ syncStatus: { state: 'signed-out' } });
      expect(values.syncStatus).toEqual({ state: 'signed-out' });
    },
  );

  it.each([
    ['update', { state: 'idle', lastSyncedAt: '2026-07-15T12:00:00.000Z' }],
    ['chrome_update', { state: 'dirty', lastSyncedAt: '2026-07-15T12:00:00.000Z' }],
    ['update', { state: 'signed-out' }],
  ] as const)('preserves valid sync state after %s', async (reason, syncStatus) => {
    const { storage, values } = storageWith(syncStatus, true);

    await expect(handleInstalled({ reason }, storage)).resolves.toBe(false);

    expect(storage.set).not.toHaveBeenCalled();
    expect(values).toEqual({ syncStatus, syncDirty: true });
  });

  it('allows pending signed-in changes to resume alarm-driven sync after an update', async () => {
    const syncStatus = { state: 'idle', lastSyncedAt: '2026-07-15T12:00:00.000Z' };
    const { storage } = storageWith(syncStatus, true);
    const engine = { sync: vi.fn(async () => undefined) } satisfies BackgroundSyncRunner;

    await handleInstalled({ reason: 'update' }, storage);
    await expect(syncIfDirty(engine, storage)).resolves.toBe(true);

    expect(engine.sync).toHaveBeenCalledOnce();
    expect(engine.sync).toHaveBeenCalledWith(false);
    expect(storage.set).not.toHaveBeenCalled();
  });

  it('keeps an explicitly signed-out user gated from background sync after an update', async () => {
    const { storage } = storageWith({ state: 'signed-out' }, true);
    const engine = { sync: vi.fn(async () => undefined) } satisfies BackgroundSyncRunner;

    await handleInstalled({ reason: 'update' }, storage);
    await expect(syncIfDirty(engine, storage)).resolves.toBe(false);

    expect(engine.sync).not.toHaveBeenCalled();
    expect(storage.set).not.toHaveBeenCalled();
  });
});
