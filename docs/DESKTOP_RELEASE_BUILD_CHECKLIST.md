# Desktop Release Build Checklist

Use this checklist before pushing a `desktop-v*` tag.

## Current release state

- `desktop-v0.1.35` built successfully in GitHub Actions for Linux and Windows.
- The local launch collapse found after that release was caused by the shell environment setting `ELECTRON_RUN_AS_NODE=1`.
- The desktop launch scripts now use `desktop-shell/scripts/run-electron-app.cjs`, which clears `ELECTRON_RUN_AS_NODE` before starting Electron.
- Electron is pinned to `33.0.0` so local and CI builds do not silently float to a newer major Electron version.

## Before a release tag

Run from the repo root:

```bash
npm install --prefix frontend
npm install --prefix desktop-shell
npm run build:frontend
npm run verify:package --prefix desktop-shell
```

Then launch the app locally:

```bash
npm run start --prefix desktop-shell
```

Confirm:

- The desktop window opens and stays open.
- The preload bridge loads.
- The console shows `Register This Desktop`, `Auto-print`, or other expected desktop UI strings from `frontend-dist`.
- No startup crash happens before the first window is visible.

Stop the local app before continuing.

## Linux build check

Before tagging a Linux-capable release, run:

```bash
npm run dist:linux
```

Expected ignored output under `desktop-shell/release/`:

- `.AppImage`
- `.AppImage.blockmap`
- `.deb`
- `latest-linux.yml`

Do not commit release output.

## Windows build check

Do not build Windows locally on Linux unless a Windows build environment is intentionally configured.

The Windows installer is built by GitHub Actions on `windows-latest`. The workflow must publish:

- `PrintEase-Desktop-Setup-<version>.exe`
- `.exe.blockmap`
- `latest.yml`

The Windows job also checks that the packaged output contains:

```txt
resources/vendor/win/SumatraPDF.exe
```

## Tag flow

Only tag after local launch and package checks pass:

```bash
git tag desktop-v<version>
git push origin desktop-v<version>
```

Do not reuse a tag version. If a bad release tag was already pushed, bump the version and create the next tag.

## Do not commit

Never commit:

- `node_modules/`
- `.env` files
- `desktop-shell/release/`
- `.AppImage`
- `.deb`
- generated installer `.exe`
- `.blockmap`
- `latest.yml`
- `latest-linux.yml`

The only committed `.exe` allowed in this repo is:

```txt
desktop-shell/vendor/win/SumatraPDF.exe
```
