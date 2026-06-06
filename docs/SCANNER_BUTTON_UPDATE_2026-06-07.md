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
- Added reusable `CameraScanLayer`.
- Home and Centre pages now use the same transparent scan tile.
- The Home hero attempts to start the scanner background automatically for 30 seconds on page load.
- After that automatic window closes, it stays off until the user taps the scan tile again.
- The moving scan line and labels stay over the live camera feed.
- QR decoding happens inside the transparent hero/tile surface, so the rest of the page stays visible.
- Camera startup now falls back from an ideal environment camera to `video: true`.
- Scanner callbacks are stabilized with `useCallback`.
- Camera errors stay local to the tile and do not break centre search.
- Desktop `frontend-dist` must be rebuilt after this source change.

## Caution

Do not add scanner state separately to every page. Reuse:

```txt
frontend/src/components/CameraScanLayer.jsx
frontend/src/components/CentreScannerTile.jsx
```

The only automatic camera start should be the Home hero's 30-second preview window. Do not add automatic camera starts to other pages without a clear product reason.

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
