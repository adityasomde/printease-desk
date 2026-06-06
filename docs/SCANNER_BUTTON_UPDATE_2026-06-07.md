# Scanner Button Update - 2026-06-07

## Summary

The transparent scan button feature failed because scanner behavior was being patched directly into pages instead of living in one reusable component. Browser camera permission behavior is inconsistent:

- Chrome often returns `prompt` until a user gesture opens the camera.
- Safari and Firefox may hide camera device labels until permission is granted.
- Strict `environment` camera constraints can fail on laptops or devices without a rear camera.
- Recreated callbacks can restart the camera stream unnecessarily.
- Duplicating scanner state across Home and Centre pages makes the behavior drift.

## What Changed

- Added reusable `CentreScannerTile`.
- Home and Centre pages now use the same transparent scan tile.
- The tile starts camera input inside the card only after the user taps it.
- The moving scan line and labels stay over the live camera feed.
- QR decoding happens inside the tile, so the rest of the page stays visible.
- Camera startup now falls back from an ideal environment camera to `video: true`.
- Scanner callbacks are stabilized with `useCallback`.
- Camera errors stay local to the tile and do not break centre search.
- Desktop `frontend-dist` must be rebuilt after this source change.

## Caution

Do not add scanner state separately to every page. Reuse:

```txt
frontend/src/components/CentreScannerTile.jsx
```

Do not start camera capture before a user tap. Browser permission prompts should be caused by a clear user action.

Do not commit one-off patch scripts such as:

```txt
fix-camera-perm.js
fix-camera-perm-clean.js
fix-centre-code.js
fix-ui.js
```

They were local repair attempts and are not application code.

## Verification

Required checks after this change:

```bash
npm run build:frontend
npm run verify:package
```
