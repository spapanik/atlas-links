# Atlas Links — Agent Guide

## Product goal

Build a polished Chrome extension for saving and finding web bookmarks. A saved bookmark has a URL, name, optional description, and zero or more tags. Users can find bookmarks by tag or with fuzzy search over names and descriptions. The extension works locally without an account; signing in with Google enables private backup and synchronization through Google Drive.

Call the product **Atlas Links** in user-facing copy unless the product name is deliberately changed.

## MVP scope

The first complete release must let a user:

1. Save the active tab from the extension popup.
2. Edit the suggested name, add a description, and add or remove tags before saving.
3. View, edit, open, and delete saved bookmarks.
4. Filter bookmarks by one or several tags.
5. Fuzzy-search bookmark names and descriptions from one search box.
6. Use all bookmark features offline without signing in.
7. Sign in with Google explicitly.
8. Sync bookmark data privately through the signed-in user's Google Drive.
9. Sign out without deleting the local bookmark collection.
10. See understandable sync state and recoverable sync errors.

Do not add social sharing, public collections, collaboration, a hosted backend, browser-history ingestion, or AI-generated metadata unless requested.

## Technical baseline

- Chrome Extension Manifest V3.
- TypeScript with strict type checking.
- React for popup and full-page library UI.
- Vite for development and production builds.
- `chrome.storage.local` is the local source used by the UI. Wrap it behind a repository interface so storage can be tested and replaced.
- Use `chrome.identity` for Google OAuth. Never collect Google passwords or implement a custom password flow.
- Use the Google Drive API `appDataFolder` scope for a private application-data file. Do not request access to all Drive files.
- Use a lightweight, well-maintained fuzzy-search library such as Fuse.js. Search name and description independently with weighted matches; name matches rank above description matches.
- Keep dependencies small. Do not introduce a server unless a requirement cannot be met securely without one and the user approves the architecture change.

If the repository already contains a different established stack when implementing a task, follow the repository unless changing it is part of the request.

## User surfaces

### Popup

The popup is optimized for capturing the current tab:

- Pre-fill URL and title from the active tab.
- Allow editing the name and URL.
- Provide an optional multiline description.
- Provide tag entry with autocomplete from existing tags.
- Save with keyboard submission where it does not interfere with tag entry.
- Clearly indicate when the URL is already saved and offer to update the existing bookmark rather than silently duplicating it.
- Include a shortcut to open the full library.

### Library page

The library is a dedicated extension page, not a cramped popup view. It includes:

- A single search field that fuzzy-searches name and description.
- Tag filters with visible selected state and removable filter chips.
- A deterministic sort control, initially supporting recently updated, recently created, and name.
- Bookmark cards or rows showing name, hostname, description excerpt, and tags.
- Actions to open, edit, and delete a bookmark.
- Empty, no-results, loading, and error states.
- Google sign-in and sync controls with last successful sync time.

Tag filtering and text search combine with AND semantics: a result must satisfy the selected tag filters and the text query. When multiple tags are selected, require all selected tags by default.

## Data model

Use a versioned, serializable model. Dates are ISO 8601 UTC strings.

```ts
type Bookmark = {
  id: string; // UUID generated once and stable across devices
  url: string;
  name: string;
  description: string;
  tags: string[]; // normalized display values, unique per bookmark
  createdAt: string;
  updatedAt: string;
  deletedAt?: string; // tombstone retained long enough to sync deletions
};

type BookmarkStore = {
  schemaVersion: 1;
  revision: number;
  deviceId: string;
  updatedAt: string;
  bookmarks: Bookmark[];
};
```

Requirements:

- Normalize URLs before duplicate comparison: trim whitespace, lowercase the hostname, remove the fragment, and remove only a trailing root slash when safe. Preserve meaningful paths and query parameters.
- Validate URLs and initially allow only `http:` and `https:` bookmarks.
- Trim names and descriptions. A name and URL are required.
- Normalize tags by trimming whitespace and comparing case-insensitively. Preserve one stable display spelling. Reject empty tags and duplicates.
- Do not use array positions as identifiers.
- Keep parsing and migration functions that validate untrusted local and remote data before use.
- Never render bookmark metadata as raw HTML.

