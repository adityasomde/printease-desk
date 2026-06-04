# PrintEase Development & Synchronization Protocol

This document outlines the strict procedures that must be followed before committing, pushing, or releasing code across the PrintEase MVP (web backend/frontend) and Desktop (Electron) repositories.

## 1. Environment & State Expectations

### Authentication
- Active login must remain backend username/email + password.
- Email is optional and unverified.
- Phone is hidden from the authentication UI.
- Google Auth is disabled/reserved for future implementation.
- Username constraints: lowercase letters + numbers only.
- Roles: `user` and `hub` registration flows must exist.
- Security: Backend verifies via `bcrypt` password hashes and issues app JWTs.
- **CRITICAL**: Do NOT reintroduce active Supabase Auth dependencies or expose error messages like `"Auth is not configured. Set VITE_SUPABASE_URL"`.

### QR / Centre Flow
- Hub Dashboard contains the centre QR upload link.
- The QR link directs to `/upload?centre=<code>`.
- The upload page auto-selects the centre from the URL parameters.
- Centre page features a QR camera scanner with manual fallback.
- Search functionality by centre name/code/status must be maintained.

### Desktop Environment
- "Register This Desktop" feature must remain functional.
- The `currentUser` object must be passed into `DesktopAgentPage`.
- Hub role detection must be robust and error-free.
- Auto-print and Restart Auto-print toggles must exist.
- Manual printer pairing fallback and advanced diagnostics must be available.
- Desktop background polling/agent runtime must remain intact.
- Desktop agent token authentication is strictly separated from user login tokens.

## 2. Pre-Flight Checks & Synchronization Safety

### Sync Protocol Warnings (The "More Sync Protocol")
Before syncing frontends between the MVP and Desktop repositories, consider these risks:
1. **Accidental Overwrites**: Desktop-specific variables or assets in `printease-desk/frontend` might be overwritten by generic MVP code.
2. **Missing Files**: `desktop-shell/`, `frontend-dist/`, and `.env` files must **never** be synced from MVP to Desktop.
3. **Build Dependencies**: Always verify `package.json` differences before running `npm install` post-sync.
4. **Action**: Use `./sync-shared-frontend.sh status` to safely preview changes without applying them. Never use raw `cp` or `rsync` directly.

### Command Execution
If the frontend is updated:
1. Rebuild the MVP frontend: `cd printease-mvp-main/frontend && npm run build`
2. Sync the changes (using the script).
3. Rebuild the Desktop frontend: `cd printease-desk && npm run build:frontend`

## 3. Post-Build String Validation

Before pushing any code, run these string checks in the Desktop repository:
- Ensure presence of core desktop logic: `grep -Rni "Username or email\|Register This Desktop\|Auto-print\|Restart Auto Print" frontend-dist`
- Ensure absence of deprecated auth: `grep -Rni "Auth is not configured\|VITE_SUPABASE_URL\|Phone (optional)" frontend-dist`

## 4. Final Reporting & Git Flow

Before `git push` or `git tag`, generate a final report answering:
1. What was changed?
2. What was built?
3. What was tested (and not tested)?
4. Status of MVP and Desktop Git working trees.
5. Did the backend change?
6. Are Render, Vercel, or Supabase redeploys/migrations required?
7. Was a desktop release created? What is the version tag?
8. Known risks and next actions.

**Do NOT commit, push, or release without verifying all items in this protocol.**
