# Atlas Links — Completed Product Tasks

> @TASKS.md contains development work still in progress. Move tickets here once implementation and all automated/non-manual checks pass. Manual browser, account, device, visual, and interaction checks remain under each ticket's `### QA verification` heading for QA to execute; they do not block the development handoff. QA should use this file as the queue of newly completed behavior to verify.

These completed tickets extended Atlas Links' capture, search, branding, and library-management flows without changing its local-first storage or sync model.

## AL-101 — Add light, dark, and system theme preferences

### User story

As an Atlas Links user, I want to choose a light, dark, or system-controlled appearance so that the popup, library, and search surfaces remain comfortable in my current environment.

### Scope

- Add one persisted appearance preference with the values `system`, `light`, and `dark`.
- Default to `system` when the preference is absent, including for existing installations.
- Store the preference in `chrome.storage.local` separately from `BookmarkStore`; it is device UI configuration and must not be included in the Drive bookmark document.
- Add an accessible theme control to the library. A labelled select or three-option radio group is acceptable; the selected option must be understandable without color or icons.
- Apply the preference to every extension document: popup, library, new-tab search, and side-panel search.
- For `system`, follow `prefers-color-scheme` live while an extension page is open. Explicit `light` or `dark` selection must ignore later operating-system changes.
- Apply the resolved theme before React renders, or use equivalent early document styling, to avoid a noticeable light-theme flash when opening a dark surface.
- Refactor the current hard-coded colors into semantic CSS custom properties for page, elevated surface, text, muted text, borders, primary actions, tags, focus, success, warning, danger, modal backdrop, and shadows.
- Preserve the existing visual character and hierarchy in both themes. Dark mode is not a simple color inversion: cards, inputs, hover states, selected filters, disabled controls, sync states, and destructive actions all need intentional colors.
- Set `color-scheme` consistently so native form controls match the resolved theme.
- Keep visible focus styles and respect `prefers-reduced-motion`.

### Architecture notes

- Introduce a small typed appearance-preference adapter/hook rather than reading storage independently in each surface.
- Set a stable root attribute such as `data-theme="light|dark"`; components should consume semantic variables rather than branch on theme in JSX.
- Listen to both `chrome.storage.onChanged` and the system media query so open extension surfaces update without reload.
- If storage cannot be read, render with `system` and do not block bookmark actions.

### Acceptance criteria

- A fresh install follows the operating-system theme.
- Selecting light or dark updates the current surface immediately and persists after closing and reopening Chrome.
- A preference change in one open Atlas Links surface updates other open surfaces.
- Selecting system resumes live OS-theme tracking.
- Popup, library, new-tab search, side-panel search, forms, cards, tag filters, modals, empty/error states, and sync controls are legible in both resolved themes.
- Text, controls, focus indicators, and status messaging meet WCAG AA contrast targets.
- Theme storage never changes the bookmark-store revision and is never uploaded to Drive.

### Tests and verification

- Unit-test missing/valid/invalid stored preference parsing and resolved-theme behavior.
- Component-test preference selection, cross-storage updates, and system media-query changes.
- Run `pnpm format`, `pnpm lint`, `pnpm test:coverage`, and `pnpm build`, in that order.

### QA verification

- Check all surfaces in light, dark, and system modes, including switching the OS theme while each surface is open.

## AL-102 — Add a keyboard shortcut for Save/Update this link

### User story

As a keyboard-first user, I want one shortcut to open Atlas Links for the active tab so that saving a new page or updating an existing bookmark is as quick as using a browser bookmark.

### Scope

- Declare the Manifest V3 `_execute_action` command so a keyboard shortcut opens the existing action popup.
- Provide a sensible suggested shortcut for each supported desktop platform, avoiding common Chrome and operating-system shortcuts. Treat it as a suggestion: Chrome may leave it unassigned when another extension owns the combination.
- Reuse the popup's current URL normalization and duplicate detection. The same shortcut must show **Save this link** for a new normalized URL and **Update this link** for an existing one; it must never silently save or overwrite a bookmark.
- Preserve editable name, URL, description, and tags before submission.
- Ensure the first useful form control receives focus, and that keyboard submission works without interfering with tag entry.
- Add a discoverable “Keyboard shortcuts” affordance in the library that opens `chrome://extensions/shortcuts` using the appropriate Chrome API/navigation behavior. Show the currently registered key from `chrome.commands.getAll()` where practical, and explain when the command is unassigned.
- Keep `activeTab` as the permission model. Do not add the broad `tabs` permission or host access for ordinary websites.

### Acceptance criteria

- Invoking the assigned command on an `http:` or `https:` tab opens the existing capture popup with title and URL pre-filled.
- An already-saved normalized URL produces the update flow; a new URL produces the save flow.
- No bookmark mutation occurs until the user submits the form.
- Unsupported pages such as `chrome://` display a clear, non-destructive message and do not create invalid bookmarks.
- The shortcut can be viewed or reassigned from Chrome's extension-shortcut settings.
- Clicking the toolbar icon continues to behave exactly as before.

### Tests and verification

- Test the popup's new/existing/unsupported-page states independently of the Chrome tab API.
- Validate the built manifest.
- Run `pnpm format`, `pnpm lint`, `pnpm test:coverage`, and `pnpm build`, in that order.

### QA verification

- Exercise assigned, reassigned, and intentionally unassigned shortcut states.
- Confirm the shortcut grants only the temporary active-tab access needed for capture.

## AL-103 — Add a Search in new tab shortcut

### User story

As a user with many saved links, I want a shortcut that opens a search-first Atlas Links tab so that finding a bookmark is no harder than opening a normal bookmark.

### Scope

- Add a standard Manifest V3 command named `search-newtab` with a suggested keyboard shortcut and a clear description.
- Handle it in the service worker by opening an extension tab for a dedicated search-first route or page. This ticket does **not** replace Chrome's New Tab page; it opens a new tab containing Atlas Links search.
- Reuse the existing pure `searchBookmarks` behavior and repository subscription. Search must remain fuzzy over name and description, with name weighted above description.
- Reuse multi-tag filtering with AND semantics: a result must match the text query and every selected tag.
- Focus and select the search field on open so the user can type immediately.
- Optimize the initial view for retrieval: keep search, selected filter chips, tag selection, result count, and bookmark results prominent. Secondary library management and sync controls may link to `/library` rather than occupying the search header.
- Support deterministic keyboard result navigation: arrow keys move through results, `Enter` opens the active bookmark, and `Escape` clears the query or active selection. Do not break normal tab navigation or assistive-technology interaction.
- Open result URLs in the current Atlas Links search tab by default, with a documented modifier or explicit action for opening in another tab. Use safe extension APIs/links and never render metadata as HTML.
- Use the stored theme preference from AL-101.

