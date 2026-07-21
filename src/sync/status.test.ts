import { describe, expect, it } from 'vitest';
import { applyDirtyFlag, parseSyncStatus } from './status';

describe('applyDirtyFlag', () => {
  const lastSyncedAt = '2026-01-01T00:00:00.000Z';

  it('shows pending changes for an idle signed-in user', () => {
    expect(applyDirtyFlag({ state: 'idle', lastSyncedAt }, true)).toEqual({
      state: 'dirty',
      lastSyncedAt,
    });
  });

  it('returns a dirty status to idle when pending changes are cleared', () => {
    expect(applyDirtyFlag({ state: 'dirty', lastSyncedAt }, false)).toEqual({
      state: 'idle',
      lastSyncedAt,
    });
  });

  it('never replaces signed-out or error states with dirty', () => {
    expect(applyDirtyFlag({ state: 'signed-out' }, true)).toEqual({ state: 'signed-out' });
    expect(applyDirtyFlag({ state: 'error', message: 'Try again.' }, true)).toEqual({
      state: 'error',
      message: 'Try again.',
    });
  });
});

describe('parseSyncStatus', () => {
  it('validates typed failure codes', () => {
    expect(parseSyncStatus({ state: 'error', code: 'quota', message: 'Quota exhausted.' })).toEqual(
      { state: 'error', code: 'quota', message: 'Quota exhausted.' },
    );
    expect(
      parseSyncStatus({ state: 'error', code: 'made-up', message: 'Unknown.' }),
    ).toBeUndefined();
  });

  it('migrates a legacy untyped error to a safe retryable code', () => {
    expect(parseSyncStatus({ state: 'error', message: 'Old status.' })).toEqual({
      state: 'error',
      code: 'transient-service',
      message: 'Old status.',
    });
  });
});
