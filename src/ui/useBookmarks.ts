import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChromeBookmarkRepository } from '../data/repository';
import type { BookmarkStore } from '../domain/model';

export const repository = new ChromeBookmarkRepository();
export function useBookmarks() {
  const [store, setStore] = useState<BookmarkStore>();
  const [error, setError] = useState('');
  const refresh = useCallback(
    () =>
      repository
        .getStore()
        .then(setStore)
        .catch((e: unknown) =>
          setError(e instanceof Error ? e.message : 'Could not load bookmarks.'),
        ),
    [],
  );
  useEffect(() => {
    void refresh();
    return repository.subscribe(() => void refresh());
  }, [refresh]);
  return useMemo(() => ({ store, error, refresh }), [store, error, refresh]);
}
