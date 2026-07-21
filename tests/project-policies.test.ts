import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));
const readRepositoryFile = (path: string) => readFileSync(resolve(root, path), 'utf8');

describe('project licensing and security policy', () => {
  it('declares the complete MPL-2.0 license in project metadata', () => {
    const packageJson = JSON.parse(readRepositoryFile('package.json')) as { license?: string };
    const license = readRepositoryFile('LICENSE.md');

    expect(packageJson.license).toBe('MPL-2.0');
    expect(license.startsWith('Mozilla Public License Version 2.0')).toBe(true);
    expect(license).toContain('3.2. Distribution of Executable Form');
    expect(license).toContain('Exhibit A - Source Code Form License Notice');
  });

  it('provides private vulnerability reporting instructions', () => {
    const securityPolicy = readRepositoryFile('SECURITY.md');

    expect(securityPolicy).toContain(
      'https://github.com/spapanik/atlas-links/security/advisories/new',
    );
    expect(securityPolicy).toContain('Do not open a public issue');
    expect(securityPolicy).toContain('Latest Chrome Web Store release');
  });

  it('links extension recipients to the corresponding source code', () => {
    expect(readRepositoryFile('src/library/main.tsx')).toContain(
      'https://github.com/spapanik/atlas-links',
    );
  });
});
