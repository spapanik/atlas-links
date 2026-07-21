import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));
const readRepositoryFile = (path: string) => readFileSync(resolve(root, path), 'utf8');
const homepage = readRepositoryFile('pages/index.html');
const policy = readRepositoryFile('pages/privacy/index.html');
const terms = readRepositoryFile('pages/terms-of-service/index.html');
const workflow = readRepositoryFile('.github/workflows/privacy-policy-pages.yml');
const privacyPolicyUrl = 'https://spapanik.github.io/atlas-links/privacy/';

describe('privacy policy publication', () => {
  it('identifies Atlas Links and clearly explains its purpose on the homepage', () => {
    expect(homepage).toContain('<title>Atlas Links</title>');
    expect(homepage).toContain('<h1>Atlas Links: a bookmark manager for Chrome.</h1>');
    expect(homepage).toMatch(
      /Atlas Links is a local-first Chrome extension for capturing, organising, and searching\s+bookmarks\./,
    );
    expect(homepage).toMatch(/sync them through your own Google Drive/);
    expect(homepage).not.toMatch(/<script\b/i);
  });

  it('keeps the required disclosures in a static, script-free policy', () => {
    expect(policy).toContain('<title>Privacy Policy — Atlas Links</title>');
    expect(policy).toContain('https://www.googleapis.com/auth/drive.appdata');
    expect(policy).toContain('atlas-links.v1.json');
    expect(policy).toContain('Chrome Web Store User Data Policy');
    expect(policy).toContain('including the Limited Use requirements');
    expect(policy).toContain('https://github.com/spapanik');
    expect(policy).not.toContain('https://github.com/spapanik/atlas-links/issues');
    expect(policy).not.toMatch(/<script\b/i);
  });

  it('publishes the Pages site with the supported Pages actions', () => {
    expect(workflow).toContain('path: pages');
    expect(workflow).toContain('actions/checkout@v7.0.0');
    expect(workflow).toContain('actions/configure-pages@v6.0.0');
    expect(workflow).toContain('actions/upload-pages-artifact@v5.0.0');
    expect(workflow).toContain('actions/deploy-pages@v5.0.0');
    expect(workflow).toContain('pages: write');
    expect(workflow).toContain('id-token: write');
  });

  it('links the public policy URL from repository and extension copy', () => {
    expect(readRepositoryFile('README.md')).toContain(privacyPolicyUrl);
    expect(readRepositoryFile('src/library/main.tsx')).toContain(privacyPolicyUrl);
  });

  it('keeps nested-page navigation within the repository Pages root', () => {
    expect(policy).not.toMatch(/href="\/(?:privacy\/|terms-of-service\/)?"/);
    expect(terms).not.toMatch(/href="\/(?:privacy\/|terms-of-service\/)?"/);
    expect(policy).toContain('href="../terms-of-service/"');
    expect(terms).toContain('href="../privacy/"');
  });

  it('uses the extension logo and fixed light visual theme on every page', () => {
    const styles = readRepositoryFile('pages/styles.css');
    expect(readRepositoryFile('pages/assets/atlas-links.svg')).toBe(
      readRepositoryFile('assets/atlas-links.svg'),
    );
    expect(homepage).toContain('src="assets/atlas-links.svg"');
    expect(policy).toContain('src="../assets/atlas-links.svg"');
    expect(terms).toContain('src="../assets/atlas-links.svg"');
    expect(homepage).toContain(
      '<link rel="icon" href="assets/atlas-links.svg" type="image/svg+xml" />',
    );
    expect(policy).toContain(
      '<link rel="icon" href="../assets/atlas-links.svg" type="image/svg+xml" />',
    );
    expect(terms).toContain(
      '<link rel="icon" href="../assets/atlas-links.svg" type="image/svg+xml" />',
    );
    expect(homepage).toContain('href="styles.css"');
    expect(policy).toContain('href="../styles.css"');
    expect(terms).toContain('href="../styles.css"');
    expect(styles).toContain('--color-primary: #236451');
    expect(styles).toContain('color-scheme: light');
    expect([homepage, policy, terms, styles].join('\n')).not.toContain(
      'prefers-color-scheme: dark',
    );
  });
});
