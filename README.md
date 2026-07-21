# Atlas Links

Atlas Links is a local-first Chrome extension for capturing, organizing, searching, and optionally syncing bookmarks through the private Google Drive `appDataFolder`.

## Development

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

For Google sync, create a Chrome Extension OAuth client in Google Cloud, enable the Google Drive API, and set `VITE_GOOGLE_OAUTH_CLIENT_ID` in `.env.local`. The production build inserts that identifier into the extension manifest; no client secret belongs in this repository. The only Drive scope is `https://www.googleapis.com/auth/drive.appdata`.

Run `pnpm build`, then load the generated `dist` folder from `chrome://extensions` with Developer mode enabled. The unpacked extension ID must match the OAuth client's extension ID.

### Build and package variants

- `pnpm build` creates the unpacked development `dist/` directory. It permits the placeholder OAuth client ID when local Google sync is not being tested and includes `VITE_CHROME_EXTENSION_KEY` when configured.
- `pnpm build:zip` creates `atlas-links.zip` with the same development behavior.
- `pnpm build:zip:prod` creates `atlas-links-web-store.zip` for Chrome Web Store submission. It requires a real `VITE_GOOGLE_OAUTH_CLIENT_ID`, strips the development manifest `key` even when `VITE_CHROME_EXTENSION_KEY` is set, and verifies the built manifest's client ID and Google host permissions before zipping. This is the only package intended for store submission.
- `pnpm build:crx` creates a production `atlas-links.crx`, signed with the RSA key stored in the GPG-encrypted file named by `CRX_SIGNING_KEY_PATH`. It also requires a real `VITE_GOOGLE_OAUTH_CLIENT_ID`.

Chrome's CRX3 format uses an RSA private key, not a GPG key. Keep that PEM key encrypted at rest with GPG, for example with `gpg --encrypt --recipient YOUR_GPG_KEY_ID atlas-links.pem`, and set `CRX_SIGNING_KEY_PATH` to the resulting `.gpg` file. The build decrypts it into a private temporary directory, restricts the plaintext key to its owner, removes it after packaging, and never writes it into `dist` or the CRX. Keep using the same RSA key for every release so the extension ID remains stable, and configure the production Google OAuth client for the extension ID derived from that key.

Every production packaging attempt deletes the previous Web Store zip before validation, so a failed build cannot leave an older package that appears current.

### Use the Web Store identity for local testing

The Google OAuth client is associated with Chrome Web Store extension ID `nckaglmagjfjlmpmaondfpmljinpdnfi`. Chrome derives an unpacked extension's ID from a public key, so the 32-character ID itself cannot be placed in the manifest.

1. Open the Atlas Links item in the Chrome Web Store Developer Dashboard.
2. Copy the item's **public key** from its package details. This is a long base64 value, not the 32-character extension ID. If the dashboard does not expose it, retrieve the draft item's `publicKey` through the Chrome Web Store API or test a Web Store-installed trusted-testing build.
3. Put both values in `.env.local`:

   ```env
   VITE_GOOGLE_OAUTH_CLIENT_ID=your-extension-client-id.apps.googleusercontent.com
   VITE_CHROME_EXTENSION_KEY=your-web-store-item-public-key
   ```

4. Rebuild the unpacked extension:

   ```bash
   pnpm build
   ```

5. Open `chrome://extensions`, enable **Developer mode**, remove any older unpacked Atlas Links installation with a different ID, choose **Load unpacked**, and select `dist`.
6. Confirm Chrome shows extension ID `nckaglmagjfjlmpmaondfpmljinpdnfi`, then test **Sign in with Google** using an account allowed by the Google Auth Platform audience configuration.

To verify that the generated manifest contains both configuration values without printing them:

```bash
node -e "const m=require('./dist/manifest.json'); console.log({idKeyConfigured:Boolean(m.key), oauthClientConfigured:!m.oauth2.client_id.startsWith('CONFIGURE_')})"
```

The manifest `key` and OAuth client ID are public application identifiers. Never add an OAuth client secret, access token, or refresh token to `.env.local`. The file remains ignored so environment-specific values are not committed accidentally.

## Checks

```bash
pnpm format
pnpm lint
pnpm test
pnpm test:coverage
pnpm build
```

`pnpm format` writes formatting changes. `pnpm lint` runs ESLint, TypeScript validation, and the formatting check. Use `pnpm test` for a fast test run during development; `pnpm test:coverage` is the complete handoff check. Run `pnpm build` after lint because the build only bundles the extension and does not repeat TypeScript validation.

Bookmarks remain in `chrome.storage.local` when signed out. Sync stores one validated JSON file named `atlas-links.v1.json` in the signed-in user's private Drive application-data area. No analytics or telemetry is collected.

Signing out immediately returns Atlas Links to local-only mode, attempts to revoke the Google OAuth grant, and clears Chrome's cached authorization. If Google revocation cannot be confirmed, local bookmarks remain available and the library shows a warning with the manual Google Account fallback.

## Privacy policy

