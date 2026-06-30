# Frontend Sync Cautions

Last updated: 2026-06-30

## Current State

The MVP frontend source and desktop frontend source are currently aligned for shared app code:

```txt
printease-mvp-main/frontend/src
printease-desk/frontend/src
```

The desktop app loads its packaged UI from:

```txt
printease-desk/frontend-dist/
```

After changing `printease-desk/frontend/src`, always rebuild:

```bash
npm run build:frontend
```

## What Broke Recently

The upload page broke because a partial patch added references to:

```txt
modalFile
handleTouchStart
handleTouchEnd
navigate
```

but not all of those values were declared or passed into `UploadPage.jsx`.

The fix added:

- `modalFile` state.
- long-press timer ref.
- touch/mouse handlers for per-file configuration.
- `navigate` prop support.
- safe handling when the file picker is cancelled and returns no file.

## Sync Rules

Before syncing shared frontend code:

1. Run a diff first.
2. Do not sync generated folders except `frontend-dist` after a desktop build.
3. Do not sync secrets.
4. Do not sync backend code into the desktop repo.
5. Do not overwrite `desktop-shell/`.
6. Do not use stale one-off patch scripts as application code.
7. Keep session/local-cache fixes synced between MVP and desktop frontend.

Shared files that currently must stay aligned:

```txt
frontend/src/App.jsx
frontend/src/AppRouter.jsx
frontend/src/pages/ConversionPage.jsx
frontend/src/pages/HistoryPage.jsx
frontend/src/pages/HubPrinterAgentPage.jsx
frontend/src/pages/UserDashboard.jsx
frontend/src/utils/desktopBridge.js
frontend/src/utils/localDb.js
frontend/src/utils/localHistory.js
```

The old `frontend/split_router.cjs` helper was removed. It was a one-time extraction script and still referenced deleted auth props, so do not recreate it.

Order caches are now role/user scoped:

```txt
orders_user_<user_id>
orders_hub_<user_id>
```

Logout clears active order ids and order access tokens. Do not remove that cleanup, or a later login on the same browser/desktop install can see stale payment/order state.

Never sync or commit:

```txt
node_modules/
frontend/dist/
desktop-shell/release/
.env
.env.*
*.AppImage
*.deb
*.exe
*.blockmap
latest.yml
latest-linux.yml
```

## Required Checks

For desktop frontend changes:

```bash
npm run build:frontend
npm run verify:package
```

The Vite large chunk warning is currently non-blocking. Treat actual compile/runtime errors as blocking.