## Search behavior

- An empty query returns all bookmarks allowed by active tag filters.
- Fuzzy matching covers `name` and `description`; weight name more strongly.
- Tag text is filtered through explicit tag selection, not silently mixed into fuzzy text scoring for the MVP.
- Search is case-insensitive and diacritic-tolerant where supported by the chosen library.
- Debounce only if needed; local collections should feel instantaneous.
- Include focused tests for typos, partial names, description-only matches, empty descriptions, casing, and combined tag filters.

## Google authentication and Drive sync

Google sign-in is optional and initiated by a clear user action. Configure the extension OAuth client ID through the manifest/build configuration and document the setup without committing credentials that should remain private.

Request the narrow scope:

```text
https://www.googleapis.com/auth/drive.appdata
```

Store one versioned JSON document in `appDataFolder`, using a stable filename such as `atlas-links.v1.json`. Locate it through Drive file metadata rather than assuming a normal filesystem path. Persist the remote Drive file ID locally after discovery or creation.

Sync must be local-first:

1. Every local mutation is committed to `chrome.storage.local` immediately.
2. A mutation marks sync state dirty and schedules a background sync.
3. On sync, download current remote data when present, validate and migrate it, merge it with local data, then upload the merged document.
4. Save the merged result locally only after validation.
5. Retry transient failures with bounded exponential backoff and expose a manual retry action.

For the MVP, merge per bookmark by stable `id` using the record with the later `updatedAt`. A tombstone participates in the same comparison so deletions propagate. When timestamps are equal but records differ, resolve deterministically (for example, by canonical JSON lexical ordering) and log a diagnostic without exposing bookmark contents. Retain tombstones for at least 30 days and only compact them when there is a safe documented rule.

Use optimistic concurrency where supported by Drive metadata/ETags. If an upload conflict is detected, re-download, merge, and retry a bounded number of times. Never silently replace a newer remote document with a stale local snapshot.

Authentication requirements:

- Do not request an interactive token during extension startup.
- Cache no access token outside Chrome's identity facilities.
- On sign-out, revoke/remove cached authentication when appropriate and clear account-specific sync metadata, but retain local bookmarks.
- Distinguish offline, signed-out, authorization, quota, corrupt-remote-data, and transient-service errors in internal state and user messaging.
- Never log OAuth tokens, full Drive documents, bookmark descriptions, or complete URLs.

## Permissions and privacy

Ask for the minimum permissions required. Expected permissions are:

- `storage` for local persistence.
- `activeTab` for capturing the current page after user interaction.
- `identity` for optional Google sign-in.

Avoid broad host permissions. Add Google API host access only if required by the chosen request mechanism and keep it restricted to the exact API origin. Do not request `tabs`, browsing history, or access to every website unless a concrete feature requires it and the permission rationale is documented.

Include a privacy explanation in the UI or project documentation:

- Bookmarks are stored locally by default.
- Google sign-in is optional.
- When enabled, bookmark data is stored in the user's private Google Drive application-data area.
- No analytics or telemetry is collected unless explicitly added and disclosed.

## Architecture boundaries

Keep browser APIs and external services behind small adapters:

- `BookmarkRepository`: read/write and subscribe to the local store.
- `IdentityService`: sign in, obtain authorization, and sign out.
- `DriveStore`: discover, download, and conditionally upload the remote document.
- `SyncEngine`: validation, migration, merge, retries, and sync-state transitions.
- Search utilities: pure indexing/query functions.

UI components must not call the Drive API directly. The service worker coordinates background sync and message handling. Business rules, normalization, migration, and merging should be pure functions wherever possible.

