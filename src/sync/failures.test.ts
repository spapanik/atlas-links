import { beforeEach, describe, expect, it, vi } from 'vitest';
import { classifyDriveResponse, SyncError, syncErrorStatus, toSyncError } from './failures';

function googleError(status: number, reason?: string, headers?: HeadersInit) {
  return new Response(reason ? JSON.stringify({ error: { errors: [{ reason }] } }) : undefined, {
    status,
    headers,
  });
}

describe('sync failure classification', () => {
  beforeEach(() => vi.unstubAllGlobals());

  it.each([
    [401, undefined, 'authorization'],
    [403, 'insufficientPermissions', 'authorization'],
    [403, 'userRateLimitExceeded', 'rate-limit'],
    [403, 'dailyLimitExceeded', 'quota'],
    [403, 'storageQuotaExceeded', 'quota'],
    [403, 'forbidden', 'request'],
    [408, undefined, 'transient-service'],
    [500, undefined, 'transient-service'],
    [503, undefined, 'transient-service'],
    [501, undefined, 'request'],
    [400, undefined, 'request'],
  ])('classifies HTTP %i with reason %s as %s', async (status, reason, code) => {
    await expect(classifyDriveResponse(googleError(status, reason))).resolves.toMatchObject({
      code,
      details: { status },
    });
  });

  it('uses a valid Retry-After delta for rate limiting', async () => {
    await expect(
      classifyDriveResponse(googleError(429, undefined, { 'Retry-After': '120' })),
    ).resolves.toMatchObject({ code: 'rate-limit', details: { retryAfterMs: 120_000 } });
  });

  it('uses a valid Retry-After HTTP date', async () => {
    const now = Date.parse('2026-07-16T12:00:00.000Z');
    const retryAt = new Date(now + 90_000).toUTCString();

    await expect(
      classifyDriveResponse(googleError(503, undefined, { 'Retry-After': retryAt }), now),
    ).resolves.toMatchObject({ code: 'rate-limit', details: { retryAfterMs: 90_000 } });
  });

  it('does not use an invalid Retry-After value', async () => {
    await expect(
      classifyDriveResponse(googleError(429, undefined, { 'Retry-After': 'later' })),
    ).resolves.toMatchObject({ code: 'rate-limit', details: { retryAfterMs: undefined } });
  });

  it('distinguishes offline and online fetch failures without inspecting message text', () => {
    vi.stubGlobal('navigator', { onLine: false });
    expect(toSyncError(new TypeError('Failed to fetch'))).toMatchObject({ code: 'offline' });

    vi.stubGlobal('navigator', { onLine: true });
    expect(toSyncError(new TypeError('Failed to fetch'))).toMatchObject({
      code: 'transient-service',
    });
  });

  it('preserves typed consent denial and produces a typed status', () => {
    const error = new SyncError('authorization');
    expect(toSyncError(error)).toBe(error);
    expect(syncErrorStatus(error)).toEqual({
      state: 'error',
      code: 'authorization',
      message: 'Google authorization is required. Sign in again to resume sync.',
    });
  });
});
