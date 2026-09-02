# Atlas Links — Product Tasks

> @DONE.md contains development-complete tickets. Move a ticket there when its implementation and all automated/non-manual checks pass; manual verification moves with it under `### QA verification` and is completed by QA rather than blocking the handoff.

## Delivery notes

- Manifest shortcut suggestions are limited and can conflict with Chrome, the operating system, or another extension. All three commands must remain discoverable and user-reassignable even when Chrome does not register a suggested key.
- Keep a shared search-results implementation or shared behavioral primitives so the library, new-tab search, and side panel cannot develop different ranking/filter rules.
- Update the README with the final default shortcuts, reassignment instructions, minimum supported Chrome version, side-panel fallback, and theme behavior.
- Do not add a Chrome New Tab override, omnibox keyword, content script, or global shortcut in these tickets. Those are separate product decisions with different permissions and interaction costs.

## AL-118 — Back optional sync with Supabase instead of Google Drive

### Problem

Optional sync currently depends on Google end to end: `chrome.identity.getAuthToken` supplies the access token (with a portable WebExtensions OAuth fallback planned for non-Google Chromium browsers), and the Google Drive `appDataFolder` holds the `atlas-links.v1.json` document. Google sign-in is also the source of the remaining release risk: Chrome-only token brokering, per-browser redirect-URI registration, OAuth consent and verification state, and Drive v3 API quirks all exist only to support that path.

Product decision, explicitly approving the "no server without approval" architecture boundary in the agent guide: replace Google sign-in and Drive storage with Supabase. Atlas Links will use Supabase Auth with email one-time codes and a private per-user Postgres row holding the same versioned bookmark document. This removes every Google and `chrome.identity` dependency from the sync path, makes sync behavior identical across Chromium-derived browsers and — once separately packaged — Firefox, and preserves the local-first product: bookmarks live in `chrome.storage.local`, every local feature works fully offline and signed out, and sync remains an explicit, optional user action. The Google sync path is removed, not kept alongside the new one. Atlas Links is pre-release (0.1.0, not yet published), so no Drive-to-Supabase data migration is required; local bookmarks are never touched by this change, and old test-account Drive files can be deleted manually.

### Scope

- Add `@supabase/supabase-js` as the only new runtime dependency, isolated behind the existing adapter boundaries. Replace `ChromeIdentityService` with a Supabase auth adapter and `GoogleDriveStore` with a Supabase remote-store adapter; the interfaces may be renamed (for example to `AuthService` and `RemoteStore`), but UI components and `SyncEngine` must continue to depend on interfaces, never on the Supabase client or raw SQL. No UI component may call Supabase directly.
- Authentication uses Supabase Auth email one-time password (OTP) codes: the user requests a code by email from an explicit sign-in action and enters it in the extension. This deliberately avoids browser redirect registration, `chrome.identity`, and Google OAuth entirely. Keep the existing explicit sync states (`signed-out`, `idle`, `dirty`, `syncing`, typed `error`) and the rule that no session or token request happens at startup or while signed out. Persist the Supabase session through a `chrome.storage.local` storage adapter so sign-in survives service-worker restarts and extension updates, preserving the AL-115 guarantee.
- Remote storage is one private row per user, for example a `sync_documents` table with `user_id uuid primary key references auth.users`, `document jsonb not null`, `revision bigint not null`, and `updated_at timestamptz not null`, holding the existing `BookmarkStore` JSON document. Commit the table and Row Level Security SQL under a documented location (such as `supabase/`) with setup instructions. RLS policies must allow a user to select and upsert only the row where `user_id = auth.uid()`; unauthenticated and cross-user access must be denied.
- Use real optimistic concurrency: the conditional upload updates the row only when its `revision` matches the value that was downloaded (a PostgREST filter on the update), and zero updated rows is a conflict — re-download, re-merge with the existing `mergeStores`, and retry a bounded number of times. Never silently overwrite a newer remote document. A first sync for a signed-in user with no row creates it via upsert.
- Keep all existing sync semantics unchanged: local-first commits, the dirty flag, alarm scheduling with the AL-111 minimum delay, single-flight protection, bounded exponential backoff with manual retry, typed failure codes, tombstone retention and compaction, and the deterministic equal-timestamp merge from AL-108, AL-110, and AL-116. The corrupt-remote recovery flow remains: the local store is left untouched and the remote row is replaced only after an explicitly confirmed **Replace corrupt backup with local data** action.
- Re-map failures from Supabase/PostgREST responses without matching English message text: an expired or invalid session after a refresh attempt is `authorization` with a **Sign in again** action; a failure indicating no usable connection is `offline`; `429` with a usable retry hint and retryable `5xx` responses are `rate-limit`/`transient-service`; permanent plan or storage exhaustion is `quota`; a document that fails validation or migration, or exceeds the existing size ceiling, is `corrupt-remote` and leaves the local store byte-for-byte unchanged.
- Sign out ends the Supabase session best-effort, always clears the local session, sync metadata, retry state, and alarms, and retains local bookmarks. There is no OAuth grant to revoke and no Google endpoint may be called.
- Manifest and build: remove the `identity` permission, the `oauth2` manifest section, both Google host permissions, the Google OAuth client ID build configuration, and its placeholder/production-verification logic. Add a host permission restricted to the exact Supabase project origin (`https://<project>.supabase.co/*`). Supply the Supabase project URL and anon key as public `VITE_` build configuration — both are public client identifiers, as the OAuth client ID was — and make the production build fail clearly when either is missing or placeholder. The service-role key is a secret: it must never appear in source, build configuration, artifacts, logs, or committed environment files; document it as such and extend the release secret scan to catch it and JWT-shaped tokens.
- Remove the Google Drive and identity adapters, their tests, and their configuration wholesale rather than leaving dead code. Update the privacy policy (repository copy and hosted copy), README, store-listing disclosure draft, and all in-product copy: bookmarks are stored locally by default and, only after optional email sign-in, in Atlas Links' Supabase backend in a row private to that account; disclose Supabase as the hosting subprocessor; remove Google API, Drive `appDataFolder`, OAuth consent, and Limited Use statement language. Keep the no-analytics/no-telemetry promise and state data-access behavior accurately (RLS prevents cross-user and developer reads).
- The auth and network layer must use no Chrome-exclusive API and no Google endpoint, so the path remains portable to Firefox-family builds. Shipping a Firefox package is outside this ticket; do not claim Firefox support.
- Continue never to log access tokens, refresh tokens, full documents, bookmark descriptions, or complete URLs.