### Acceptance criteria

- The shortcut opens exactly one new Atlas Links search tab per invocation and immediately focuses search.
- Empty search shows all non-deleted bookmarks allowed by active tag filters.
- Typos, partial names, and description-only terms return the same ranking as the library.
- Selecting multiple tags requires every selected tag, and tag filters combine with text using AND semantics.
- Search, filtering, and result opening work fully offline and while signed out.
- Empty collection, no-results, loading, and repository-error states are understandable and keyboard accessible.
- The full library remains available through a clear link.

### Tests and verification

- Add focused UI tests for initial focus, fuzzy results, tag combinations, keyboard result movement, opening a result, and empty/error states.
- Test the service-worker command handler with mocked `chrome.tabs.create` and assert the extension URL.
- Run `pnpm format`, `pnpm lint`, `pnpm test:coverage`, and `pnpm build`, in that order.

### QA verification

- Verify shortcut collisions and reassignment through `chrome://extensions/shortcuts`.

## AL-104 — Add a Search in side panel shortcut

### User story

As a user who wants to keep the current page visible, I want a shortcut that opens Atlas Links search beside it so that I can find links without losing context.

### Browser capability decision

Use Chrome's Manifest V3 Side Panel API. Declare the `sidePanel` permission and a `side_panel.default_path`, and set the minimum supported Chrome version to at least 116 because `chrome.sidePanel.open()` is available from Chrome 116. Opening must happen directly in response to the `search-sidebar` command/user gesture.

If `chrome.sidePanel.open` is unexpectedly unavailable or rejects the request, fall back to opening the AL-103 search page in a new tab and show a brief, understandable notice there. Do not silently do nothing and do not request broad website permissions.

### Scope

- Add a standard Manifest V3 command named `search-sidebar` with a suggested shortcut and clear description.
- Declare the side-panel page in the manifest, add it as a Vite build entry, and handle the command in the service worker with `chrome.sidePanel.open({ windowId })` for the invoking tab's window.
- Build a compact search surface that reuses the same repository, fuzzy-search utility, tag AND-filtering, result semantics, theme preference, and shared components as AL-103.
- Focus the search input whenever the panel is opened. Where Side Panel lifecycle events are unavailable on the minimum Chrome version, use a runtime message or visibility/focus handling rather than raising the minimum version only for convenience.
- Support fuzzy search over names and descriptions, multi-tag filtering, removable selected-tag chips, result count, and keyboard result navigation.
- Show compact result rows with name, hostname, a short description excerpt, and tags. Keep touch/click targets and focus indicators usable at narrow widths.
- Open a selected bookmark in the main browser tab associated with the panel. Provide an explicit secondary action to open in a new tab.
- Include a clear “Open full library” action for editing, deletion, sorting, and sync management; feature parity with the full library is not required.
- Do not configure the toolbar action to open the panel: the toolbar action must continue to open **Save this link / Update this link**.

### Acceptance criteria

- On Chrome 116+, the shortcut opens Atlas Links in the side panel of the command's current window while leaving the active page visible.
- Search receives focus and supports the same fuzzy matching and combined tag-filter rules as the library and new-tab search.
- Opening a result navigates the main tab; the panel remains available according to normal Chrome side-panel behavior.
- The panel remains useful at narrow and wide side-panel widths without horizontal scrolling.
- The panel works offline, signed out, and with zero bookmarks.
- If the Side Panel API cannot be used, the new-tab search fallback opens with a visible explanation and focused search.
- No additional host permission, `tabs` permission, browsing-history access, or content script is introduced.

### Tests and verification

- Test successful side-panel opening, missing-API fallback, rejected-open fallback, and selection of the correct `windowId` with mocked Chrome APIs.
- Run the same shared search/filter contract tests against library, new-tab, and side-panel surfaces so behavior cannot drift.
- Run `pnpm format`, `pnpm lint`, `pnpm test:coverage`, and `pnpm build`, in that order.

### QA verification

- Test opening, closing, resizing, and reopening the panel; current-window behavior across two Chrome windows; result navigation; shortcut reassignment; theme changes; and the fallback path.
- Verify the unpacked production build has a valid `side_panel` manifest entry and no service-worker or panel console errors.

## AL-105 — Design and ship the Atlas Links logo and extension icons

### User story

As an Atlas Links user, I want a distinctive, trustworthy logo so that I can recognize the extension quickly in Chrome and across its popup, library, and search surfaces.

### Creative direction

- Create a simple, memorable mark appropriate for **Atlas Links**: navigation, finding, saved places, or connected references are relevant themes. Avoid a generic globe, browser-bookmark glyph, chain-link clip art, or an ambiguous single letter as the final concept.
- Preserve the product's current calm, editorial visual character. The mark should feel clear and useful rather than social, playful, or enterprise-heavy.
- The design must remain recognizable at 16×16 pixels and should not depend on small text, fine lines, gradients, shadows, or tiny interior details.
- Do not change the Atlas Links product name, typography system, or overall color palette unless a tightly scoped adjustment is necessary for the logo and is documented with the proposal.
- Produce two or three meaningfully different initial concepts, evaluate them at toolbar size and in both themes, and select one direction before polishing the full asset set.
- Confirm that the selected design is original and does not intentionally imitate a well-known browser, bookmark manager, mapping product, or registered brand. Record the source and license of any third-party typeface, template, or asset used; prefer an original vector mark with no third-party graphic dependency.

### Scope

- Create one canonical editable vector source, preferably SVG, with a compact `viewBox`, no embedded raster data, no external resources, and no unnecessary editor metadata.
- Export crisp PNG extension icons at 16×16, 32×32, 48×48, and 128×128 pixels. Include additional source exports only when they have a documented use.
- Add the PNG icons to the Manifest V3 `icons` map and add the appropriate sizes to `action.default_icon` so Chrome uses the brand mark in the toolbar, extension-management page, permissions UI, and store/package contexts.
- Replace the temporary `A` brand mark in the popup and library with a shared logo component or asset. Apply it to the new-tab and side-panel surfaces when those tickets are implemented.
- Provide variants only where required for legibility. Prefer one theme-independent icon; if separate light/dark presentation is necessary, keep the silhouette and identity consistent and document how each surface selects the variant.
- Keep the logo decorative when adjacent text already says “Atlas Links” by using an empty alternative-text value or `aria-hidden`. Give it an accessible name only when the logo itself is the sole brand or navigation control.
- Do not load fonts, images, or executable resources from a CDN. All production assets must be packaged with the extension and compatible with the Manifest V3 Content Security Policy.
- Add a short logo usage section to the README covering the canonical source file, exported sizes, clear-space/minimum-size guidance, color values, and any licensing notes.

