# PrintEase Desktop Linux App

This repo is the desktop app/update repo for PrintEase.

It contains:

- `frontend/` — the real React/Vite frontend source.
- `frontend-dist/` — generated desktop UI bundle copied from `frontend/dist`.
- `desktop-shell/` — Electron desktop shell, local printer bridge, Linux CUPS support, and updater.

The packaged app loads `frontend-dist/index.html` locally, then calls the pinned Render backend:

```txt
https://printease-backend-byex.onrender.com
```

The updater checks GitHub Releases from:

```txt
https://github.com/adityasomde/printease-desk
```

## Local test on Linux

```bash
npm ci --prefix frontend
npm ci --prefix desktop-shell
npm run build:frontend
npm run dev --prefix desktop-shell
```

## Build Linux release locally

```bash
npm run dist:linux
```

## Release update through GitHub

Push to `adityasomde/printease-desk`, then tag:

```bash
git tag desktop-v0.1.39
git push origin main
git push origin desktop-v0.1.39
```

GitHub Actions builds and uploads the `.AppImage`, `.deb`, `.blockmap`, and `latest-linux.yml` release files.

> [!IMPORTANT]
> **REMINDER**: The automated GitHub Actions workflow will only create a **DRAFT** release. You must download and test the built installer artifacts (AppImage, deb, exe) to confirm they run without a blank screen, and then manually edit the draft and click **Publish release** on GitHub.

For Linux auto-update, distribute the `.AppImage` from GitHub Releases.
