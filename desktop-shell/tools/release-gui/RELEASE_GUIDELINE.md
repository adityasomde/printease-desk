# PrintEase Desktop Release Guideline

Follow this guide every time before publishing a new desktop version.

---

## 0. Main Release Rule

```text
Never publish directly after code changes.

First:
1. Build frontend.
2. Build unpacked desktop app.
3. Verify package contents.
4. Launch unpacked app manually.
5. Confirm no blank screen.
6. Generate release report.
7. Only then publish.
```

Do **not** publish if the app only "builds successfully." For Electron apps, a successful build can still open as a blank screen if files are missing from the package.

---

## 1. Repositories Involved

You currently have two repositories:

- **Web/MVP Repository**: `Chaitanyavmundhe/printease-mvp`
- **Desktop Repository (Source of Truth)**: `adityasomde/printease-desk`

The desktop repository contains `desktop-shell/`, `frontend/`, the Release GUI, builder configurations, and packaging scripts. Do not mix backend releases and desktop releases in a single commit.

---

## 2. Before Starting Release

### Check Git State
Inside the desktop repository, run:
```bash
git status
git log --oneline -5
```
**Expected**:
- Working tree clean.
- Latest commit is the exact revision you intend to release.
- Do not release from a dirty working tree.

---

## 3. Version Rule

Before building a release, update the version in:
`desktop-shell/package.json` (e.g., `"version": "0.0.36"`).

**Version numbering guide**:
- `v30`: Last known working stable release.
- `v31` - `v35`: Broken/experimental (blank screen issue occurred).
- `v36`: Hotfix version for the blank screen fix.
- `v37`: Next normal release.
- *Rule*: If the previous public release was broken, publish the next version as a hotfix (e.g. `v36.0.1` or `v37.0.0`). Do not reuse a broken version number.

---

## 4. Choose Release Mode

Launch the local GUI tool:
```bash
cd printease-desk/desktop-shell
npm run release:gui
```
Select one of the target modes:

### Linux-only Release
Use when building/testing on a Linux host where Windows packaging cannot be verified.
- **Allowed final report status**: `Linux Ready: YES`, `Windows Ready: NO / Skipped`
- **Recommendation**: Publish Linux only.

### Windows-only Release
Use when running on a Windows workstation or on a platform with Wine configured.
- **Requirements**: Unpacked Windows build passes, package verify passes, and Windows app opens.

### Dual Release
Use only when **both** Windows and Linux builds pass all package verification checks and manual launches.

---

## 5. Build Order

Always execute steps in this exact sequence:
1. **Clean previous build**
2. **Build frontend**
3. **Verify frontend-dist paths**
4. **Build unpacked app**
5. **Verify package files**
6. **Launch unpacked app manually**
7. **Build final release installer**
8. **Generate release report**
9. **Publish manually**

---

## 6. Frontend Build Check

Ensure assets are built using:
```bash
npm run build:frontend
```
Open `desktop-shell/frontend-dist/index.html` and verify references load from relative paths:
- **Correct**: `./assets/...`
- **Incorrect**: `/assets/...` (causes blank screen in packaged apps)

---

## 7. Required Package Files
Every packaged application must contain:
- `frontend-dist/**`
- `security/**` (especially `security/ipcSecurity.js` and `security/urlValidator.js`)
- `config/**`
- `agent/**`
- `printer/**`
- `runtime/**`
- `main.js`, `preload.cjs`, `updater.js`, `package.json`

---

## 8. Excluded Package Files
Desktop packages must **never** contain:
- `.git/`, `docs/`, `*.md`, `README.md`, `ARCHITECTURE.md`
- `backend/`, `frontend/src/`, `tests/`, `coverage/`, `.env`, key/cert files (`*.pem`, `*.pfx`, `*.p12`)
- **Linux Packages**: Exclude `printer/windows/**` and `SumatraPDF`
- **Windows Packages**: Exclude `printer/linux/**`

---

## 9. Linux Release Checklist

1. **Build unpacked**:
   ```bash
   npx electron-builder --config electron-builder.linux.yml --dir
   ```
2. **Verify package**:
   ```bash
   PE_TARGET_PLATFORM=linux npm run verify:package
   ```
3. **Launch unpacked with debug**:
   ```bash
   PE_DEBUG_RENDERER=1 ./dist/linux-unpacked/<app-executable>
   ```
4. **Verify UI**: Check that the app opens, dashboard loads, printer page functions, and no `did-fail-load` or `render-process-gone` errors are thrown.

---

## 10. Windows Release Checklist

1. **Build unpacked**:
   ```bash
   npx electron-builder --config electron-builder.win.yml --dir --win
   ```
2. **Verify package**:
   ```bash
   PE_TARGET_PLATFORM=win32 npm run verify:package
   ```
3. **Launch unpacked**:
   ```powershell
   $env:PE_DEBUG_RENDERER="1"
   .\dist\win-unpacked\PrintEase.exe
   ```
4. **Verify UI**: Check dashboard loading, printer detection, and confirm no renderer load crashes.

---

## 11. Final Release Installer Build

Only run compilation after unpacked testing passes:
- **Linux Dist**: `npm run dist:linux`
- **Windows Dist**: `npm run dist:win`

---

## 12. Manual Sign-Off & Rollback Plan

- **Checklist**: Fill in manual checkbox validation in the Release GUI before generating the sign-off log `desktop-shell/release-checks/release-report-<timestamp>.md`.
- **Emergency Rollback**: If a release fails in production:
  1. Delete broken assets from GitHub.
  2. Mark broken releases as drafts/pre-releases.
  3. Checkout last known working tag (e.g. `git checkout tags/v30.0.0`).
  4. Compile a hotfix version (e.g., `v36.0.1` or `v37.0.0`) from the good commit and update `latest.yml`.