### Acceptance criteria

- While signed out or offline, saving, editing, searching, filtering, opening, deleting, importing, and exporting bookmarks work with no network request and no Supabase session, exactly as today.
- A user can request an email code, sign in from an explicit action, restart the browser and service worker, and remain signed in. Sign out clears the session and all sync metadata while retaining every local bookmark, and no background action mints a new session afterward.
- A first sync creates the user's row; later syncs download, merge, and conditionally upload. Two profiles with concurrent edits converge deterministically through `mergeStores`, deletions propagate via tombstones, and a stale upload is rejected and re-merged rather than overwriting newer remote data.
- Row Level Security denies unauthenticated requests and every request from a user other than the row owner, verified with two distinct accounts.
- Expired sessions surface the typed `authorization` state with a working re-sign-in flow; offline, rate-limit, and transient failures use the existing bounded retry and manual recovery; corrupt or oversized remote data leaves local data untouched and replaces the remote row only after explicit confirmation.
- The built manifest contains no `identity` permission, no `oauth2` section, and no Google host permission; host access is granted only to the exact Supabase project origin, and the CSP still permits no remote executable code.
- No service-role key, JWT, session token, or real bookmark data appears in source, build artifacts, tracked environment files, reachable Git history, or runtime logs. The public anon key and project URL are documented as non-secret public config, and the production build fails without them.
- The privacy policy (hosted and repository copies), README, store disclosure draft, and extension UI describe Supabase storage and email sign-in accurately and contain no remaining Google Drive or OAuth claim that contradicts observable behavior.
- All Google identity/Drive adapters, OAuth configuration, and related tests are removed; `SyncEngine` merge, tombstone, retry, and concurrency behavior is unchanged except for the new transport.

### Tests and verification

- Unit-test the Supabase auth adapter with a mocked client: code request, code verification, session restore after a simulated worker restart, sign-out success and best-effort failure, and the absence of any session call at startup or while signed out.
- Unit-test the remote-store adapter and `SyncEngine` against a fake Supabase/PostgREST layer: first-sync row creation, download/merge/upload, revision-conflict rejection with bounded re-merge and retry, unauthenticated `401` mapping after a failed token refresh, offline network failure, `429` and retryable `5xx` classification with the existing backoff sequence, corrupt or oversized document handling with no local write, explicit corrupt-recovery replacement, and single-flight overlap.
- Verify the RLS policies by SQL test or a documented two-account check: unauthenticated read/write denied, cross-user read/write denied, owner select and upsert allowed.
- Update manifest and package tests: no `identity` permission, no `oauth2` section, no Google hosts, the exact Supabase origin present, the production build rejecting a missing or placeholder Supabase URL/anon key, and no placeholder config shipped.
- Extend the secret scan over tracked files and reachable Git history to cover the Supabase service-role key and JWT-shaped secrets; confirm local environment files and bookmark exports remain ignored.
- Run `pnpm format`, `pnpm lint`, `pnpm test:coverage`, and the production build, in that order.

### QA verification

- On two clean browser profiles, at least one in a non-Google Chromium browser, sign in with disposable email accounts, upload a disposable collection, make disjoint and conflicting edits on each, and confirm deterministic merge, deletion propagation, and accurate last-sync times.
- Verify that sign-out retains local bookmarks and produces no further network traffic; verify an expired or revoked session shows the re-sign-in flow, and that taking the browser offline mid-sync produces the retry state and recovers when connectivity returns.
- Inspect network traffic and extension storage: only the Supabase project origin is contacted, and no token, full document, description, or complete URL appears in logs beyond the supabase-js session.
- Open the updated hosted privacy policy in a signed-out browser window and confirm its parity with the repository copy and with observable behavior.