### Deliverables

- Canonical vector artwork committed in a clearly named source/assets location.
- Production PNGs at every manifest-required size, with transparent backgrounds unless the chosen design explicitly requires a contained tile.
- Updated manifest icon declarations and shared in-product logo usage.
- A lightweight concept record showing the alternatives considered, the chosen direction, and toolbar-size/theme checks. This may live in project documentation rather than shipping in the extension bundle.

### Acceptance criteria

- The logo is recognizable and visually balanced at 16×16, 32×32, 48×48, and 128×128 pixels without blurred edges or lost essential detail.
- The unpacked extension shows the intended icon in the Chrome toolbar and `chrome://extensions` rather than the default extension icon.
- The popup, library, new-tab search, and side panel use the same brand identity without duplicated one-off markup.
- The mark remains legible against both the Atlas Links light and dark surfaces and in Chrome's light and dark browser chrome.
- Raster exports have the exact declared pixel dimensions, use an appropriate color mode, and contain no accidental matte/background color.
- No external network request, remote font, unlicensed graphic, or secret design-source credential is added.
- Replacing the temporary `A` does not cause layout shift, clipping, overflow, or an inaccessible duplicate announcement.

### Tests and verification

- Add a small automated asset/manifest check that verifies every declared icon exists, is a PNG, and has the exact dimensions associated with its manifest key.
- Run a production build and validate that all icon paths resolve from the built manifest.
- Run `pnpm format`, `pnpm lint`, `pnpm test:coverage`, and `pnpm build`, in that order.

### QA verification

- Load the unpacked extension and inspect the toolbar icon at normal and high-DPI scaling, the extensions-management page, popup, library, new-tab search, and side panel.
- Inspect light and dark browser chrome plus Atlas Links light and dark themes; also check Windows or Linux rendering if the final exports were produced on macOS.

## AL-106 — Import a browser bookmarks export without tags

### User story

As an Atlas Links user with bookmarks in another browser or bookmark manager, I want to import a standard bookmarks export so that I can bring my existing links into Atlas Links without recreating them individually.

### Supported input and product decisions

- Support the Netscape Bookmark File Format HTML export produced by major browsers such as Chrome, Edge, Firefox, and Safari. This ticket does not add JSON, CSV, browser-history, or direct browser-profile imports.
- Import bookmark links only. Ignore folders, separators, favicons, browser-specific attributes, and folder hierarchy; do not convert folder names or any other export metadata into Atlas Links tags.
- Every newly imported bookmark must have `tags: []` regardless of where it appeared in the export.
- Parse the selected file locally inside the extension. Do not upload it, retain the original file contents, or send import data to an external service.

### Scope

- Add a clearly labelled **Import bookmarks** action to the full library. Do not add the import workflow to the capture popup, new-tab search, or side panel.
- Open a local `.html` or `.htm` file picker and show a review summary before committing any changes. The summary must include the number of valid new bookmarks, duplicates that will be skipped, invalid or unsupported entries that will be skipped, and the total bookmark links found.
- Parse bookmark anchors using browser DOM APIs or another CSP-compatible local parser. Never inject or render imported HTML, execute scripts, load referenced resources, or use `dangerouslySetInnerHTML`.
- Treat the entire file as untrusted input. Enforce a documented maximum file size and maximum number of bookmark entries, fail safely when either limit is exceeded, and keep the library usable after malformed input.
- For each anchor, use its `href` as the URL and its trimmed text content as the name. Apply the existing URL normalization and validation rules, accepting only `http:` and `https:` URLs.
- When the anchor text is empty after trimming, derive a deterministic readable name from the normalized URL, preferably its hostname, rather than importing a bookmark with an empty name.
- Import descriptions only when the supported export represents them as the standard adjacent `<DD>` description for that bookmark. Trim and treat the description as plain text. Do not infer descriptions from folders or other attributes.
- Generate a stable new UUID for each imported bookmark and valid ISO 8601 UTC `createdAt` and `updatedAt` values. Browser export timestamps may be used only when they parse safely; otherwise use the import time. Imported records must pass the same model validation as manually created bookmarks.
- Detect duplicates using the repository's normalized-URL comparison. Skip URLs already present in Atlas Links and repeated normalized URLs within the same file; do not overwrite or merge into existing bookmarks.
- Commit all accepted bookmarks through a repository-level bulk operation so the store remains valid, the revision changes predictably, subscribers receive a coherent update, and a signed-in user's sync state becomes dirty through the normal local-mutation path.
- Make the commit atomic from the user's perspective: if persistence fails, do not leave an undocumented partial import. Show an understandable recoverable error and allow retrying with the same or another file.
- Show an accessible completion result stating how many bookmarks were imported and how many were skipped. Include a clear cancel action before import, prevent accidental double submission, and preserve visible keyboard focus throughout the dialog or import panel.
- Importing must work fully offline and while signed out. It must not request new Chrome permissions or broad host access.

### Acceptance criteria

- A valid Chrome, Edge, Firefox, or Safari Netscape-format bookmarks HTML export can be selected and reviewed from the full library.
- Confirming the review imports every valid, non-duplicate `http:` or `https:` link with its name, optional supported description, and an empty tags array.
- Bookmark folders and nesting never create tags, descriptions, or synthetic bookmarks.
- Existing normalized URLs and later repeats within the selected file are reported and skipped without changing the existing Atlas Links record.
- Empty titles receive a deterministic URL-derived name; invalid URLs, unsupported schemes, separators, and malformed entries are skipped safely and included in the review counts.
- Cancelling before confirmation makes no changes. A successful import is visible immediately, persists after Chrome restarts, and participates in normal Drive sync when sign-in and sync are enabled.
- Malformed, oversized, empty, and non-bookmark HTML files produce understandable messages without corrupting or replacing the current bookmark collection.
- Imported markup is never rendered as HTML, no referenced resource is fetched, and no import content or bookmark metadata is logged.

### Tests and verification

