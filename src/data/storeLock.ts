const BOOKMARK_STORE_LOCK = 'atlas-links-bookmark-store';

let fallbackTail = Promise.resolve();

async function withFallbackLock<T>(work: () => Promise<T>): Promise<T> {
  const previous = fallbackTail;
  let release!: () => void;
  fallbackTail = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    return await work();
  } finally {
    release();
  }
}

export function withBookmarkStoreLock<T>(work: () => Promise<T>): Promise<T> {
  // Extension pages and the service worker share an origin, so this lock makes
  // each chrome.storage.local read-modify-write transaction cross-context safe.
  const locks = globalThis.navigator?.locks;
  return locks
    ? locks.request(BOOKMARK_STORE_LOCK, { mode: 'exclusive' }, work)
    : withFallbackLock(work);
}