## AL-119 — Enforce per-user storage limits in Supabase

### Problem

With Supabase, storage and bandwidth are billed to Atlas Links, not to the user. The extension validates bookmark fields and caps the remote document at 5 MB before upload, but that check runs in extension code on the user's machine and can be bypassed by a modified client or a direct call to the PostgREST API with the user's own anon key. Nothing currently stops a signed-in user from writing a row that is far larger than the product intends — for example a multi-megabyte base64-encoded image stuffed into a bookmark's `description`, an extreme number of bookmarks or tags, or pathologically long field values. Because each user owns exactly one sync row, abuse is cheap for the user and paid for by the project. Limits must be enforced at the database boundary, where they cannot be bypassed, and the client must surface a clear, non-retryable error when the server rejects a write.

### Scope

- Enforce all limits in Postgres, in the same committed SQL as the AL-118 table and RLS policies (for example a `BEFORE INSERT OR UPDATE` trigger plus `CHECK` constraints on `sync_documents`), so a direct API call with a valid user session is bound by exactly the same rules as the extension. RLS controls *who* may write; this ticket controls *what* may be written.
- Define and document concrete product limits. At minimum:
  - a maximum total serialized document size per user (smaller than the existing 5 MB transport ceiling — the server cap is the storage budget, and the client ceiling must be lowered or aligned so legitimate syncs never approach it);
  - a maximum number of active bookmarks and a maximum number of retained tombstones per document;
  - a maximum length for bookmark `name`, `description`, and `url`, and a maximum number and length of tags per bookmark;
  - structural validity: the `document` jsonb must have the shape of a versioned `BookmarkStore` (`schemaVersion`, bookmarks array of objects with the expected string/array field types), so arbitrary JSON cannot be stored under the user's row.
- A rejected write must fail the transaction with a distinguishable Postgres error (for example a dedicated `SQLSTATE`/`raise exception` message per limit class). It must never partially update the row or corrupt the user's existing synced document.
- Map server-side limit rejections in the Supabase remote-store adapter to the typed sync failure model without matching free-text messages: limit violations are non-retryable (a bounded document the server refuses is not a transient failure). Present an understandable message telling the user their collection exceeds Atlas Links' storage limits, alongside the existing **Replace corrupt backup with local data** distinction — this is not corrupt-remote and must not offer destructive recovery.
- Mirror the same limits in the client validation path so the extension rejects or warns before attempting an upload that the server would refuse, and keep the two limit definitions consistent from one documented source of truth (the database SQL is authoritative; the client constants must match it, with a test asserting they agree).
- Confirm the limits comfortably exceed expected legitimate use (thousands of ordinary text bookmarks) and document them in the README/privacy copy as part of the free, account-based sync offering. Do not add paid tiers, per-plan quotas, or user-facing quota metering in this ticket; the `quota` failure code remains for upstream Supabase plan/storage exhaustion.
- Note, but do not build in this ticket, the adjacent abuse surface: Supabase Auth email OTP sending has its own rate limits on the project's SMTP/email budget. Record the project's configured auth rate limits in the Supabase setup documentation so a user cannot drain the email budget; no extension code change is required.

### Acceptance criteria

- A direct PostgREST write (bypassing the extension entirely) using a valid logged-in anon session is rejected by the database when the document exceeds any defined size, count, or length limit, or has an invalid structure; the rejection leaves any previously stored row unchanged.
- A document within every limit, including a large but legitimate text-only collection near the documented bookmark-count target, syncs successfully.
- The extension shows a clear, non-retryable "storage limits exceeded" message when the server rejects an upload, and does not schedule automatic retries or offer corrupt-backup recovery for that case.
- Client-side preflight limits match the database-enforced limits, and a test fails if either side drifts.
- The committed SQL contains the table, RLS policies, validation trigger/constraints, and documented limit values in one reviewed location, with setup instructions.
- Supabase Auth email rate-limit configuration is documented alongside the project setup steps.

### Tests and verification

- Integration-test the database policies against a Supabase test instance or equivalent Postgres environment: oversized total document, bookmark count over the cap, tombstone count over the cap, over-limit name/description/url/tag length and tag count, wrong field types and missing required fields are all rejected; a maximal valid document is accepted; a rejected update leaves the prior row intact.
- Unit-test the adapter's failure mapping with a fake PostgREST layer returning the server's limit-violation error, asserting the non-retryable typed state and that no retry alarm is scheduled.
- Add a consistency test asserting the client limit constants equal the values documented/derived from the SQL definitions.
- Run `pnpm format`, `pnpm lint`, `pnpm test:coverage`, and the production build, in that order.

### QA verification

- With a disposable account, attempt to sync a collection exceeding a documented limit (for example by temporarily lowering the cap in a test project) and confirm the user-facing message, that local bookmarks remain intact and fully usable, and that no retry loop or upload storm occurs.
- Confirm in the Supabase dashboard that rejected writes produced no row growth and no partial updates, and review the documented auth email rate limits against the project configuration.