- Add parser fixtures representative of Chrome, Edge, Firefox, and Safari exports, including nested folders, HTML entities, Unicode, adjacent descriptions, empty titles, malformed anchors, and browser-specific attributes.
- Unit-test URL normalization, unsupported schemes, within-file duplicates, duplicates against the repository, fallback names, empty tags, safe timestamp handling, entry/file limits, and deterministic review counts.
- Repository-test a successful bulk import, atomic persistence failure, predictable revision behavior, subscriber notification, sync-dirty transition, and retry without duplicate creation.
- Component-test file selection, review, cancel, confirm, disabled/double-submit behavior, completion summary, errors, focus management, and keyboard-only operation.
- Run `pnpm format`, `pnpm lint`, `pnpm test:coverage`, and `pnpm build`, in that order.

### QA verification

- Export bookmarks from supported browsers and import them into a library containing existing records. Verify nested folders do not produce tags and that the production extension makes no network requests while parsing.

## AL-107 — Add editable Atlas Links JSON import and export

### User story

As an Atlas Links user, I want to export my bookmarks to a readable Atlas Links JSON file, edit that file with ordinary tools or an LLM, and import it again so that I can make bulk changes such as adding or reorganizing tags.

### Format and product decisions

- Define a documented, versioned `AtlasLinksExport` JSON format for interchange. Do not expose or accept the internal `BookmarkStore` as the file format; repository revisions, `deviceId`, Drive file IDs, authentication details, sync state, retry state, and other device-specific metadata are not portable bookmark content.
- Use a recognizable top-level format identifier, a schema version, an export timestamp, and a `bookmarks` array. Name the downloaded file `atlas-links.json` by default.
- Keep the JSON pretty-printed, UTF-8 encoded, deterministic in field ordering, and straightforward for a person or LLM to edit. Document every supported field and include a short example in project documentation.
- Each exported bookmark includes its stable `id`, URL, name, description, tags, `createdAt`, and `updatedAt`. The stable ID lets a re-import update the intended bookmark even if its URL has been edited.
- Export active bookmarks only. Never include tombstones or any bookmark with `deletedAt`, and do not include a `deletedAt` field in the interchange schema.
- Import is additive and updating, not a restore operation. A bookmark omitted from an imported file is left unchanged; absence from the file must never delete a local bookmark or create a tombstone.
- This ticket enables user-directed editing with external tools, including LLMs, but does not add an LLM integration, transmit bookmarks, generate tags inside Atlas Links, or request network access.

### Scope

- Add clearly labelled **Export Atlas Links JSON** and **Import Atlas Links JSON** actions to the full library near the browser-bookmark import from AL-106. Keep these data-management actions out of the popup, new-tab search, and side panel.
- Export a snapshot read through `BookmarkRepository` and validated with the same model rules used by the application. Sort the exported bookmarks deterministically so repeated exports of unchanged data differ only where documented, such as `exportedAt`.
- Download the export locally through a Manifest V3-compatible browser API. Revoke temporary object URLs and do not retain a second copy in extension storage.
- Open a local `.json` file picker for import, read and parse the file locally, and validate it as untrusted input before showing or committing any changes. Enforce documented file-size and entry-count limits.
- Reject invalid JSON, unsupported format identifiers, unsupported schema versions, duplicate IDs, structurally invalid records, and unsafe values with understandable diagnostics. Apply the existing URL, name, description, tag, timestamp, and model validation rules; accept only `http:` and `https:` URLs.
- Normalize imported tags by trimming whitespace, comparing case-insensitively, preserving one stable display spelling, and rejecting empty or duplicate values according to the existing tag rules. Never interpret tag strings as HTML.
- Match an imported record to an existing bookmark by stable `id` first. When no ID matches, compare normalized URLs so files can also add or reconcile records whose IDs were removed or generated elsewhere.
- Treat a matching imported record as a proposed update to the bookmark's editable fields: URL, name, description, and tags. Preserve the local stable ID and `createdAt`; set `updatedAt` to the import commit time when editable content changes, even if the file's timestamp was not manually updated.
- Treat a valid unmatched record as a proposed new bookmark. Preserve a valid unique imported ID when present; otherwise generate a new UUID. Preserve valid imported timestamps where safe, falling back to the import time, and ensure the final record passes normal model validation.
- If an imported ID and normalized URL point to two different local bookmarks, report a conflict and do not guess, overwrite, merge, or create a third duplicate.
- Ignore no fields silently. Reject or clearly report unsupported per-bookmark fields such as `deletedAt`, and ensure no imported value can directly create a tombstone, alter sync metadata, or control repository revisions.
- Show a review step before committing. Summarize new, updated, unchanged, conflicted, and invalid records, and provide enough per-record detail for the user to understand proposed changes without rendering imported markup.
- Allow the user to confirm all valid non-conflicting changes or cancel with no mutation. Do not infer deletions from missing records, and do not silently overwrite a conflicted bookmark.
- Apply confirmed changes through one repository-level bulk transaction. The store must remain valid, the revision must change predictably, subscribers must receive a coherent update, and signed-in sync must become dirty through the normal local-mutation path.
- Make import atomic from the user's perspective: persistence failure must not leave an undocumented partial update. Prevent double submission and show a recoverable completion or error summary.
- Keep the workflow fully keyboard accessible and usable offline and while signed out. It must not require new Chrome permissions or broad host access.
- Add concise privacy guidance beside or within the workflow: Atlas Links processes the file locally, but bookmarks can contain private URLs, names, and descriptions, so users should review the privacy implications before providing an export to any external tool or LLM.

### Acceptance criteria

- Export downloads a valid, documented `atlas-links.json` file containing all active bookmarks and their editable metadata, stable IDs, and timestamps.
- The export contains no tombstones, deleted bookmarks, device identifiers, repository revisions, OAuth or Drive metadata, sync state, tokens, or other account-specific data.
- Exporting and immediately re-importing an unchanged file proposes no bookmark changes and creates no duplicates.
- Editing only tags in the exported JSON and re-importing it proposes updates to the matching bookmarks; confirmation applies the normalized tags and advances `updatedAt` through the normal mutation path.
- Editing a bookmark URL still updates the intended local bookmark when its stable ID is preserved.
- Valid unmatched entries are proposed as new bookmarks. ID/URL collisions and ambiguous matches are surfaced as conflicts and never resolved by silent overwrite.
- Removing a bookmark from the JSON file does not delete or modify the corresponding local bookmark. The import path cannot create tombstones.
- Invalid JSON, unsupported versions, malformed records, duplicate IDs, unsafe schemes, oversized files, and excessive entry counts fail safely without corrupting or replacing the local collection.
- Cancelling the review makes no changes. A confirmed import is visible immediately, survives Chrome restart, and participates in normal Drive sync when enabled.
- Import and export make no network requests, and Atlas Links does not log file contents, full URLs, descriptions, or other private bookmark metadata.

### Tests and verification

