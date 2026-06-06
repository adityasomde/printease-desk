# Scanner Button Update - 2026-06-07

## Summary

The transparent scan button feature failed because the centre page tried to mix permission detection, live preview, and QR decoding inside the same button. Browser camera permission behavior is inconsistent:

- Chrome often returns `prompt` until a user gesture opens the camera.
- Safari and Firefox may hide camera device labels until permission is granted.
- Strict `environment` camera constraints can fail on laptops or devices without a rear camera.
- Recreated callbacks can restart the camera stream unnecessarily.

## What Changed

- `QRScanner` now supports `previewOnly` mode.
- The centre scan button can show a transparent live camera preview only when permission is already granted.
- Actual QR decoding still happens in the explicit scanner modal after the user taps the button.
- Camera startup now falls back from an ideal environment camera to `video: true`.
- Scanner callbacks are stabilized with `useCallback`.
- Preview errors disable only the preview layer, not the scanner button itself.
- Desktop `frontend-dist` must be rebuilt after this source change.

## Caution

Do not put full QR decoding permanently inside a background button preview. It can scan unexpectedly and it is fragile on mobile browsers. Keep the user-triggered scanner modal as the reliable path.

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
