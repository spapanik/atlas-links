# Atlas Links — Product Tasks

> @DONE.md contains development-complete tickets. Move a ticket there when its implementation and all automated/non-manual checks pass; manual verification moves with it under `### QA verification` and is completed by QA rather than blocking the handoff.

## Delivery notes

- Manifest shortcut suggestions are limited and can conflict with Chrome, the operating system, or another extension. All three commands must remain discoverable and user-reassignable even when Chrome does not register a suggested key.
- Keep a shared search-results implementation or shared behavioral primitives so the library, new-tab search, and side panel cannot develop different ranking/filter rules.
- Update the README with the final default shortcuts, reassignment instructions, minimum supported Chrome version, side-panel fallback, and theme behavior.
- Do not add a Chrome New Tab override, omnibox keyword, content script, or global shortcut in these tickets. Those are separate product decisions with different permissions and interaction costs.

AL-114 is the remaining active ticket from the July 2026 publication audit and blocks Chrome Web Store submission. Completed release-readiness and packaging fixes are recorded in `DONE.md`.

## AL-118 — Add portable Google authentication and cross-browser release targets

### Problem

Atlas Links currently obtains Google access tokens exclusively through `chrome.identity.getAuthToken`. That is the preferred path in Google Chrome, but it depends on Chrome's privileged Google-account integration. Brave sends a custom-scheme OAuth redirect for the same call, which Google rejects with `400 invalid_request`; other Chromium-derived browsers cannot be assumed to implement Chrome's Google-specific token broker consistently. As a result, local bookmark features are portable but optional Drive synchronization is not. Atlas Links needs an explicit browser-support contract and a standards-based authentication fallback before claiming support for Brave, Vivaldi, Chromium, Edge, or Thorium. Firefox-family support also needs a deliberate packaging and compatibility layer rather than being inferred from Chromium behavior.

### Scope

- Define and document a tested browser-support matrix covering current stable Google Chrome, Brave, Vivaldi, Chromium, Microsoft Edge, and Thorium. Treat Firefox-family packaging as the next target in the same architecture, but do not claim Firefox support until its package passes the acceptance criteria below.
- Keep `chrome.identity.getAuthToken` as the Google Chrome adapter. Add a portable identity adapter based on the WebExtensions identity flow (`identity.launchWebAuthFlow` and the browser-provided HTTPS redirect URL) for browsers whose token broker is absent or incompatible. Select adapters through a single capability/browser boundary; do not scatter user-agent checks through UI or sync code.
- Configure a separate OAuth client suitable for the portable flow and document every redirect URI that must be registered for development and published extension identities. OAuth client IDs and manifest public keys may be supplied as public build configuration, but never embed a client secret, authorization code, access token, refresh token, signing private key, or account data in source, build artifacts, logs, or committed environment files.
- Use an OAuth flow supported by Google's current policies for public browser extensions. Apply PKCE and state/nonce validation wherever the selected response flow supports them. If Google cannot provide durable authorization to a secretless extension without a backend, document the limitation and require explicit product approval before adding any server; do not silently introduce hosted token exchange or storage.
- Keep acquired access tokens in memory only, request only `https://www.googleapis.com/auth/drive.appdata`, and preserve the current local-first behavior. Reauthorization, cancellation, denial, browser incompatibility, and popup closure must map into the existing typed sync/auth states without deleting local bookmarks.
- Make sign-out revoke the active grant where supported, clear adapter-managed transient authorization state, and retain local bookmarks. Do not let one browser's sign-out path clear unrelated browser/account data.
- Keep `IdentityService`, `DriveStore`, and `SyncEngine` boundaries intact: UI and Drive code must not construct authorization URLs or branch on browser brands directly. Add the minimum compatibility wrapper needed for Promise/callback and `chrome`/`browser` namespace differences.
- Add browser-specific build and manifest targets only where required. Preserve Manifest V3, the current Chrome Web Store package, minimal permissions, CSP without remote executable code, and deterministic extension identities. Document store-specific IDs, redirect URLs, OAuth clients, packaging commands, and manual installation steps without committing credentials or private signing material.
- Update user-facing compatibility and privacy copy. Explain that Google sign-in behavior can differ by browser, Drive sync remains optional, and no developer backend stores tokens or bookmark data. Do not describe portable-flow tokens as managed by Chrome identity facilities when they are not.
- Add repository protections and a release audit for public development: ignore local environment variants, bookmark exports, private keys, certificates, and encrypted signing-key files; scan tracked files and Git history for secrets and private bookmark data before each public release. Public OAuth client IDs and public extension keys must be clearly distinguished from secrets in documentation.