- Add contract tests for the versioned export parser and serializer, deterministic output, Unicode, JSON escaping, all supported fields, and rejection of internal-only or unsupported fields including `deletedAt`.
- Test that export excludes tombstones and every sync-, account-, device-, and repository-specific field.
- Test unchanged round trips, tag-only edits, renamed bookmarks, changed URLs with preserved IDs, new records with and without IDs, normalized-URL matching, duplicate IDs, ID/URL cross-conflicts, invalid tags, invalid timestamps, unsafe URLs, unsupported versions, and missing records that must not cause deletion.
- Repository-test atomic mixed create/update import, persistence failure, predictable revision behavior, one coherent subscriber notification, sync-dirty transition, and retry without duplicate creation.
- Component-test export initiation, file selection, review counts and record details, cancel, confirm, conflict display, disabled/double-submit behavior, completion and error states, focus management, and keyboard-only use.
- Run `pnpm format`, `pnpm lint`, `pnpm test:coverage`, and `pnpm build`, in that order.

### QA verification

- Export a populated collection, add and reorganize tags in a text editor, re-import it, and verify the proposed and committed changes. Repeat with an externally edited copy representative of LLM output and confirm no metadata outside the documented schema is accepted silently.
- Verify through browser developer tools that neither export nor import performs a network request and that temporary download resources are released.

## AL-108 — Fix the Google Drive v3 file query and conditional upload

### Problem

`GoogleDriveStore.download` in `src/sync/services.ts` lists the remote store file with `fields=files(id,name,etag)`. The Drive v3 `files` resource has no `etag` field (it existed in v2 only), and Drive returns HTTP 400 for an invalid field selection, so every sync that reaches the file-listing call fails with "Google Drive request failed (400)". This also means the later attempt to read an `ETag` response header and send it as `If-Match` is unreachable in the current flow. Drive v3 does not document conditional media updates for this operation clearly enough to assume either that this header works or that it is ignored; that behavior must be verified against the real API before retaining or removing it.

### Scope

- Before changing code, verify the current behavior once against the real Drive API with a test account and record the observed responses in the pull request.
- Request only fields that exist in the Drive v3 `files` resource (for example `files(id,name,version)`).
- Decide and document one concurrency strategy: either use a conditional-update mechanism demonstrated to reject a stale Drive v3 media upload, or explicitly accept file-level last-writer-wins because `mergeStores` makes concurrent writers converge on a subsequent sync.
- A separate `version` or `headRevisionId` read immediately before upload may detect some conflicts but is not an atomic precondition; do not describe it as optimistic concurrency unless the upload itself is conditionally rejected when that value changes.
- Remove `Remote.etag` and `If-Match` if the real-API test does not demonstrate that they provide the required conditional behavior. Do not keep dead or unverified concurrency code that implies protection that does not exist.
- Keep the existing user-facing error mapping for 401, 429, and other failures.

### Acceptance criteria

- With a valid token, a full sync round-trip succeeds: the first sync creates `atlas-links.v1.json`, and later syncs list, download, merge, and upload it without a 400 response.
- No request sends a field selection that Drive v3 rejects, and no header is claimed to provide conditional-update behavior unless that behavior is covered by a real-API regression test.
- The chosen concurrency strategy is documented where the upload happens, and the behavior when two devices sync near-simultaneously is described accurately.

### Tests and verification

- Unit-test `download()` and `upload()` against a fake `fetch`, asserting the exact `fields` parameter, URLs, and headers sent.
- Add a regression test that the upload request contains no `If-Match` header unless the chosen strategy has demonstrated and documented a supported source for its value.
- Run `pnpm format`, `pnpm lint`, `pnpm test:coverage`, and `pnpm build`, in that order.

### QA verification

- Exercise sign-in and at least two consecutive syncs against the real Drive API with the configured OAuth client.

## AL-109 — Make sign out revoke Google access

### Problem

`ChromeIdentityService.signOut` in `src/sync/services.ts` only calls `chrome.identity.removeCachedAuthToken`, which clears Chrome's token cache but leaves the OAuth grant intact. The next bookmark mutation sends `schedule-sync`, the `atlas-sync` alarm fires, and the non-interactive `engine.sync(false)` call can silently obtain a fresh token because the account is still authorized — so a user who pressed **Sign out** is returned to a signed-in, syncing state without any interaction. For a product whose footer promises local-only storage after sign-out, this is a privacy defect, not just a state bug.

### Scope

- On sign out, revoke the grant server-side by sending the current token to Google's OAuth revocation endpoint in addition to removing it from Chrome's cache. Treat revocation failure as non-fatal but do not hide it; the local state must still become signed-out.
- Clear all cached tokens (`chrome.identity.clearAllCachedAuthTokens` where available) rather than only the single token just fetched.
- Add the narrowly scoped `https://oauth2.googleapis.com/*` host permission required for a service-worker request to Google's revocation endpoint; do not broaden the existing Google API host access.
- Ensure background alarm sync never runs while the stored `syncStatus` is `signed-out`; only the explicit interactive **Sign in with Google** action may leave the signed-out state. (AL-111 implements the gating; this ticket depends on it for the guarantee.)
- Keep local bookmarks untouched by sign out, matching current behavior.

### Acceptance criteria

- After **Sign out**, creating, editing, or deleting bookmarks never triggers a Drive request, token request, or `syncStatus` change away from `signed-out`, no matter how long the browser stays open.
- After sign out, syncing resumes only through the interactive sign-in action; the extension never mints a token non-interactively while signed out.
- When a token can be obtained, the revocation request is sent once in the documented form. If no token can be obtained, or revocation fails, cached identity state is still cleared and the extension remains signed out with an understandable, visible message.

### Tests and verification

- Unit-test `signOut` with a fake identity service and fake `fetch`: token revoked when available, caches cleared even when token lookup or revocation fails, and signed-out status persisted with a visible warning when appropriate.
- Validate that the built manifest grants access to the revocation origin and does not add a broader Google host pattern.
- Unit-test that a schedule-sync message or alarm while signed out does not invoke `SyncEngine.sync`.
- Run `pnpm format`, `pnpm lint`, `pnpm test:coverage`, and `pnpm build`, in that order.

### QA verification

- With a real Google account, sign in, sign out, edit a bookmark, and confirm from the service-worker console and network activity that no Drive or token request occurs.

## AL-110 — Do not lose local edits made while a sync is in flight

### Problem

