# Desktop Update Model

This document describes the update and release model for PrintEase Desktop.

- The main/source repos (frontend/backend/desktop-shell) are private.
- This public repo contains only packaged desktop resources and the built frontend bundle.
- The desktop app checks GitHub Releases on this repository for updates.
- Updates are downloaded silently and presented to the user; installation happens only when the user confirms.

Do not include backend code or any secret keys in this repository.

## Electron Builder dependency collection

`desktop-shell/package.json` sets:

```json
"packageManager": "traversal@0.0.0"
```

This is an Electron Builder packaging workaround, not a real package manager change. With Electron Builder `26.8.1` and the current npm environment, the default npm dependency collector can fail while parsing the production `node_modules` tree during Linux packaging. The `traversal` value is recognized by Electron Builder's internal collector and makes it walk `node_modules` directly instead of spawning `npm list`.

npm install/ci does not use this value as an executable package manager, so `npm install --prefix desktop-shell`, `npm ci --prefix desktop-shell`, and GitHub Actions remain safe. Revisit and remove this workaround only after upgrading Electron Builder and confirming `npm run dist:linux --prefix desktop-shell` still creates the AppImage, `latest-linux.yml`, and blockmap assets.
