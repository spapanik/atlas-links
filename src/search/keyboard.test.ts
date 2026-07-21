import { describe, expect, it, vi } from 'vitest';
import type { Bookmark } from '../domain/model';
import { getSearchKeyboardAction, openResult } from './keyboard';

const bookmark: Bookmark = {
  id: 'one',
  name: 'One',
  url: 'https://example.com',
  description: '',
  tags: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('search keyboard navigation', () => {
  it('moves deterministically through results with wrapping', () => {
    expect(getSearchKeyboardAction('ArrowDown', -1, 3, false).activeIndex).toBe(0);
    expect(getSearchKeyboardAction('ArrowDown', 2, 3, false).activeIndex).toBe(0);
    expect(getSearchKeyboardAction('ArrowUp', -1, 3, false).activeIndex).toBe(2);
    expect(getSearchKeyboardAction('ArrowUp', 0, 3, false).activeIndex).toBe(2);
  });

  it('opens only an active result and clears selection before query', () => {
    expect(getSearchKeyboardAction('Enter', 1, 3, true)).toMatchObject({ action: 'open' });
    expect(getSearchKeyboardAction('Escape', 1, 3, true)).toEqual({
      handled: true,
      activeIndex: -1,
    });
    expect(getSearchKeyboardAction('Escape', -1, 3, true)).toMatchObject({
      action: 'clear-query',
    });
  });

  it('navigates the current tab to the selected bookmark', () => {
    const navigate = vi.fn();
    expect(openResult([bookmark], 0, navigate)).toBe(true);
    expect(navigate).toHaveBeenCalledWith('https://example.com');
    expect(openResult([bookmark], 2, navigate)).toBe(false);
  });
});