`SyncEngine.sync` in `src/sync/services.ts` reads the store, performs two network round-trips (download, then upload), and finally writes `saveStore(merged)`. A bookmark created or edited from the popup or library during that window is included in neither `merged` nor the uploaded file, and the final `saveStore(merged)` overwrites it locally — silent, unrecoverable data loss. The window is small for a single sync, but a sync runs after every mutation via the alarm, so the race is realistic over time.

### Scope

- After the network phase, re-read the current store and detect whether it changed since the pre-download snapshot. Compare the revision and the store being replaced so a different store with an equal revision cannot be overwritten.
- When it changed, merge the fresh local store into the already-merged result with `mergeStores` before persisting, and either re-upload in the same sync or leave the store marked dirty so the next scheduled sync uploads the newly merged state.
- Protect the final compare-and-save step from another cross-context mutation. Use serialized repository writes, a cross-context lock, or a bounded compare/merge/retry design; a single unprotected re-read followed by a write only narrows the race and is not sufficient.
- Prevent overlapping `sync()` calls in the same worker from interleaving writes; a single-flight promise guard inside `SyncEngine` is acceptable. Cross-context races between the worker and extension pages must be covered by the protected compare-and-save mechanism above.
- Keep the `syncStatus` transitions unchanged from the user's perspective.

### Acceptance criteria

- A bookmark saved between sync's initial store read and its final write survives locally and reaches Drive on that sync or the immediately following one.
- No code path replaces a different current store with a stale snapshot, even when the stale snapshot has an equal or higher revision number.
- Two rapid **Sync now** clicks do not interleave writes or upload twice concurrently.

### Tests and verification

- Unit-test with a fake repository whose store mutates between the engine's `getStore` and `saveStore` calls, asserting the concurrent mutation is present in the persisted result and is uploaded (immediately or by a follow-up sync).
- Test a mutation in the final compare-to-save window and an equal-revision/different-content collision; neither mutation may be overwritten.
- Unit-test overlapping `sync()` invocations for single-flight behavior.
- Run `pnpm format`, `pnpm lint`, `pnpm test:coverage`, and `pnpm build`, in that order.

### QA verification

- No additional manual QA is required for this ticket; the race windows are covered by deterministic automated concurrency tests.

## AL-111 — Stop background sync churn while signed out and respect the alarm minimum

### Problem

Two related defects sit in the mutation → background-sync path. First, every repository mutation sends `schedule-sync`, the alarm fires, and `SyncEngine.sync` unconditionally writes `syncStatus: 'syncing'` before discovering there is no token, so signed-out, local-only users see the library status flip to "Syncing…" and back on every save while the extension performs needless token lookups indefinitely. Second, `chrome.alarms.create('atlas-sync', { delayInMinutes: 0.1 })` in `src/background.ts` requests a 6-second delay, below Chrome's 30-second alarm minimum. Installed Chrome extensions do not honor values below 0.5 minutes and emit a warning; unpacked extensions may be exempt from the firing-frequency limit, so this defect can behave differently during local development.

### Scope

