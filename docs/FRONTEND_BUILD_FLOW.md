# Frontend build flow

This repo keeps the real frontend source in `frontend/`.

Electron does not run JSX/source directly. Before packaging, the frontend is built by Vite:

```bash
npm run build --prefix frontend
```

Then the generated `frontend/dist` folder is copied to:

```txt
frontend-dist/
```

The desktop app loads:

```txt
frontend-dist/index.html
```

So the release flow is:

```txt
frontend/src real UI source
        ↓ npm run build --prefix frontend
frontend/dist generated Vite output
        ↓ desktop-shell/scripts/sync-frontend-dist.cjs
frontend-dist bundled desktop UI
        ↓ electron-builder extraResources
Linux AppImage resources/frontend-dist
```

Do not delete `frontend/`. That is the real UI source.
