import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearSyncRetry,
  parseSyncRetry,
  runScheduledRetry,
  scheduleBackgroundSync,
  scheduleSyncRetry,
  SYNC_ALARM_DELAY_MINUTES,
  SYNC_ALARM_NAME,
  SYNC_RETRY_ALARM_NAME,
  syncIfDirty,
  type BackgroundSyncRunner,
  type SyncAlarmCreator,
  type SyncStateReader,
  type SyncStateWriter,
} from './scheduling';
import { SyncError } from './failures';

function stateReader(syncStatus: unknown, syncDirty: unknown): SyncStateReader {
  return { get: vi.fn(async () => ({ syncStatus, syncDirty })) };
}

function alarmCreator(): SyncAlarmCreator & { create: ReturnType<typeof vi.fn> } {
  return {
    create: vi.fn(async () => undefined),
    clear: vi.fn(async () => true),
  };
}

function stateWriter(initial: Record<string, unknown> = {}) {
  const values = { ...initial };
  const storage: SyncStateWriter = {
    get: vi.fn(async (keys: string[]) => Object.fromEntries(keys.map((key) => [key, values[key]]))),
    set: vi.fn(async (items) => {
      Object.assign(values, items);
    }),
    remove: vi.fn(async (keys) => {
      for (const key of Array.isArray(keys) ? keys : [keys]) delete values[key];
    }),
  };
  return { storage, values };
}

describe('scheduleBackgroundSync', () => {
  it('does nothing for a signed-out user even when changes are pending', async () => {
    const alarms = alarmCreator();

    await expect(
      scheduleBackgroundSync(stateReader({ state: 'signed-out' }, true), alarms),
    ).resolves.toBe(false);
    expect(alarms.create).not.toHaveBeenCalled();
  });

  it("uses one named alarm at Chrome's minimum delay for signed-in pending changes", async () => {
    const alarms = alarmCreator();
    const reader = stateReader({ state: 'idle' }, true);

    await Promise.all([
      scheduleBackgroundSync(reader, alarms),
      scheduleBackgroundSync(reader, alarms),
      scheduleBackgroundSync(reader, alarms),
    ]);

    expect(SYNC_ALARM_DELAY_MINUTES).toBeGreaterThanOrEqual(0.5);
    expect(alarms.create).toHaveBeenCalledTimes(3);
    for (const call of alarms.create.mock.calls) {
      expect(call).toEqual([SYNC_ALARM_NAME, { delayInMinutes: 0.5 }]);
    }
  });

  it.each([
    ['clean state', { state: 'idle' }, false],
    ['missing status', undefined, true],
    ['malformed status', { state: 'unknown' }, true],
  ])('does not schedule for a %s', async (_label, status, dirty) => {
    const alarms = alarmCreator();

    await expect(scheduleBackgroundSync(stateReader(status, dirty), alarms)).resolves.toBe(false);
    expect(alarms.create).not.toHaveBeenCalled();
  });
});

describe('syncIfDirty', () => {
  beforeEach(() => vi.unstubAllGlobals());

  it('runs one non-interactive sync for signed-in pending changes', async () => {
    const engine = { sync: vi.fn(async () => undefined) } satisfies BackgroundSyncRunner;

    await expect(syncIfDirty(engine, stateReader({ state: 'idle' }, true))).resolves.toBe(true);
    expect(engine.sync).toHaveBeenCalledOnce();
    expect(engine.sync).toHaveBeenCalledWith(false);
  });

  it.each([
    ['signed-out user', { state: 'signed-out' }, true],
    ['clean store', { state: 'idle' }, false],
    ['missing dirty flag', { state: 'idle' }, undefined],
    ['malformed dirty flag', { state: 'idle' }, 'true'],
    ['missing status', undefined, true],
  ])('does not sync for a %s', async (_label, status, dirty) => {
    const engine = { sync: vi.fn(async () => undefined) } satisfies BackgroundSyncRunner;

    await expect(syncIfDirty(engine, stateReader(status, dirty))).resolves.toBe(false);
    expect(engine.sync).not.toHaveBeenCalled();
  });
});

describe('persisted sync retry scheduling', () => {
  const start = Date.parse('2026-07-16T12:00:00.000Z');

  it('persists the exact bounded backoff sequence across worker-like calls', async () => {
    const { storage, values } = stateWriter();
    const alarms = alarmCreator();
    const error = new SyncError('transient-service');

    for (const delay of [0.5, 1, 2, 4]) {
      await expect(scheduleSyncRetry(error, storage, alarms, start)).resolves.toMatchObject({
        scheduled: true,
      });
      expect(alarms.create).toHaveBeenLastCalledWith(SYNC_RETRY_ALARM_NAME, {
        delayInMinutes: delay,
      });
    }

    await expect(scheduleSyncRetry(error, storage, alarms, start)).resolves.toMatchObject({
      scheduled: false,
      exhausted: true,
    });
    expect(alarms.create).toHaveBeenCalledTimes(4);
    expect(parseSyncRetry(values.syncRetry)).toEqual({
      code: 'transient-service',
      attempt: 4,
      nextAttemptAt: null,
    });
    expect(alarms.clear).toHaveBeenCalledWith(SYNC_RETRY_ALARM_NAME);
  });

  it('honors Retry-After and prevents mutations from shortening the delay', async () => {
    const { storage, values } = stateWriter({
      syncDirty: true,
      syncStatus: { state: 'error', code: 'rate-limit', message: 'Wait.' },
    });
    const alarms = alarmCreator();

    await scheduleSyncRetry(
      new SyncError('rate-limit', undefined, { retryAfterMs: 3 * 60_000 }),
      storage,
      alarms,
      start,
    );

    expect(values.syncRetry).toEqual({
      code: 'rate-limit',
      attempt: 1,
      nextAttemptAt: '2026-07-16T12:03:00.000Z',
    });
    await expect(scheduleBackgroundSync(storage, alarms)).resolves.toBe(false);
    expect(alarms.create).toHaveBeenCalledTimes(1);
  });

  it.each(['authorization', 'quota', 'corrupt-remote', 'request'] as const)(
    'does not schedule automatic retry for %s',
    async (code) => {
      const { storage, values } = stateWriter();
      const alarms = alarmCreator();

      await expect(scheduleSyncRetry(new SyncError(code), storage, alarms, start)).resolves.toEqual(
        { scheduled: false, exhausted: false },
      );
      expect(values).toEqual({});
      expect(alarms.create).not.toHaveBeenCalled();
    },
  );

  it('clears persisted state and restarts manual retry from attempt one', async () => {
    const { storage, values } = stateWriter();
    const alarms = alarmCreator();
    const error = new SyncError('offline');

    await scheduleSyncRetry(error, storage, alarms, start);
    await scheduleSyncRetry(error, storage, alarms, start);
    await clearSyncRetry(storage, alarms);
    await scheduleSyncRetry(error, storage, alarms, start);

    expect(parseSyncRetry(values.syncRetry)).toMatchObject({ code: 'offline', attempt: 1 });
    expect(storage.remove).toHaveBeenCalledWith('syncRetry');
  });

  it('runs a persisted retry after a simulated worker restart', async () => {
    const metadata = {
      code: 'offline',
      attempt: 2,
      nextAttemptAt: '2026-07-16T12:01:00.000Z',
    };
    const { storage } = stateWriter({ syncRetry: metadata });
    const engine = { sync: vi.fn(async () => undefined) } satisfies BackgroundSyncRunner;

    await expect(runScheduledRetry(engine, storage)).resolves.toBe(true);
    expect(engine.sync).toHaveBeenCalledWith(false);
  });
});
