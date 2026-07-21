import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

type Manifest = {
  permissions: string[];
  host_permissions: string[];
  action: { default_popup: string };
  commands: Record<string, { suggested_key?: Record<string, string>; description?: string }>;
  minimum_chrome_version: string;
  side_panel: { default_path: string };
};

const root = fileURLToPath(new URL('..', import.meta.url));
const manifest = JSON.parse(
  readFileSync(resolve(root, 'public/manifest.json'), 'utf8'),
) as Manifest;

describe('shortcut manifest configuration', () => {
  it('keeps the action popup and activeTab permission without broad tabs access', () => {
    expect(manifest.action.default_popup).toBe('popup.html');
    expect(manifest.permissions).toContain('activeTab');
    expect(manifest.permissions).not.toContain('tabs');
  });

  it('restricts Google host access to Drive API calls and OAuth revocation', () => {
    expect(manifest.host_permissions).toEqual([
      'https://www.googleapis.com/*',
      'https://oauth2.googleapis.com/*',
    ]);
  });

  it('declares capture and new-tab search shortcuts', () => {
    expect(manifest.commands._execute_action.suggested_key?.default).toBeTruthy();
    expect(manifest.commands['search-newtab']).toMatchObject({
      suggested_key: { default: expect.any(String), mac: expect.any(String) },
      description: expect.stringContaining('Search Atlas Links'),
    });
  });

  it('declares the Chrome 116 side panel without broad browser access', () => {
    expect(manifest.minimum_chrome_version).toBe('116');
    expect(manifest.permissions).toContain('sidePanel');
    expect(manifest.side_panel.default_path).toBe('sidepanel.html');
    expect(manifest.commands['search-sidebar']).toMatchObject({
      suggested_key: { default: expect.any(String), mac: expect.any(String) },
      description: expect.stringContaining('side panel'),
    });
    expect(manifest.permissions).not.toContain('tabs');
  });
});
