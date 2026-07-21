import type { Bookmark } from '../domain/model';

export type SearchKeyboardAction = {
  handled: boolean;
  activeIndex: number;
  action?: 'open' | 'clear-query';
};

export function getSearchKeyboardAction(
  key: string,
  activeIndex: number,
  resultCount: number,
  hasQuery: boolean,
): SearchKeyboardAction {
  const current = activeIndex >= 0 && activeIndex < resultCount ? activeIndex : -1;
  if (key === 'ArrowDown' && resultCount > 0) {
    return { handled: true, activeIndex: current < resultCount - 1 ? current + 1 : 0 };
  }
  if (key === 'ArrowUp' && resultCount > 0) {
    return { handled: true, activeIndex: current > 0 ? current - 1 : resultCount - 1 };
  }
  if (key === 'Enter' && current >= 0) {
    return { handled: true, activeIndex: current, action: 'open' };
  }
  if (key === 'Escape' && current >= 0) {
    return { handled: true, activeIndex: -1 };
  }
  if (key === 'Escape' && hasQuery) {
    return { handled: true, activeIndex: -1, action: 'clear-query' };
  }
  return { handled: false, activeIndex: current };
}

export function openResult(results: Bookmark[], index: number, navigate: (url: string) => void) {
  const result = results[index];
  if (!result) return false;
  navigate(result.url);
  return true;
}
