# PrintEase Desktop Release Builder GUI

This directory contains a local developer tool designed to simplify, automate, and verify the build, packaging, and testing process for PrintEase Desktop.

## Important Note

> [!WARNING]
> This tool is **strictly for local use**. It does not perform automated publishing, upload GitHub releases, or generate update `latest.yml` files. All uploads and publishing steps must be manually initiated and confirmed.

---

## Getting Started

To run the builder GUI locally:

1. Open a terminal in `desktop-shell`.
2. Run the command:
   ```bash
   npm run release:gui
   ```
   *Note: This command runs with `--no-sandbox` to ensure compatibility across developer workstations.*

---

## Detailed Step Operations

The interface runs a structured 12-step sequence:

### 1. Clean previous build
Invokes recursive JS deletions on `release`, `frontend/dist` and `frontend-dist` folders, ensuring no stale build cache or config files are packed.

### 2. Build frontend
Compiles the React production bundle under the `/frontend` subfolder.

### 3. Sync frontend-dist
Synchronizes build assets to the root `frontend-dist` workspace.

### 4. Verify frontend-dist/index.html paths
Inspects `frontend-dist/index.html` to confirm references load from relative paths (`./assets/...`) and not absolute paths (`/assets/...`). Absolute path resolution causes production blank-screen bugs when loading assets via Electron's `file://` protocol.

### 5. Build Linux unpacked directory
Assembles package resources inside `release/linux-unpacked/` using `electron-builder` without creating a compressed AppImage installer yet.

### 6. Verify Linux package files
Runs local audits checking that:
- `security/ipcSecurity.js` and `security/urlValidator.js` exist in the bundle.
- Linux CUPS printer files are included.
- Windows binaries and SumatraPDF are excluded.
- The standard `verify:package` CLI script passes.

### 7. Launch Linux unpacked app with PE_DEBUG_RENDERER=1
Launches the built unpacked app for immediate manual UI checks, exposing DevTools and log streams to diagnose any issues.

### 8. Build Windows unpacked directory
Assembles package resources inside `release/win-unpacked/` using `electron-builder` without packaging.

### 9. Verify Windows package files
Validates:
- `security/ipcSecurity.js` and `security/urlValidator.js` exist in the bundle.
- SumatraPDF.exe and Windows printer code are included.
- Linux printer code is excluded.
- The standard `verify:package` CLI script passes.

### 10. Build final Linux release artifact
Produces the final distributable AppImage and Debian package. Enabled only when Linux safety checks pass.

### 11. Build final Windows release artifact
Produces the final Windows `.exe` setup installer. Enabled only when Windows safety checks pass.

### 12. Generate release checklist report
Generates a markdown checklist report detailing the release state, artifact sizes, automated gate outcomes, manual checks, and final recommendations. Saves report to:
`desktop-shell/release-checks/release-report-<timestamp>.md`

---

## Safety Gate Requirements

The final build buttons (10 & 11) and report generation remain disabled until:
- **Vite Path Verification**: Relative pathings (`./assets/`) are confirmed.
- **Security inclusions**: Security modules must be validated inside the `app.asar` package.
- **OS-specific drivers**: Proper OS scripts/binaries must be present and wrong platform scripts excluded.
- **Manual Launch Sign-off**: Developers must check off the manual app tests (unpacked app opens, dashboard loads, printer page opens, no blank screen, and clean process logs).

---

## How to Rollback to Known Working v30

If a release hotfix fails or a blank screen is encountered on staging/production, roll back the codebase to the stable v30 branch/commit:

1. Commit or stash any outstanding local changes.
2. Find the stable v30 commit SHA:
   ```bash
   git log --grep="v30"
   ```
3. Checkout the specific commit or release tag:
   ```bash
   git checkout tags/desktop-v0.1.30 # or git checkout <v30-sha>
   ```
4. Perform a full clean build and package verification sequence using this tool:
   - Run **Clean previous build**
   - Run **Build frontend**
   - Run **Sync frontend-dist**
   - Verify index paths
   - Repack and run local testing.
