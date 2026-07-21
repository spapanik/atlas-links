import { isRetryableFailure, type SyncError } from './failures';
import { parseSyncStatus, type SyncFailureCode } from './status';

export interface BackgroundSyncRunner {
  sync(interactive: boolean): Promise<unknown>;
}

export interface SyncStateReader {
  get(keys: string[]): Promise<Record<string, unknown>>;
}

export interface SyncStateWriter extends SyncStateReader {
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
}

export interface SyncAlarmCreator {
  create(name: string, alarmInfo: { delayInMinutes: number }): Promise<void>;
  clear(name: string): Promise<boolean>;
}

export const SYNC_ALARM_NAME = 'atlas-sync';
export const SYNC_RETRY_ALARM_NAME = 'atlas-sync-retry';
// Chrome limits extension alarms to one firing every 30 seconds.
export const SYNC_ALARM_DELAY_MINUTES = 0.5;
export const SYNC_RETRY_DELAYS_MINUTES = [0.5, 1, 2, 4] as const;
export const SYNC_RETRY_KEY = 'syncRetry';

export type SyncRetryMetadata = {
  code: SyncFailureCode;
  attempt: number;
  nextAttemptAt: string | null;
};

export function parseSyncRetry(value: unknown): SyncRetryMetadata | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  const candidate = value as Record<string, unknown>;
  if (!isRetryableFailure(candidate.code as SyncFailureCode)) return;
  if (
    typeof candidate.attempt !== 'number' ||
    !Number.isInteger(candidate.attempt) ||
    candidate.attempt < 1 ||
    candidate.attempt > SYNC_RETRY_DELAYS_MINUTES.length
  )
    return;
  if (
    candidate.nextAttemptAt !== null &&
    (typeof candidate.nextAttemptAt !== 'string' ||
      Number.isNaN(Date.parse(candidate.nextAttemptAt)))
  )
    return;
  return {
    code: candidate.code as SyncFailureCode,
    attempt: candidate.attempt,
    nextAttemptAt: candidate.nextAttemptAt as string | null,
  };
}

async function canRunBackgroundSync(reader: SyncStateReader) {
  const { syncDirty, syncStatus, syncRetry } = await reader.get([
    'syncDirty',
    'syncStatus',
    SYNC_RETRY_KEY,
  ]);
  const status = parseSyncStatus(syncStatus);
  return (
    syncDirty === true &&
    Boolean(status && (status.state === 'idle' || status.state === 'dirty')) &&
    !parseSyncRetry(syncRetry)
  );
}

export async function scheduleBackgroundSync(
  reader: SyncStateReader = chrome.storage.local,
  alarms: SyncAlarmCreator = chrome.alarms,
) {
  if (!(await canRunBackgroundSync(reader))) return false;
  await alarms.create(SYNC_ALARM_NAME, { delayInMinutes: SYNC_ALARM_DELAY_MINUTES });
  return true;
}

export async function syncIfDirty(
  engine: BackgroundSyncRunner,
  reader: SyncStateReader = chrome.storage.local,
) {
  if (!(await canRunBackgroundSync(reader))) return false;
  await engine.sync(false);
  return true;
}

export async function scheduleSyncRetry(
  error: SyncError,
  storage: SyncStateWriter = chrome.storage.local,
  alarms: SyncAlarmCreator = chrome.alarms,
  now = Date.now(),
) {
  if (!isRetryableFailure(error.code)) return { scheduled: false, exhausted: false } as const;
  const stored = await storage.get([SYNC_RETRY_KEY]);
  const previous = parseSyncRetry(stored[SYNC_RETRY_KEY]);
  const attempt = (previous?.attempt ?? 0) + 1;
  if (attempt > SYNC_RETRY_DELAYS_MINUTES.length) {
    const metadata: SyncRetryMetadata = {
      code: error.code,
      attempt: SYNC_RETRY_DELAYS_MINUTES.length,
      nextAttemptAt: null,
    };
    await storage.set({ [SYNC_RETRY_KEY]: metadata });
    await alarms.clear(SYNC_RETRY_ALARM_NAME);
    return { scheduled: false, exhausted: true, metadata } as const;
  }

  const requestedDelay =
    error.details.retryAfterMs !== undefined
      ? error.details.retryAfterMs / 60_000
      : SYNC_RETRY_DELAYS_MINUTES[attempt - 1];
  const delayInMinutes = Math.max(SYNC_ALARM_DELAY_MINUTES, requestedDelay);
  const metadata: SyncRetryMetadata = {
    code: error.code,
    attempt,
    nextAttemptAt: new Date(now + delayInMinutes * 60_000).toISOString(),
  };
  await storage.set({ [SYNC_RETRY_KEY]: metadata });
  await alarms.create(SYNC_RETRY_ALARM_NAME, { delayInMinutes });
  return { scheduled: true, exhausted: false, metadata } as const;
}

export async function clearSyncRetry(
  storage: Pick<SyncStateWriter, 'remove'> = chrome.storage.local,
  alarms: Pick<SyncAlarmCreator, 'clear'> = chrome.alarms,
) {
  await alarms.clear(SYNC_RETRY_ALARM_NAME);
  await storage.remove(SYNC_RETRY_KEY);
}

export async function runScheduledRetry(
  engine: BackgroundSyncRunner,
  reader: SyncStateReader = chrome.storage.local,
) {
  const stored = await reader.get([SYNC_RETRY_KEY]);
  if (!parseSyncRetry(stored[SYNC_RETRY_KEY])) return false;
  await engine.sync(false);
  return true;
}
