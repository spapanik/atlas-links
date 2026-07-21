export const syncFailureCodes = [
  'offline',
  'authorization',
  'rate-limit',
  'quota',
  'corrupt-remote',
  'transient-service',
  'request',
] as const;

export type SyncFailureCode = (typeof syncFailureCodes)[number];

export type SyncStatus = {
  state: 'signed-out' | 'idle' | 'dirty' | 'syncing' | 'error';
  lastSyncedAt?: string;
  message?: string;
  code?: SyncFailureCode;
  retryExhausted?: boolean;
};

const states = new Set<SyncStatus['state']>(['signed-out', 'idle', 'dirty', 'syncing', 'error']);
const failureCodes = new Set<SyncFailureCode>(syncFailureCodes);

export function parseSyncStatus(value: unknown): SyncStatus | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.state !== 'string' || !states.has(candidate.state as SyncStatus['state']))
    return;
  if (
    candidate.lastSyncedAt !== undefined &&
    (typeof candidate.lastSyncedAt !== 'string' || Number.isNaN(Date.parse(candidate.lastSyncedAt)))
  )
    return;
  if (candidate.message !== undefined && typeof candidate.message !== 'string') return;
  if (candidate.state === 'error' && !candidate.message) return;
  if (
    candidate.code !== undefined &&
    (typeof candidate.code !== 'string' || !failureCodes.has(candidate.code as SyncFailureCode))
  )
    return;
  if (candidate.retryExhausted !== undefined && typeof candidate.retryExhausted !== 'boolean')
    return;

  return {
    state: candidate.state as SyncStatus['state'],
    ...(candidate.lastSyncedAt ? { lastSyncedAt: candidate.lastSyncedAt as string } : {}),
    ...(candidate.message ? { message: candidate.message as string } : {}),
    ...(candidate.state === 'error'
      ? { code: (candidate.code as SyncFailureCode | undefined) ?? 'transient-service' }
      : {}),
    ...(candidate.retryExhausted === true ? { retryExhausted: true } : {}),
  };
}

export function applyDirtyFlag(status: SyncStatus, syncDirty: unknown): SyncStatus {
  if (syncDirty === true && status.state === 'idle') return { ...status, state: 'dirty' };
  if (syncDirty === false && status.state === 'dirty') return { ...status, state: 'idle' };
  return status;
}
