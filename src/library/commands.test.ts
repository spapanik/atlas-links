import { describe, expect, it } from 'vitest';
import { shortcutLabel } from './commands';

describe('shortcut labels', () => {
  it('shows the registered key and explains missing assignments consistently', () => {
    const commands = [
      { name: '_execute_action', shortcut: 'Ctrl+Shift+Y' },
      { name: 'search-newtab', shortcut: '' },
      { name: 'search-sidebar', shortcut: 'Ctrl+Shift+L' },
    ];
    expect(shortcutLabel(commands, '_execute_action')).toBe('Ctrl+Shift+Y');
    expect(shortcutLabel(commands, 'search-newtab')).toBe('Unassigned');
    expect(shortcutLabel(commands, 'search-sidebar')).toBe('Ctrl+Shift+L');
    expect(shortcutLabel([], '_execute_action')).toBe('Unassigned');
  });
});
