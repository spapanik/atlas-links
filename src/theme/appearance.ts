export const APPEARANCE_STORAGE_KEY = 'appearancePreference';

export type AppearancePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme = Exclude<AppearancePreference, 'system'>;

export interface AppearanceStorage {
  read(): Promise<unknown>;
  write(preference: AppearancePreference): Promise<void>;
  subscribe(listener: (value: unknown) => void): () => void;
}

export interface SystemThemeQuery {
  readonly matches: boolean;
  addEventListener(type: 'change', listener: () => void): void;
  removeEventListener(type: 'change', listener: () => void): void;
}

export interface ThemeRoot {
  setAttribute(name: string, value: string): void;
}

export function parseAppearancePreference(value: unknown): AppearancePreference {
  return value === 'light' || value === 'dark' || value === 'system' ? value : 'system';
}

export function resolveTheme(
  preference: AppearancePreference,
  systemPrefersDark: boolean,
): ResolvedTheme {
  return preference === 'system' ? (systemPrefersDark ? 'dark' : 'light') : preference;
}

export class AppearanceController {
  private preference: AppearancePreference = 'system';
  private initializePromise?: Promise<AppearancePreference>;
  private disconnectStorage?: () => void;
  private connected = false;
  private readonly listeners = new Set<(preference: AppearancePreference) => void>();
  private readonly handleSystemChange = () => {
    if (this.preference === 'system') this.applyTheme();
  };

  constructor(
    private readonly storage: AppearanceStorage,
    private readonly systemTheme: SystemThemeQuery,
    private readonly root: ThemeRoot,
  ) {}

  getPreference() {
    return this.preference;
  }

  initialize() {
    this.initializePromise ??= this.loadPreference();
    return this.initializePromise;
  }

  async select(preference: AppearancePreference) {
    this.updatePreference(parseAppearancePreference(preference));
    try {
      await this.storage.write(this.preference);
      return true;
    } catch {
      return false;
    }
  }

  subscribe(listener: (preference: AppearancePreference) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  dispose() {
    this.disconnectStorage?.();
    this.systemTheme.removeEventListener('change', this.handleSystemChange);
    this.connected = false;
  }

  private async loadPreference() {
    let stored: unknown;
    try {
      stored = await this.storage.read();
    } catch {
      stored = undefined;
    }
    this.updatePreference(parseAppearancePreference(stored));
    this.root.setAttribute('data-theme-ready', '');
    this.connect();
    return this.preference;
  }

  private connect() {
    if (this.connected) return;
    this.connected = true;
    this.disconnectStorage = this.storage.subscribe((value) => {
      this.updatePreference(parseAppearancePreference(value));
    });
    this.systemTheme.addEventListener('change', this.handleSystemChange);
  }

  private updatePreference(preference: AppearancePreference) {
    const changed = preference !== this.preference;
    this.preference = preference;
    this.applyTheme();
    if (changed) this.listeners.forEach((listener) => listener(preference));
  }

  private applyTheme() {
    this.root.setAttribute('data-theme', resolveTheme(this.preference, this.systemTheme.matches));
    this.root.setAttribute('data-theme-preference', this.preference);
  }
}

function createChromeAppearanceStorage(): AppearanceStorage {
  return {
    async read() {
      return (await chrome.storage.local.get(APPEARANCE_STORAGE_KEY))[APPEARANCE_STORAGE_KEY];
    },
    async write(preference) {
      await chrome.storage.local.set({ [APPEARANCE_STORAGE_KEY]: preference });
    },
    subscribe(listener) {
      const handleChange = (
        changes: Record<string, chrome.storage.StorageChange>,
        areaName: string,
      ) => {
        if (areaName === 'local' && changes[APPEARANCE_STORAGE_KEY]) {
          listener(changes[APPEARANCE_STORAGE_KEY].newValue);
        }
      };
      chrome.storage.onChanged.addListener(handleChange);
      return () => chrome.storage.onChanged.removeListener(handleChange);
    },
  };
}

let appearanceController: AppearanceController | undefined;

export function getAppearanceController() {
  appearanceController ??= new AppearanceController(
    createChromeAppearanceStorage(),
    window.matchMedia('(prefers-color-scheme: dark)'),
    document.documentElement,
  );
  return appearanceController;
}

export function initializeAppearance() {
  return getAppearanceController().initialize();
}
