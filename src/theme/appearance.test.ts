import { describe, expect, it } from 'vitest';
import {
  AppearanceController,
  parseAppearancePreference,
  resolveTheme,
  type AppearancePreference,
  type AppearanceStorage,
  type SystemThemeQuery,
  type ThemeRoot,
} from './appearance';

class FakeStorage implements AppearanceStorage {
  writes: AppearancePreference[] = [];
  readError = false;
  private readonly listeners = new Set<(value: unknown) => void>();

  constructor(public value: unknown) {}

  async read() {
    if (this.readError) throw new Error('Storage unavailable');
    return this.value;
  }

  async write(preference: AppearancePreference) {
    this.value = preference;
    this.writes.push(preference);
  }

  subscribe(listener: (value: unknown) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(value: unknown) {
    this.value = value;
    this.listeners.forEach((listener) => listener(value));
  }
}

class FakeSystemTheme implements SystemThemeQuery {
  private readonly listeners = new Set<() => void>();

  constructor(public matches: boolean) {}

  addEventListener(_type: 'change', listener: () => void) {
    this.listeners.add(listener);
  }

  removeEventListener(_type: 'change', listener: () => void) {
    this.listeners.delete(listener);
  }

  change(matches: boolean) {
    this.matches = matches;
    this.listeners.forEach((listener) => listener());
  }
}

class FakeRoot implements ThemeRoot {
  attributes = new Map<string, string>();

  setAttribute(name: string, value: string) {
    this.attributes.set(name, value);
  }

  get(name: string) {
    return this.attributes.get(name);
  }
}

function setup(value: unknown, systemDark = false) {
  const storage = new FakeStorage(value);
  const system = new FakeSystemTheme(systemDark);
  const root = new FakeRoot();
  const controller = new AppearanceController(storage, system, root);
  return { storage, system, root, controller };
}

describe('appearance parsing and resolution', () => {
  it('defaults missing and invalid preferences to system', () => {
    expect(parseAppearancePreference(undefined)).toBe('system');
    expect(parseAppearancePreference('sepia')).toBe('system');
  });

  it('accepts stored preferences and resolves system from the media query', () => {
    expect(parseAppearancePreference('light')).toBe('light');
    expect(parseAppearancePreference('dark')).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('light', true)).toBe('light');
  });
});

describe('AppearanceController', () => {
  it('applies a stored preference before marking the document ready', async () => {
    const { controller, root, system } = setup('dark');
    await controller.initialize();

    expect(controller.getPreference()).toBe('dark');
    expect(root.get('data-theme')).toBe('dark');
    expect(root.get('data-theme-ready')).toBe('');

    system.change(false);
    expect(root.get('data-theme')).toBe('dark');
  });

  it('follows system changes only while system is selected', async () => {
    const { controller, root, system } = setup(undefined);
    await controller.initialize();
    expect(root.get('data-theme')).toBe('light');

    system.change(true);
    expect(root.get('data-theme')).toBe('dark');

    await controller.select('light');
    system.change(false);
    system.change(true);
    expect(root.get('data-theme')).toBe('light');
  });

  it('updates immediately, persists selection, and accepts cross-storage changes', async () => {
    const { controller, root, storage } = setup('system');
    const observed: AppearancePreference[] = [];
    await controller.initialize();
    controller.subscribe((preference) => observed.push(preference));

    const persisted = controller.select('dark');
    expect(root.get('data-theme')).toBe('dark');
    expect(await persisted).toBe(true);
    expect(storage.writes).toEqual(['dark']);

    storage.emit('light');
    expect(controller.getPreference()).toBe('light');
    expect(root.get('data-theme')).toBe('light');
    expect(observed).toEqual(['dark', 'light']);
  });

  it('falls back to system when storage cannot be read', async () => {
    const { controller, root, storage } = setup('dark', true);
    storage.readError = true;

    await expect(controller.initialize()).resolves.toBe('system');
    expect(root.get('data-theme')).toBe('dark');
    expect(root.get('data-theme-ready')).toBe('');
  });
});
