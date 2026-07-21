import { parseSyncStatus, type SyncStatus } from '../sync/status';

export type SyncCommand = 'sync' | 'retry-sync' | 'replace-corrupt-backup' | 'sign-out';
type SendMessage = (message: { type: SyncCommand }) => Promise<unknown>;

export const CORRUPT_BACKUP_CONFIRMATION =
  'Replace the corrupt Google Drive backup with your current local bookmarks? This permanently overwrites the remote backup and cannot be undone.';

const channelError: SyncStatus = {
  state: 'error',
  code: 'transient-service',
  message: 'Could not contact the Atlas Links background service. Try again.',
};
const responseError: SyncStatus = {
  state: 'error',
  code: 'transient-service',
  message: 'Atlas Links received an invalid sync response. Try again.',
};

export async function sendSyncCommand(
  type: SyncCommand,
  sendMessage: SendMessage = (message) => chrome.runtime.sendMessage(message),
): Promise<SyncStatus> {
  try {
    return parseSyncStatus(await sendMessage({ type })) ?? responseError;
  } catch {
    return channelError;
  }
}

export function syncStatusLabel(status: SyncStatus) {
  if (status.state === 'idle')
    return `Synced${status.lastSyncedAt ? ` ${new Date(status.lastSyncedAt).toLocaleString()}` : ''}`;
  if (status.state === 'signed-out')
    return `Local only${status.message ? ` — ${status.message}` : ''}`;
  if (status.state === 'syncing') return 'Syncing…';
  if (status.state === 'error')
    return `${status.message ?? 'Sync failed. Try again.'}${status.retryExhausted ? ' Automatic retries stopped.' : ''}`;
  return 'Changes waiting';
}

export function syncPrimaryAction(status: SyncStatus): {
  command: SyncCommand;
  label: string;
} {
  if (status.state === 'signed-out') return { command: 'sync', label: 'Sign in with Google' };
  if (status.state === 'error' && status.code === 'authorization')
    return { command: 'sync', label: 'Sign in again' };
  if (status.state === 'error' && status.code === 'corrupt-remote')
    return {
      command: 'replace-corrupt-backup',
      label: 'Replace corrupt Drive backup with local data',
    };
  if (status.state === 'error') return { command: 'retry-sync', label: 'Retry sync' };
  return { command: 'sync', label: 'Sync now' };
}
