# PrintEase Desktop Simple Release Guide

This document explains the simplified automated release process for PrintEase Desktop.

---

## The Normal Release Workflow

To publish a release, run the following simple commands:

### 1. Prepare Release Version
```bash
npm run release:prepare -- 0.1.37
```
Bumps version in both root and `desktop-shell` files, updating locks.

### 2. Commit and Push
```bash
git add .
git commit -m "release: prepare desktop v0.1.37"
git push
```

### 3. Local Confidence Verification
```bash
npm run release:test:linux
```
Compiles and tests the Linux build locally. Confirms the app boots with a manual YES/NO check.

### 4. Trigger CI Release
```bash
npm run release:tag -- 0.1.37
```
Pushes version tag `v0.1.37` to GitHub, kicking off the Actions runner.

---

## 1. Purpose
GitHub Actions automatically builds the final binaries for Linux + Windows and creates a single **Draft GitHub Release** to hold all files.

## 2. Why Draft Release?
Automated builds can pass even when runtime code fails (e.g. blank screen issues). Keeping the release as a Draft ensures users never receive broken code until you download and verify the builds.

## 3. Manual Release Checkoff
Download the draft release binaries and verify:
- **Linux (`.AppImage` / `.deb`)**: Standalone runs, no blank screen, dashboard/printer pages open.
- **Windows (`.exe`)**: Installer runs, no blank screen, dashboard/printer pages open.

## 4. Platform Rollback
If one platform fails, publish a single-platform release instead of dual. If a published version has critical bugs, mark it pre-release/draft on GitHub and prepare a hotfix (e.g. `0.1.38`).

## 5. Version Rules
- Never reuse broken version numbers.
- Root and `desktop-shell` versions must match.
- Pushed tag must match the version exactly.
- Exclude developer tools (such as `tools/release-gui/`) in all packaged builds automatically via config files.
