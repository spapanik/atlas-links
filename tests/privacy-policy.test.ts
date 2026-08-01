import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { parseHTML } from 'linkedom';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));
const readRepositoryFile = (path: string) => readFileSync(resolve(root, path), 'utf8');
const homepage = readRepositoryFile('pages/index.html');
const policy = readRepositoryFile('pages/privacy/index.html');
const terms = readRepositoryFile('pages/terms-of-service/index.html');
const workflow = readRepositoryFile('.github/workflows/publish-site.yml');
const siteUrl = 'https://atlas-links.kuma.ai/';
const privacyPolicyUrl = `${siteUrl}privacy/`;
const policyDocument = parseHTML(policy).document;

const sectionText = (id: string) => {
  const section = policyDocument.querySelector(`section[aria-labelledby="${id}"]`);
  expect(section, `privacy policy section labelled by #${id}`).not.toBeNull();
  return section?.textContent.replace(/\s+/g, ' ').trim() ?? '';
};

describe('privacy policy publication', () => {
  it('identifies Atlas Links and clearly explains its purpose on the homepage', () => {
    expect(homepage).toContain('<title>Atlas Links</title>');
    expect(homepage).toContain('<meta name="application-name" content="Atlas Links" />');
    expect(homepage).toContain('<h1>Atlas Links</h1>');
    expect(homepage).toMatch(/A bookmark manager for Chrome\./);
    expect(homepage).toMatch(
      /Atlas Links is a local-first Chrome extension for capturing, organising, and searching\s+bookmarks\./,
    );
    expect(homepage).toMatch(/sync them through your own Google Drive/);
    expect(homepage).not.toMatch(/<script\b/i);
  });

  it('explains what data is processed and that bookmark features are local-first', () => {
    expect(policyDocument.title).toBe('Privacy Policy — Atlas Links');
    expect(sectionText('data')).toMatch(/active tab's title and URL/);
    expect(sectionText('data')).toMatch(/does not read your browsing history/);
    expect(sectionText('local-storage')).toMatch(/stored in Chrome's extension-local storage/);
    expect(sectionText('local-storage')).toMatch(/work without an account/);
  });

  it('describes optional sync, its narrow access, and authentication handling', () => {
    const sync = sectionText('google-sync');
    const scope = policyDocument.querySelector('section[aria-labelledby="google-sync"] code');

    expect(sync).toMatch(/optional and begin only after an explicit action/);
    expect(scope?.textContent).toBe('https://www.googleapis.com/auth/drive.appdata');
    expect(sync).toMatch(/private Google Drive application-data folder/);
    expect(sync).toMatch(/does not store or log those tokens/);
    expect(sync).toMatch(/Signing out.*keeps your local bookmarks/);
  });

  it('states the sharing limits, user controls, and Google Limited Use commitment', () => {
    expect(sectionText('sharing')).toMatch(/shared with Google only.*backup and synchronization/);
    expect(sectionText('sharing')).toMatch(
      /does not share bookmark data with advertisers, data brokers, analytics providers/,
    );
    expect(sectionText('controls')).toMatch(/View, edit, export, or delete bookmarks/);
    expect(sectionText('controls')).toMatch(/Revoke Atlas Links' access/);
    expect(sectionText('google-sync')).toMatch(
      /Chrome Web Store User Data Policy.*Limited Use requirements/,
    );
  });

  it('is static and provides a safe public contact route', () => {
    expect(policyDocument.querySelector('script')).toBeNull();
    expect(
      policyDocument.querySelector('section[aria-labelledby="contact"] a')?.getAttribute('href'),
    ).toBe('https://github.com/spapanik');
  });

  it('publishes the site to Cloudflare Pages', () => {
    expect(workflow).toContain('actions/checkout@v7.0.0');
    expect(workflow).toContain('cloudflare/wrangler-action@v3');
    expect(workflow).toContain(
      'command: pages deploy pages --project-name=atlas-links --branch=main',
    );
    expect(workflow).toContain('secrets.CLOUDFLARE_API_TOKEN');
    expect(workflow).toContain('secrets.CLOUDFLARE_ACCOUNT_ID');
    expect(workflow).toContain('deployments: write');
  });

  it('builds the static site for the domain root', () => {
    for (const page of [homepage, policy, terms]) {
      expect(page).toContain('href="/styles.css"');
      expect(page).toContain('href="/assets/atlas-links.svg"');
      expect(page).toContain('href="/"');
      expect(page).toContain('src="/assets/atlas-links.svg"');
      expect(page).not.toMatch(/(?:href|src)="(?:\.\.\/|\.\/)/);
    }

    expect(homepage).toContain('href="/privacy/"');
    expect(homepage).toContain('href="/terms-of-service/"');
  });

  it('links the public policy URL from repository and extension copy', () => {
    expect(readRepositoryFile('README.md')).toContain(privacyPolicyUrl);
    expect(readRepositoryFile('src/library/main.tsx')).toContain(privacyPolicyUrl);
  });

  it('keeps nested-page navigation at the domain root', () => {
    for (const page of [policy, terms]) {
      expect(page).toContain('href="/"');
      expect(page).toContain('href="/privacy/"');
      expect(page).toContain('href="/terms-of-service/"');
    }
  });

  it('uses the extension logo and fixed light visual theme on every page', () => {
    const styles = readRepositoryFile('pages/styles.css');
    expect(readRepositoryFile('pages/assets/atlas-links.svg')).toBe(
      readRepositoryFile('assets/atlas-links.svg'),
    );
    expect(homepage).toContain('src="/assets/atlas-links.svg"');
    expect(policy).toContain('src="/assets/atlas-links.svg"');
    expect(terms).toContain('src="/assets/atlas-links.svg"');
    expect(homepage).toContain(
      '<link rel="icon" href="/assets/atlas-links.svg" type="image/svg+xml" />',
    );
    expect(policy).toContain(
      '<link rel="icon" href="/assets/atlas-links.svg" type="image/svg+xml" />',
    );
    expect(terms).toContain(
      '<link rel="icon" href="/assets/atlas-links.svg" type="image/svg+xml" />',
    );
    expect(homepage).toContain('href="/styles.css"');
    expect(policy).toContain('href="/styles.css"');
    expect(terms).toContain('href="/styles.css"');
    expect(styles).toContain('--color-primary: #236451');
    expect(styles).toContain('color-scheme: light');
    expect([homepage, policy, terms, styles].join('\n')).not.toContain(
      'prefers-color-scheme: dark',
    );
  });
});
