import { ChromeBookmarkRepository } from './data/repository';
import { SyncEngine } from './sync/services';
import { syncErrorStatus } from './sync/failures';
import { FOCUS_SIDE_PANEL_MESSAGE, handleCommand } from './background/commands';
import { handleInstalled } from './background/installation';
import {
  runScheduledRetry,
  scheduleBackgroundSync,
  SYNC_ALARM_NAME,
  SYNC_RETRY_ALARM_NAME,
  syncIfDirty,
} from './sync/scheduling';
const engine = new SyncEngine(new ChromeBookmarkRepository());
chrome.runtime.onInstalled.addListener((details) => {
  void handleInstalled(details).catch(() => undefined);
});
chrome.runtime.onMessage.addListener((message: unknown, _sender, respond) => {
  const type = (message as { type?: string })?.type;
  if (type === 'schedule-sync') {
    void scheduleBackgroundSync().catch(() => undefined);
    return;
  }
  if (type === 'sync') {
    engine
      .sync(true)
      .then(respond)
      .catch((e: unknown) => respond(syncErrorStatus(e)));
    return true;
  }
  if (type === 'retry-sync') {
    engine
      .retryNow()
      .then(respond)
      .catch((e: unknown) => respond(syncErrorStatus(e)));
    return true;
  }
  if (type === 'replace-corrupt-backup') {
    engine
      .replaceCorruptBackup()
      .then(respond)
      .catch((e: unknown) => respond(syncErrorStatus(e)));
    return true;
  }
  if (type === 'sign-out') {
    engine
      .signOut()
      .then(respond)
      .catch((e: unknown) => respond(syncErrorStatus(e)));
    return true;
  }
});
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === SYNC_ALARM_NAME) void syncIfDirty(engine).catch(() => undefined);
  if (alarm.name === SYNC_RETRY_ALARM_NAME) void runScheduledRetry(engine).catch(() => undefined);
});
chrome.commands.onCommand.addListener((command, tab) => {
  void handleCommand(
    command,
    {
      getUrl: (path) => chrome.runtime.getURL(path),
      createTab: (properties) => chrome.tabs.create(properties),
      openSidePanel:
        typeof chrome.sidePanel?.open === 'function'
          ? (properties) => chrome.sidePanel.open(properties)
          : undefined,
      closeSidePanel:
        typeof chrome.sidePanel?.close === 'function'
          ? (properties) => chrome.sidePanel.close(properties)
          : undefined,
      focusSidePanel: () => chrome.runtime.sendMessage({ type: FOCUS_SIDE_PANEL_MESSAGE }),
    },
    tab,
  ).catch(() => undefined);
});