Use explicit sync states such as `local-only`, `signed-out`, `idle`, `dirty`, `syncing`, and `error`. Avoid booleans that permit contradictory states.

## Accessibility and interaction quality

- All actions must be keyboard accessible.
- Inputs need visible labels; icon-only buttons need accessible names.
- Preserve visible focus styles and logical focus order.
- Do not communicate tag selection or sync errors by color alone.
- Confirm destructive deletion or provide a reliable undo action.
- Respect reduced-motion preferences.
- Keep popup layout usable at typical Chrome extension popup dimensions.

## Security rules

- Treat local storage, Drive JSON, tab titles, URLs, descriptions, and tags as untrusted input.
- Validate data at every storage/network boundary.
- Use React text rendering or equivalent escaping; do not use `dangerouslySetInnerHTML` for bookmark data.
- Keep the Content Security Policy compatible with Manifest V3 and do not load executable code from a CDN.
- Do not commit OAuth client secrets. A Chrome extension OAuth client ID is an identifier, not a secret, but it should still be supplied through documented configuration.
- Do not add remote code, `eval`, or string-built scripts.

## Testing and verification

Add automated tests alongside implementation. At minimum cover:

- URL and tag normalization.
- Bookmark validation and schema migration.
- Create, update, duplicate detection, deletion, and tombstones.
- Fuzzy search ranking across name and description.
- Single-tag and multi-tag filtering combined with search.
- Merge behavior for newer local, newer remote, deletion conflicts, equal timestamps, and malformed remote data.
- Sync state transitions and retry limits with mocked identity/Drive adapters.

Before considering development complete, run the formatter, consolidated lint checks, test suite with coverage, and production build in that order. `pnpm format` writes formatting changes; `pnpm lint` runs ESLint, TypeScript validation, and the formatting check; `pnpm test` is the fast local test command; `pnpm test:coverage` is the development-handoff test gate; and `pnpm build` bundles code that has already passed lint, so it does not repeat TypeScript validation. A ticket moves from `TASKS.md` to `DONE.md` when its implementation and all non-manual checks are complete. Manual browser, account, device, visual, and interaction checks belong under that ticket's `### QA verification` heading in `DONE.md`; they are QA's responsibility and do not block the development handoff. Agents do not claim those QA checks passed unless explicitly asked to perform them.

Development-handoff commands: `pnpm format`, `pnpm lint`, `pnpm test:coverage`, and `pnpm build`.

## Definition of done for the MVP release

This is the release-level definition of done and includes the QA verification recorded in `DONE.md`; it is intentionally stricter than the development-complete threshold for moving an individual ticket there.

The MVP is complete only when:

- The unpacked extension installs without manifest or console errors.
- Bookmark CRUD works after closing and reopening Chrome.
- Name and description fuzzy search behave as specified.
- Tag filtering combines correctly with fuzzy search.
- The extension remains fully usable while signed out or offline.
- A user can sign in, sync to Drive, make changes on a second Chrome profile/device, and receive a deterministic merged collection.
- Deletions synchronize and do not reappear after a normal two-device sync.
- OAuth denial, expired authorization, offline mode, corrupted remote data, and Drive API failures have safe behavior and understandable messages.
- No token or private bookmark data appears in logs.
- Automated checks and a production build pass.

## Implementation approach

Prefer small, reviewable vertical slices:

1. Scaffold Manifest V3, TypeScript, React/Vite, tests, and extension pages.
2. Implement the versioned model, repository, validation, and bookmark CRUD.
3. Build capture popup and full library UI.
4. Add fuzzy search and tag filtering with tests.
5. Add optional Google identity and the Drive adapter.
6. Add deterministic sync, tombstones, conflict handling, retry UX, and tests.
7. Complete accessibility, privacy documentation, manual extension testing, and release packaging.

When requirements are ambiguous, preserve local user data, minimize permissions, and favor explicit user control. Record meaningful architecture decisions in project documentation rather than hiding them in implementation details.
