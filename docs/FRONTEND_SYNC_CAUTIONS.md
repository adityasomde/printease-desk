# Frontend Sync Cautions

Last updated: 2026-06-07

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
