import { parseSyncStatus, type SyncStatus } from '../sync/status';

export interface InstallationStorage {
  get(keys: string | string[]): Promise<Record<string, unknown>>;
  set(items: { syncStatus: SyncStatus }): Promise<void>;
}

export type InstallationDetails = Pick<chrome.runtime.InstalledDetails, 'reason'>;

const SIGNED_OUT_STATUS = { state: 'signed-out' } satisfies SyncStatus;

export async function handleInstalled(
  _details: InstallationDetails,
  storage: InstallationStorage = chrome.storage.local,
) {
  const { syncStatus } = await storage.get('syncStatus');
  if (parseSyncStatus(syncStatus)) return false;

  await storage.set({ syncStatus: SIGNED_OUT_STATUS });
  return true;
}
