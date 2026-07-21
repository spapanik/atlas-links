import type { SyncFailureCode, SyncStatus } from './status';

const RATE_LIMIT_REASONS = new Set([
  'rateLimitExceeded',
  'userRateLimitExceeded',
  'sharingRateLimitExceeded',
]);
const QUOTA_REASONS = new Set([
  'dailyLimitExceeded',
  'storageQuotaExceeded',
  'teamDriveFileLimitExceeded',
  'activeItemCreationLimitExceeded',
  'appFolderSizeLimitExceeded',
  'projectQuotaExceeded',
]);
const AUTHORIZATION_REASONS = new Set(['authError', 'insufficientPermissions']);
const RETRYABLE_SERVICE_STATUSES = new Set([408, 500, 502, 503, 504]);

const messages: Record<SyncFailureCode, string> = {
  offline: 'Atlas Links is offline. Check your connection and try again.',
  authorization: 'Google authorization is required. Sign in again to resume sync.',
  'rate-limit': 'Google Drive is temporarily rate-limiting sync. Try again shortly.',
  quota: 'Google Drive quota is exhausted. Free space or review the project quota, then retry.',
  'corrupt-remote':
    'The Drive backup is invalid or too large. Local bookmarks were left unchanged.',
  'transient-service': 'Google Drive is temporarily unavailable. Try again shortly.',
  request: 'Google Drive rejected the sync request. Review access and try again.',
};

export class SyncError extends Error {
  constructor(
    public readonly code: SyncFailureCode,
    message = messages[code],
    public readonly details: {
      status?: number;
      retryAfterMs?: number;
      remoteFileId?: string;
      retryExhausted?: boolean;
    } = {},
  ) {
    super(message);
    this.name = 'SyncError';
  }
}

export function isRetryableFailure(code: SyncFailureCode) {
  return code === 'offline' || code === 'rate-limit' || code === 'transient-service';
}

export function toSyncError(error: unknown): SyncError {
  if (error instanceof SyncError) return error;
  return new SyncError(
    typeof navigator !== 'undefined' && navigator.onLine === false
      ? 'offline'
      : 'transient-service',
  );
}

export function syncErrorStatus(error: unknown, retryExhausted = false): SyncStatus {
  const failure = toSyncError(error);
  const exhausted = retryExhausted || failure.details.retryExhausted === true;
  return {
    state: 'error',
    code: failure.code,
    message: failure.message,
    ...(exhausted ? { retryExhausted: true } : {}),
  };
}

function parseRetryAfter(value: string | null, now: number) {
  if (!value) return;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000;
  const date = Date.parse(value);
  if (!Number.isNaN(date) && date > now) return date - now;
}

async function googleReasons(response: Response) {
  try {
    const payload = (await response.clone().json()) as {
      error?: { errors?: Array<{ reason?: unknown }> };
    };
    return new Set(
      (payload.error?.errors ?? [])
        .map((item) => item.reason)
        .filter((reason): reason is string => typeof reason === 'string'),
    );
  } catch {
    return new Set<string>();
  }
}

export async function classifyDriveResponse(response: Response, now = Date.now()) {
  const status = response.status;
  const retryAfterMs = parseRetryAfter(response.headers.get('Retry-After'), now);
  const reasons = await googleReasons(response);
  const hasReason = (known: Set<string>) => [...reasons].some((reason) => known.has(reason));

  if (status === 401 || hasReason(AUTHORIZATION_REASONS))
    return new SyncError('authorization', undefined, { status });
  if (retryAfterMs !== undefined || status === 429 || hasReason(RATE_LIMIT_REASONS))
    return new SyncError('rate-limit', undefined, { status, retryAfterMs });
  if (hasReason(QUOTA_REASONS)) return new SyncError('quota', undefined, { status });
  if (RETRYABLE_SERVICE_STATUSES.has(status))
    return new SyncError('transient-service', undefined, { status });
  return new SyncError('request', undefined, { status });
}
