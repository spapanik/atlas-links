import { describe, expect, it, vi } from 'vitest';
import {
  CORRUPT_BACKUP_CONFIRMATION,
  sendSyncCommand,
  syncPrimaryAction,
  syncStatusLabel,
} from './syncControls';

describe('sendSyncCommand', () => {
  it('returns a validated sync status', async () => {
    const sendMessage = vi.fn(async () => ({
      state: 'idle',
      lastSyncedAt: '2026-01-01T00:00:00.000Z',
    }));

    await expect(sendSyncCommand('sync', sendMessage)).resolves.toEqual({
      state: 'idle',
      lastSyncedAt: '2026-01-01T00:00:00.000Z',
    });
    expect(sendMessage).toHaveBeenCalledWith({ type: 'sync' });
  });

  it('recovers when the runtime message rejects', async () => {
    const sendMessage = vi.fn(async () => Promise.reject(new Error('Channel closed')));

    await expect(sendSyncCommand('sign-out', sendMessage)).resolves.toEqual({
      state: 'error',
      code: 'transient-service',
      message: 'Could not contact the Atlas Links background service. Try again.',
    });
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['empty object', {}],
    ['unknown state', { state: 'unknown' }],
    ['error without a message', { state: 'error' }],
    ['invalid timestamp', { state: 'idle', lastSyncedAt: 'not-a-date' }],
  ])('recovers from a malformed %s response', async (_label, response) => {
    await expect(sendSyncCommand('sync', async () => response)).resolves.toEqual({
      state: 'error',
      code: 'transient-service',
      message: 'Atlas Links received an invalid sync response. Try again.',
    });
  });
});

describe('syncStatusLabel', () => {
  it('keeps local-only state visible alongside a revocation warning', () => {
    expect(
      syncStatusLabel({
        state: 'signed-out',
        message: 'Google access could not be revoked. Remove access manually.',
      }),
    ).toBe('Local only — Google access could not be revoked. Remove access manually.');
  });

  it('shows when bounded automatic retries are exhausted', () => {
    expect(
      syncStatusLabel({
        state: 'error',
        code: 'offline',
        message: 'Atlas Links is offline.',
        retryExhausted: true,
      }),
    ).toBe('Atlas Links is offline. Automatic retries stopped.');
  });
});

describe('syncPrimaryAction', () => {
  it('states the destructive remote effect before corrupt-backup replacement', () => {
    expect(CORRUPT_BACKUP_CONFIRMATION).toMatch(/permanently overwrites the remote backup/i);
    expect(CORRUPT_BACKUP_CONFIRMATION).toMatch(/cannot be undone/i);
  });

  it.each([
    [{ state: 'signed-out' } as const, { command: 'sync', label: 'Sign in with Google' }],
    [
      {
        state: 'error',
        code: 'authorization',
        message: 'Sign in.',
      } as const,
      { command: 'sync', label: 'Sign in again' },
    ],
    [
      { state: 'error', code: 'offline', message: 'Offline.' } as const,
      { command: 'retry-sync', label: 'Retry sync' },
    ],
    [
      { state: 'error', code: 'quota', message: 'Quota.' } as const,
      { command: 'retry-sync', label: 'Retry sync' },
    ],
    [
      { state: 'error', code: 'corrupt-remote', message: 'Corrupt.' } as const,
      {
        command: 'replace-corrupt-backup',
        label: 'Replace corrupt Drive backup with local data',
      },
    ],
  ])('maps typed status %# to the correct recovery action', (status, action) => {
    expect(syncPrimaryAction(status)).toEqual(action);
  });
});
