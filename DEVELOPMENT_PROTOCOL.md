# PrintEase Development Protocol

This document outlines the standard operating procedures for developing, syncing, building, and deploying changes to the PrintEase MVP and Desktop repositories.

## 1. Syncing Frontends
The `printease-mvp-main/frontend` and `printease-desk/frontend` share core business logic and UI code.
- **Direction:** Always make frontend changes in the `printease-mvp-main/frontend` repository first.
- **Syncing:** Use the `sync-shared-frontend.sh` script located in `printease-desk`.
  - To check differences: `./sync-shared-frontend.sh`
  - To apply MVP changes to Desktop: `./sync-shared-frontend.sh mvp-to-desk --apply`
  - To apply Desktop changes to MVP (rare): `./sync-shared-frontend.sh desk-to-mvp --apply`

## 2. Building
- **Frontend / Backend:**
  - Standard `npm run build` is used in `frontend/` directory to generate standard web bundles.
  - Render handles backend build automatically upon commit to `main`.
- **Desktop Application (Electron):**
  - Use `npm run build:win` to generate Windows `.exe` installers.
  - The build output is placed in `dist/`.

## 3. Handling Changes & Documentation
- Document any significant changes in the relevant repository's `README.md` or a changelog.
- Commit messages should be clear and describe why a change was made.
- Ensure any modifications to `.env` requirements are documented.

## 4. Error Handling and Sensitive Points
- **Sensitive Points:**
  - Never commit actual `.env` files. Ensure secrets (e.g., Supabase URLs, Render keys) remain out of the repository.
  - The `sync-shared-frontend.sh` script automatically scans for hardcoded secrets before allowing a sync. Do not bypass this mechanism.
- **Error Tracking:**
  - Common frontend errors (e.g., CORS, auth state wiping) should be traced via the browser network tab.
  - If a bug occurs on both web and desktop, root cause it on the web first, then sync the fix.

## 5. Building Releases
- To build the app *without* publishing to GitHub Releases, simply use `npm run build:win` or equivalent platform scripts.
- To cut a new official release, you must ensure the `version` in `package.json` is updated and push a git tag (e.g., `v1.0.1`), allowing the release script to handle distribution. Do NOT push unverified builds as releases.