### Acceptance criteria

- Saving, editing, searching, filtering, opening, deleting, importing, and exporting bookmarks work offline in every browser listed as supported, without Google sign-in.
- Google Chrome continues to authenticate through `getAuthToken`; each supported non-Google Chromium browser authenticates through the portable adapter without the custom-URI `invalid_request` failure and can complete Drive upload, download, manual sync, authorization recovery, and sign-out.
- The identity adapter is selected centrally and has deterministic fallback behavior. Unsupported browsers receive an understandable message while all local bookmark features remain available.
- Every authorization request uses only `drive.appdata`, validates correlation values, contains no client secret, and leaves no access token, authorization code, bookmark document, description, or complete URL in persistent logs or extension storage.
- Published packages contain only their intended public OAuth configuration and extension identity. No `.env` file, private/signing key, token, test-account data, or real Atlas Links export is tracked or included in an archive.
- Firefox-family support is claimed only after a Firefox-targeted package installs without manifest errors and passes the same local-feature and Drive-sync criteria. Until then, documentation labels it as planned rather than supported.
- Privacy policy, store disclosures, README, and in-product copy accurately describe both the Chrome-managed and portable authentication paths, their token handling, supported browsers, and any reauthorization limitation.

### Tests and verification

- Unit-test adapter selection, Chrome token acquisition, portable authorization URL construction, exact redirect URI, state/nonce and PKCE verification where applicable, cancellation, denial, malformed callbacks, token expiry, reauthorization, revocation, and cleanup without persisting tokens.
- Test that identity failures preserve the local store and map to stable typed states, and that concurrent sign-in/sync actions remain single-flight.
- Add manifest/package tests for each target: required identity and Google API permissions only, correct public client configuration, no client secret or private key, no remote code, and no development-only identity in release archives.
- Run a secret scan over tracked files and all reachable Git history, then run `pnpm format`, `pnpm lint`, `pnpm test:coverage`, and every production browser build in that order.

### QA verification

- On clean profiles for current stable Chrome, Brave, Vivaldi, Chromium, Edge, and Thorium, install the appropriate production package and exercise local CRUD/search/filter/import/export while signed out and offline.
- In each browser, sign in from an explicit user action, deny once, approve once, upload a disposable collection, restart the browser, sync again, revoke/sign out, and confirm local bookmarks remain. Record browser and engine versions with the result.
- Inspect the authorization request and extension storage/logs for the disposable accounts. Confirm the registered redirect URI is exact, only `drive.appdata` is requested, no secret or private bookmark content is exposed, and Brave does not produce the custom-URI error.
- When the Firefox target is ready, repeat the same checks on current stable Firefox before changing its documented status from planned to supported.

## AL-114 — Publish the privacy policy and complete the Web Store and OAuth disclosures

### Problem

The Chrome Web Store requires a linked privacy policy for extensions that handle user data, and Atlas Links handles active-tab URLs and titles, user-entered bookmark metadata, and Google authorization — local-only processing still counts as user-data handling under Chrome's policy. Optional sync uses the non-sensitive `drive.appdata` scope, but the extension must still disclose its Google API use, comply with Limited Use, and present an OAuth app identity that users can trust. The repository now contains the dedicated policy, its Pages deployment workflow, and links from the README and extension; the first public deployment, durable dashboard declarations, OAuth configuration review, and complete listing materials remain. Claims spread across the extension, listing, privacy policy, OAuth consent screen, and dashboard must describe the same behavior.

### Scope

- Add a plain-language policy document in the repository and publish it over HTTPS at a stable URL that requires no sign-in. A GitHub Pages URL is acceptable; buying or controlling a custom domain is not a requirement for this ticket. Record the public URL in the repository so it is not known only to the dashboard.
- Describe every relevant data path accurately:
  - opening the popup reads the active tab's URL and title after the user's action;
  - bookmark URLs, names, descriptions, tags, timestamps, stable IDs, revision/device metadata, and deletion tombstones are stored in `chrome.storage.local`;
  - optional Google sign-in uses `chrome.identity`, and optional sync stores one versioned JSON document in the signed-in user's private Drive `appDataFolder`;
  - the extension does not operate a developer backend, retain OAuth tokens outside Chrome identity facilities, sell data, use data for advertising, allow developer personnel to read bookmark data, or collect analytics or telemetry;
  - browser-bookmark and Atlas Links imports are parsed locally, and exports are written only to the destination the user chooses;
  - deleting a bookmark creates a tombstone so deletion can propagate, signing out retains local bookmarks while attempting to revoke Google access, and signing out does not itself delete the existing Drive backup.