The Atlas Links privacy policy is published at [https://spapanik.github.io/atlas-links/privacy/](https://spapanik.github.io/atlas-links/privacy/). Its canonical source is [`pages/privacy/index.html`](pages/privacy/index.html), and [the Pages workflow](.github/workflows/privacy-policy-pages.yml) publishes the `pages` directory after relevant changes land on `main`.

For the first deployment, open the repository's **Settings → Pages**, set **Build and deployment → Source** to **GitHub Actions**, then run the **Publish privacy policy** workflow or push a relevant change to `main`. No custom domain or separate hosting account is required. The `pages` directory is the site root, so additional content can be added there without changing the privacy-policy URL. Because this repository is private, its GitHub account must have a plan that supports Pages for private repositories; otherwise, publish the same directory from a public repository. After deployment, use the same public URL in the Chrome Web Store privacy-policy field and the Google Auth Platform branding configuration.

### Store concurrency

Bookmark-store read-modify-write transactions use one named Web Lock shared by extension pages and the service worker. Network requests never hold that lock. After an upload, sync acquires the lock, compares the current store with its original snapshot, and merges any intervening local changes before writing. A concurrent change keeps the store dirty and schedules a follow-up sync rather than allowing an older snapshot to replace local data.

### Drive concurrency

Atlas Links stores one stable app-data file and explicitly uses file-level last-writer-wins for Drive uploads. If two devices download the same file and upload near-simultaneously, the later upload temporarily becomes the remote document. Each device retains its locally merged state; on a subsequent sync, Atlas Links downloads the remote document, deterministically merges bookmarks by stable ID (including tombstones), and uploads the converged result. The Drive media update does not claim an unverified conditional-write guarantee.

### Background sync scheduling

Pending signed-in changes schedule the single named `atlas-sync` alarm with a 0.5-minute delay, [Chrome's minimum supported alarm delay](https://developer.chrome.com/docs/extensions/reference/api/alarms). Repeated edits replace that same named alarm instead of creating parallel sync jobs. Signed-out state and clean stores neither schedule nor execute background sync; manual sign-in and **Sync now** remain explicit actions.

Retryable offline, rate-limit, and temporary Google service failures use a separate `atlas-sync-retry` alarm so backoff survives service-worker shutdown. Without a valid server `Retry-After`, retries are limited to 0.5, 1, 2, and 4 minutes after the initial failure. Authorization, permanent quota, and corrupt-backup failures are never retried automatically. A manual retry starts a new bounded sequence; sign-out and successful sync clear the retry state.

Remote `atlas-links.v1.json` responses are limited to 5 MiB before JSON parsing and still pass through the versioned bookmark-store validator. Invalid, unsupported, or oversized Drive data never replaces the local store. Recovery requires explicit confirmation before Atlas Links overwrites the corrupt Drive backup with validated local data.

## Editable JSON import and export

The full Atlas Links library can download active bookmarks as `atlas-links.json` and review an edited file before applying it. Import and export happen locally, work while signed out or offline, and make no network request. Files are limited to 5 MB and 10,000 bookmark records.

The interchange format is deliberately separate from the internal local and Drive store:

```json
{
  "format": "atlas-links",
  "schemaVersion": 1,
  "exportedAt": "2026-07-14T12:00:00.000Z",
  "bookmarks": [
    {
      "id": "7df16c29-ad8a-46dd-b05f-7abda50960d9",
      "url": "https://example.com/reference",
      "name": "Example reference",
      "description": "A useful page",
      "tags": ["Reference", "Work"],
      "createdAt": "2026-06-01T09:30:00.000Z",
      "updatedAt": "2026-07-10T16:45:00.000Z"
    }
  ]
}
```

- `format` is always `atlas-links` and `schemaVersion` is currently `1`.
- `exportedAt`, `createdAt`, and `updatedAt` use ISO 8601 UTC timestamps.
- `bookmarks` contains active bookmarks only. Each exported record has the stable `id`, required `url` and `name`, plain-text `description`, string `tags`, and timestamps shown above.
- On import, `id`, `createdAt`, and `updatedAt` may be omitted for a new record; Atlas Links generates safe values. The URL, name, description, and tags remain required.
- Existing records match by stable ID first, then normalized URL. Omitted records are left alone: import is not a restore and never infers deletions.
- Unsupported fields—including `deletedAt`, repository revisions, device IDs, sync state, and account metadata—are rejected or reported as invalid rather than ignored.

Bookmark exports can contain private URLs, names, and descriptions. Review a file carefully before giving it to an external editor, service, or LLM. Atlas Links does not send the file to those tools.

## Logo usage

The canonical, editable artwork is [`assets/atlas-links.svg`](assets/atlas-links.svg). Production PNGs are exported at 16, 32, 48, and 128 px for Chrome; in-product branding imports the SVG through the shared `Logo` component so Vite emits a fingerprinted build asset. Keep clear space around the mark equal to at least one eighth of its width, and do not display it below 16 px.

Regenerate the manifest PNGs from the repository root with librsvg's `rsvg-convert`:

```sh
for size in 16 32 48 128; do
  rsvg-convert --width "$size" --height "$size" assets/atlas-links.svg --output "public/icons/atlas-links-$size.png"
done
```

Brand colors are forest `#236451`, ivory `#fbfaf6`, and amber `#e8a94a`. The contained tile is intentionally theme-independent and should not be recolored for dark mode. The artwork is original to Atlas Links and uses no third-party typeface, template, or graphic asset. Concept evaluation and small-size checks are recorded in [`docs/logo-concepts.md`](docs/logo-concepts.md).

## License and security

Atlas Links is available under the [Mozilla Public License 2.0](LICENSE.md). The Chrome Web Store build links back to this repository as the corresponding Source Code Form. Third-party dependencies remain subject to their own licenses. The MPL-2.0 does not grant rights to the Atlas Links name, service marks, or logos beyond its notice requirements.

Please report suspected vulnerabilities through the private process in [`SECURITY.md`](SECURITY.md), not through a public issue.