- Make the schedule-sync message a no-op while the stored `syncStatus` is `signed-out`, and make the alarm handler check the same state before syncing. This also underpins the AL-109 guarantee.
- Only set `syncStatus: 'syncing'` once a token has been obtained, or otherwise ensure signed-out users never observe a syncing state they did not initiate.
- Use an alarm delay of at least 0.5 minutes and document why (Chrome's alarm minimum), keeping the current behavior where repeated mutations collapse into the one named alarm.
- Sync from the alarm only when local changes are pending, using the dirty tracking wired up in AL-112.

### Acceptance criteria

- While signed out, saving, editing, or deleting bookmarks causes no alarm-driven sync attempt, no token request, and no visible sync-status change.
- While signed in, a burst of edits results in one deferred background sync, no console warning about the alarm delay, and status transitions of idle → syncing → idle.
- Manual **Sync now** and **Sign in with Google** behavior is unchanged.

### Tests and verification

- Unit-test the message and alarm handlers with mocked Chrome APIs for both the signed-out and signed-in states.
- Unit-test that the alarm is created with a delay of at least 0.5 minutes.
- Run `pnpm format`, `pnpm lint`, `pnpm test:coverage`, and `pnpm build`, in that order.

### QA verification

- As a signed-out user, verify that saving bookmarks leaves the library header reading "Local only" with no flicker and produces no service-worker warnings. Verify the alarm timing in an installed or packaged build as well as the unpacked development build.

## AL-112 — Repository and sync-status correctness fixes

### Problem

Four small correctness defects, grouped because they touch the same mutation and status plumbing:

1. **`update()` persists before validating.** `ChromeBookmarkRepository.update` in `src/data/repository.ts` runs its `mutate` callback — which saves the store with `revision + 1` and schedules a sync — before discovering that no bookmark matched the given `id` and throwing "Bookmark not found." A failed update must not change persisted state, bump the revision, or trigger a sync.
2. **`remove()` has the same missing-id write behavior.** Removing an unknown id maps the unchanged bookmark array, persists a new revision, and schedules a sync instead of failing or returning a documented no-op.
3. **`send()` in the library has no error handling.** `src/library/main.tsx` awaits `chrome.runtime.sendMessage` with no `catch`; if the message channel fails (service worker unavailable, channel closed) the promise rejects unhandled and the header is stuck on "Syncing…". A null, `undefined`, or malformed response can also crash the render when `sync.state` is read.
4. **Dead dirty tracking.** `saveStore` writes `syncDirty: true` and `SyncEngine` clears or removes it, but nothing ever reads the flag, and the `'dirty'` member of `SyncStatus` is never assigned, so the "Changes waiting" label in the library header is unreachable. Wire the flag and state up (preferred, since AL-111 consumes it to decide when the alarm should sync) or remove the flag, the state member, and the label together.

### Scope

- In `update`, verify the target bookmark exists before entering the persisting mutation, so a missing id throws without any store write or scheduled sync.
- Apply the same rule to `remove`: choose and document either a not-found error or a no-op, and do not persist or schedule sync when no bookmark matches.
- In the library's `send`, handle rejection and validate null, `undefined`, and malformed responses by setting an error sync status with an understandable message instead of leaving "Syncing…" permanently or crashing during render.
- Resolve the dirty tracking in one direction: either signed-in users with pending local changes see the "Changes waiting" state and the alarm handler uses the flag, or every trace of the unused feature is deleted.

### Implementation decision

- Removing an unknown bookmark ID throws `Bookmark not found.` without persisting or scheduling sync, matching `update()`.
- `syncDirty` remains the persisted source of truth. The library derives the `dirty` display state for signed-in idle users, and background alarms run only when the flag is exactly `true`; bookmark writes never overwrite signed-out or error status.

### Acceptance criteria

- Updating a nonexistent bookmark id throws, leaves the stored revision and bookmarks unchanged, and schedules no sync.
- Removing a nonexistent bookmark follows its documented error/no-op behavior, leaves the stored revision and bookmarks unchanged, and schedules no sync.
- If the sync or sign-out message rejects or returns a missing or malformed response, the library shows a recoverable error state rather than an indefinite "Syncing…" or render failure, and no unhandled promise rejection is logged.
- Either the "Changes waiting" state is reachable and accurate for signed-in users with unsynced edits, or `syncDirty`, the `'dirty'` status member, and the label no longer exist.

### Tests and verification

- Repository-test that `update` with an unknown id makes no storage write, does not bump `revision`, and sends no schedule-sync message.
- Add the equivalent repository test for `remove` with an unknown id, covering the documented error/no-op result.
- Component- or unit-test the library sync controls with rejecting, null, `undefined`, and malformed `sendMessage` results, asserting the recovered error state.
- Test whichever dirty-tracking direction is chosen: state transitions to and from `'dirty'`, or the absence of any `syncDirty` writes.
- Run `pnpm format`, `pnpm lint`, `pnpm test:coverage`, and `pnpm build`, in that order.

### QA verification

- No additional manual QA is required for this ticket; the repository failure paths and sync-status recovery are covered by automated tests.

## AL-115 — Keep signed-in state across extension updates

### Problem

The `chrome.runtime.onInstalled` listener in `src/background.ts` writes `syncStatus: { state: 'signed-out' }` unconditionally. Chrome fires `onInstalled` with reasons `update` and `chrome_update`, not only `install`, so every extension update — including ones the store pushes automatically — resets a signed-in user to signed-out. Because background sync is deliberately gated off while the stored status is `signed-out` (AL-109/AL-111), the consequence is silent: sync stops after each update until the user notices the library header reads "Local only" and clicks **Sign in with Google** again. No data is lost and re-sign-in does not re-prompt for consent (the OAuth grant survives), but signed-in continuity is broken on every future release.

### Scope

- Seed `syncStatus: signed-out` only on first install (`details.reason === 'install'`), or equivalently only when no parseable `syncStatus` already exists. A valid stored status must survive `update` and `chrome_update` untouched.
- Treat a corrupted or unparseable stored status as absent and seed the signed-out default in that case.
- Do not weaken the AL-109/AL-111 guarantees: an explicitly signed-out user must remain signed out across updates, and only the interactive sign-in action may leave the signed-out state.
- Confirm that a signed-in user with pending local changes (`syncDirty: true`) resumes background sync normally after an update.

### Acceptance criteria

- A signed-in user remains signed in after the extension updates, and alarm-driven sync of pending changes continues without any user action.
- A fresh install seeds the signed-out default exactly as today.
- A signed-out user remains signed out after an update, with no token or Drive request.
- A corrupted stored status is replaced by the signed-out default instead of crashing the worker or leaving an unreadable state.

### Tests and verification

- Unit-test the `onInstalled` handler with mocked Chrome APIs across reasons `install`, `update`, and `chrome_update`, combined with existing signed-in, signed-out, dirty, and corrupted stored statuses.
- Run `pnpm format`, `pnpm lint`, `pnpm test:coverage`, and `pnpm build`, in that order.

### QA verification

- In an unpacked build, sign in, press the extension's reload/update control in `chrome://extensions`, and confirm the library still shows the signed-in state and a pending edit syncs.

## AL-117 — Move the canonical logo SVG out of the shipped package

### Problem

`public/icons/atlas-links.svg` is copied verbatim into `dist/` and the store zip. The manifest references only the PNG icons, but the file is not dead: `src/ui/Logo.tsx` loads `/icons/atlas-links.svg` at runtime for in-product branding, so simply deleting it from `public/` would break the logo on every page. The canonical, editable artwork should live in a source-assets location where it can be used to generate more raster sizes, while the shipped package contains only bundler-managed assets.

### Scope

- Move the canonical SVG out of `public/icons/` into a source assets location (for example `assets/` at the repository root, alongside anything else used to generate shipped artwork).
- Change the `Logo` component to reference the SVG through the bundler (a Vite asset import) instead of the absolute `/icons/atlas-links.svg` public path, so the shipped copy is emitted and fingerprinted by the build rather than copied loose.
- Keep the 16, 32, 48, and 128 px PNGs in `public/icons/` exactly as the manifest declares them; document how they are regenerated from the canonical SVG.
- Update the README logo-usage section and `docs/logo-concepts.md` to the new canonical path.

### Acceptance criteria

- The logo still renders in the popup, library, search page, and side panel of a production build.
- `dist/icons/` contains only the four manifest PNGs; no loose, unfingerprinted SVG ships in the zip.
- The canonical SVG is tracked at its new source path and the documentation points to it.

### Tests and verification

- The existing `tests/assets.test.ts` manifest-icon checks continue to pass.
- Run `pnpm format`, `pnpm lint`, `pnpm test:coverage`, and `pnpm build`, in that order.

### QA verification

- Load the built extension and visually confirm the logo on the popup, library, search page, and side panel.

## AL-116 — Make sync failures typed, retryable, and safely recoverable

### Problem

Three sync requirements from the agent guide are unmet. First, retryable failures need bounded backoff plus manual recovery, but `SyncEngine.performSync` makes one attempt and forgets the failure when its Manifest V3 worker is terminated. Second, the UI and scheduler cannot make safe decisions from the current untyped `error` state and message string: an offline network failure, expired authorization, rate limit, permanent quota problem, malformed remote document, and transient Google service failure require different actions. Third, `driveFileId` is removed on sign-out but never written, so every sync performs discovery again and there is no cached-ID recovery path. AL-108's documented file-level last-writer-wins strategy remains deliberate and is not in scope to revisit.

### Scope

- Add a typed failure code to sync status and structured Drive errors at the adapter boundary. At minimum distinguish `offline`, `authorization`, `rate-limit`, `quota`, `corrupt-remote`, and `transient-service`; UI and retry decisions must never depend on matching English message text.
- Classify from both HTTP status and Google's structured error reason where available:
  - network failures that indicate no usable connection are `offline`;
  - invalid/expired credentials and consent denial are `authorization`;
  - `429`, retryable rate-limit reasons, and Google responses with a usable `Retry-After` are `rate-limit`;
  - permanent daily/storage/project quota exhaustion is `quota`;
  - invalid JSON, an unsupported schema, validation failure, or a remote document over the documented safe size limit is `corrupt-remote`;
  - `408` and retryable `5xx` responses are `transient-service`.
    Do not treat every `403` as retryable or every failed `fetch` as proof that the browser is offline.
- Persist retry metadata separately from the user-facing status: failure code, automatic-attempt count, and `nextAttemptAt`. Schedule retries with a dedicated named Chrome alarm so service-worker termination cannot lose the backoff and ordinary mutation debounce cannot silently reset it. Clear the retry alarm and metadata after success, sign-out, or an explicit cancellation/reset.
- Automatically retry only `offline`, `rate-limit`, and `transient-service`. Use `Retry-After` when valid; otherwise permit at most four scheduled retries after the initial failure, with delays of 0.5, 1, 2, and 4 minutes. Never auto-retry `authorization`, permanent `quota`, or `corrupt-remote`. A new mutation marks the store dirty but does not reset an existing attempt count or shorten a server-requested delay.
- Keep a visible recovery action after every failure. For retry-safe failures, manual retry runs immediately and starts a new bounded retry sequence; authorization failures present **Sign in again** and use an interactive token request; corrupt-remote failures present the explicit recovery choices below instead of a blind retry. Repeated button clicks and an alarm firing at the same time must still collapse through the engine's single-flight protection.
- Treat corrupt remote data as a recovery state, not an endlessly retryable error. Keep the local store untouched and offer an explicitly confirmed **Replace corrupt Drive backup with local data** action plus a safe way to remain local-only/sign out. The destructive effect on the remote backup must be stated before confirmation; never overwrite it automatically.
- Persist a validated `driveFileId` after discovery and after creation (request/return the created file's `id`). Use the cached ID for later downloads and uploads. On `404`, clear it and perform one normal discovery/create pass; classify `401`/`403` normally instead of assuming the ID is stale. Sign-out continues to clear the ID. If a corrupt document was reached through a valid ID, retain enough internal metadata for the confirmed recovery action without exposing bookmark contents.
- Put a documented response-size ceiling on the remote document before parsing it, then continue to validate and migrate the untrusted JSON with the existing model boundary. No remote failure may overwrite or partially mutate the local store.

### Acceptance criteria

- Every failure category has a stable typed code, distinct understandable message, and correct primary action. Authorization, permanent quota, and corrupt-remote failures schedule no automatic retry.
- Retryable failures survive service-worker termination, honor a valid `Retry-After`, otherwise schedule exactly the bounded 0.5/1/2/4-minute sequence, and stop visibly after the cap. Mutations and repeated manual clicks cannot create unbounded attempts or parallel uploads.
- Corrupt or oversized remote data leaves the local store byte-for-byte unchanged. The extension does not overwrite the remote document until the user explicitly confirms replacement, and choosing to remain local-only makes no Drive request.
- After the first successful discovery/creation, subsequent syncs use the cached ID without listing. A cached-ID `404` causes one re-discovery/create pass; authorization and quota errors do not. Sign-out clears the ID and all retry metadata/alarms.
- No behavior change to the AL-108 last-writer-wins upload strategy or the AL-110 concurrent-edit protections.

### Tests and verification

- Unit-test structured classification for consent denial, 401, representative retryable and permanent 403 reasons, 429 with and without `Retry-After`, network failure with online/offline signals, invalid/oversized JSON, 408, and retryable/non-retryable 5xx/4xx responses.
- Unit-test persisted retry scheduling across a simulated worker restart: exact delays, attempt cap, success/sign-out cleanup, mutation during backoff, manual reset, and no automatic alarm for authorization, quota, or corrupt data.
- Unit-test the confirmed corrupt-backup recovery path and assert that parse/size failures perform no local write and no upload before confirmation.
- Unit-test `driveFileId`: written after discovery and creation, reused without listing, one 404 re-discovery, normal handling of 401/403, and cleanup on sign-out.
- Run `pnpm format`, `pnpm lint`, `pnpm test:coverage`, and `pnpm build`, in that order.

### QA verification

- Against Drive with a trusted-testing build, establish and reuse the file ID, take Chrome offline through one scheduled retry, restore connectivity, exercise sign-in-again behavior, and use a disposable account/file to verify corrupt-backup recovery without risking real bookmarks.

## AL-113 — Add a production packaging build that guarantees a submittable manifest

### Problem

The build falls back to a placeholder OAuth client ID when `.env.local` is absent: `vite.config.ts` writes `"client_id": "CONFIGURE_GOOGLE_OAUTH_CLIENT_ID"` into `dist/manifest.json`, and `pnpm build:zip` happily packages it. A zip built this way makes **Sign in with Google** dead on arrival for every user. The opposite trap also exists: the README's local-testing flow puts `VITE_CHROME_EXTENSION_KEY` in `.env.local`, and `vite.config.ts` embeds it as a manifest `key` field whenever it is set — but the Chrome Web Store rejects uploaded packages that contain a `key` field. Nothing currently distinguishes a development package from a submission package, and the team works across multiple machines that do not all have `.env.local`, so both failure modes are realistic.

### Scope

- Keep the existing behavior of `pnpm build` (development `dist/`, placeholder tolerated) and `pnpm build:zip` (development zip) unchanged.
- Add `pnpm build:zip:prod`, which produces the Chrome Web Store submission zip.
- The production build must fail with a clear, nonzero exit when `VITE_GOOGLE_OAUTH_CLIENT_ID` is missing or still looks like a placeholder, and must never write a `key` field into the packaged manifest, even when `VITE_CHROME_EXTENSION_KEY` is set in the same `.env.local`.
- Verify the packaged manifest as part of the production script rather than by convention: real `client_id`, both Google host permissions (`https://www.googleapis.com/*` and `https://oauth2.googleapis.com/*`), and no `key` field. A failed verification must not leave a plausible-looking zip behind.
- Update the README packaging instructions to name all three builds and state which one is used for store submission.

### Acceptance criteria

- `pnpm build:zip:prod` with both env vars set produces a zip whose manifest contains the real OAuth client ID, both host permissions, and no `key` field.
- `pnpm build:zip:prod` without `VITE_GOOGLE_OAUTH_CLIENT_ID` exits nonzero with an understandable message and leaves no submission zip behind.
- `pnpm build` and `pnpm build:zip` continue to work on a machine with no `.env.local`.

### Tests and verification

- Unit-test the manifest verification logic (placeholder detection, `key` rejection, host-permission presence) against fixture manifests.
- Run `pnpm format`, `pnpm lint`, `pnpm test:coverage`, and `pnpm build`, in that order.

### QA verification

- Run all three scripts on a machine with `.env.local` and one without, and inspect the resulting `dist/manifest.json` and zip contents.