- Explain retention and user control without promising controls that do not exist. Cover individual bookmark deletion, sign-out, revoking Atlas Links in the Google Account, clearing extension storage/uninstalling, and the fact that synced deletion markers may remain in the Drive document for conflict resolution. State explicitly that uninstalling clears the extension's local storage but does not itself delete the existing Drive app-data file.
- Include a working publisher privacy/support contact and the required affirmative Limited Use statement: “The use of information received from Google APIs will adhere to the Chrome Web Store User Data Policy, including the Limited Use requirements.”
- Link the hosted policy from the README, the extension's library/footer, and the designated privacy-policy field in the Chrome Web Store dashboard.
- Add a repository-owned dashboard disclosure draft containing:
  - a narrow single-purpose statement;
  - the data-category selections and the reasoning for each selection, including active-tab URL/title, user-authored bookmark metadata, and Google authorization;
  - a justification for `storage`, `activeTab`, `identity`, `alarms`, and `sidePanel`, plus both Google host permissions;
  - the declaration that the package executes no remote code;
  - the Limited Use certifications and a cross-check against the published policy.
- Confirm that the Google Auth Platform project declares only the non-sensitive `drive.appdata` scope, the Chrome Extension OAuth client is bound to the Web Store item ID, the app audience permits the intended users, and the consent screen shows the same product name, privacy URL, and support contact. If a fresh non-test user sees an unverified-app warning, record the exact verification state and complete the applicable basic OAuth app/branding verification before public release; do not describe `drive.appdata` as a sensitive or restricted scope.
- Prepare the remaining store-facing materials needed to make the privacy disclosures prominent before installation: accurate detailed description, category/language, reviewer test instructions, at least one full-bleed 1280×800 or 640×400 screenshot showing actual functionality, and the required 440×280 small promotional tile. Prefer screenshots covering the popup, library, search, and optional sync state; do not show real private bookmarks or account information.
- Every claim must match observable product behavior. Review and update the policy and dashboard draft whenever a release changes permissions, network destinations, data handling, or retention.

### Acceptance criteria

- The repository policy and hosted copy contain the same substantive text, the public HTTPS URL works in a signed-out browser, and the policy is reachable from the README, extension UI, and dashboard privacy field.
- The policy identifies every stored or transmitted data type, destination, purpose, retention/control behavior, and third party; it includes the Limited Use statement and a working contact method.
- The dashboard privacy tab is complete and consistent with the repository draft: policy URL, single purpose, permission and host justifications, remote-code declaration, data-category selections, and Limited Use certifications.
- A production/trusted-testing build signs in with a fresh intended-user account without an unverified-app warning, or applicable OAuth verification has been submitted and the remaining external status is recorded explicitly rather than calling the ticket complete.
- Required listing copy and graphic assets exist, contain no private data, and prominently disclose that bookmarks are local by default and are sent to the user's private Drive app-data area only after optional Google sign-in.
- No statement in the policy, dashboard, listing, OAuth consent screen, README, or extension UI contradicts observable behavior.

### Tests and verification

- Review the policy and draft disclosures against Chrome's user-data FAQ (https://developer.chrome.com/docs/webstore/program-policies/user-data-faq), dashboard privacy-field documentation (https://developer.chrome.com/docs/webstore/cws-dashboard-privacy), program policies (https://developer.chrome.com/docs/webstore/program-policies/policies), and Drive scope classification (https://developers.google.com/workspace/drive/api/guides/api-specific-auth).
- Run `pnpm format`, `pnpm lint`, `pnpm test:coverage`, and `pnpm build`, in that order.

### QA verification

- Open the hosted policy in a private/signed-out browser window and check its links, contact method, mobile readability, and substantive parity with the repository copy.
- Walk through first save, import, export, Google sign-in, sync, bookmark deletion, and sign-out while comparing visible copy and network/storage behavior against the policy. Repeat sign-in with an intended-user account that is not merely an OAuth test user.
- Inspect the completed dashboard fields and final listing screenshots together; do not infer dashboard completion from repository drafts alone.
