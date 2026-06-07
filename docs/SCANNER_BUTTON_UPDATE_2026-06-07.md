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
- The Home hero starts the transparent scanner automatically for 30 seconds only when the browser already reports camera permission as `granted`.
- First-time users, denied camera users, and browsers that only report `prompt` do not get an automatic camera prompt on page load.
- The Home hero has a corner mode switch for Ready, Transparent scanner, and Classic scanner.
- Ready mode keeps the camera off until the user taps the scan tile.
- Transparent mode runs the camera inside the hero/tile surface.
- Classic mode opens the older full-screen QR scanner modal.
- After the automatic transparent scanner window closes, it stays off until the user taps the scan tile again.
- The Centre page scanner auto-starts only when navigation comes from the Upload page's select-centre/continue flow.
- Normal Centre page visits through navbar/dashboard do not auto-start the camera.
- When the hero scanner is active, the scan tile is transparent and does not draw a second scan line.
- The transparent camera layer does not add a grey overlay or floating scan line over the hero.
- QR decoding happens inside the transparent hero/tile surface, so the rest of the page stays visible.
- Camera startup now falls back from an ideal environment camera to `video: true`.
- Scanner callbacks are stabilized with `useCallback`.
- Camera errors stay local to the tile and do not break centre search.

## Caution

Do not add scanner state separately to every page. Reuse:

```txt
frontend/src/components/CameraScanLayer.jsx
frontend/src/components/CentreScannerTile.jsx
```

Automatic camera starts are limited to:

- Home hero's 30-second preview window, and only when camera permission is already `granted`.
- Centre page only when opened from Upload with the `autoStartScanner` navigation flag.

Do not add automatic camera starts to other pages without a clear product reason.

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
npm run build --prefix frontend
```

For desktop:

```bash
npm run build:frontend
npm run verify:package
```
