# Atlas Links logo concepts

The canonical editable artwork is [`../assets/atlas-links.svg`](../assets/atlas-links.svg). The PNG manifest icons are generated from this source using the command documented in the README.

## Concepts considered

1. **Route to wayfinder.** A strong stepped route ending at a four-point wayfinder. It combines returning to a saved place with finding the next direction, without relying on a bookmark, chain link, globe, or letterform.
2. **Index trail.** Three offset index tabs crossed by a single route. This connected saved references to a physical atlas, but the tabs collapsed into an indistinct block at 16 px.
3. **Map fold.** A three-panel folded map with a single location marker. The idea was recognizable at large sizes, but panel gaps and the marker required too much detail for the Chrome toolbar.

## Selected direction

**Route to wayfinder** was selected. Its contained green tile is visible against light and dark Chrome surfaces, while the ivory route and amber destination retain strong internal contrast in both Atlas Links themes. The route remains continuous and the wayfinder remains distinct at 16 px and at 1x and 2x toolbar scaling. The same artwork is used in every theme; no runtime theme selection is required.

The mark was drawn specifically for Atlas Links from basic vector geometry. It does not intentionally imitate an existing browser, bookmark manager, mapping product, or registered brand. It has no third-party graphic, template, font, or raster dependency.

## Small-size checks

- **16 px:** the stepped route is at least 2 rendered pixels thick through its main runs, and the wayfinder reads as a destination rather than interior detail.
- **32 px:** the route corners and wayfinder separation remain crisp at normal toolbar scaling.
- **48 px and 128 px:** the source geometry stays balanced without adding detail that disappears at smaller sizes.
- **Light surfaces:** the forest tile defines the outside silhouette; the ivory and amber shapes remain distinct.
- **Dark surfaces:** the opaque forest tile prevents either interior shape from being lost against browser chrome.
