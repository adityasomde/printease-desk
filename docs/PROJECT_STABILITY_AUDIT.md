# PrintEase Project Stability Audit

Last audited: 2026-06-03

## Scope

This audit covers the desktop release repo at:

```txt
/home/adisssss/Desktop/web_dev/printhub/printease-desk
```

and the MVP web/backend repo at:

```txt
/home/adisssss/Desktop/web_dev/printhub/printease-mvp-main
```

No commit, tag, reset, pull, push, or frontend sync was performed during this audit.

## Repo Map

Desktop repo:

- Remote: `https://github.com/adityasomde/printease-desk.git`
- Branch: `main`
- Desktop shell: `desktop-shell/`
- Desktop frontend source: `frontend/`
- Packaged frontend bundle: `frontend-dist/`
- Release workflow: `.github/workflows/desktop-release.yml`
- Electron loads the UI from `frontend-dist/index.html`, not directly from `frontend/src`.

MVP repo:

- Remote: `https://github.com/Chaitanyavmundhe/printease-mvp.git`
- Branch: `main`
- Backend source: `backend/`
- Web frontend source: `frontend/`

## Exact Root Causes Found

1. Desktop and MVP frontend source are not identical.

   `frontend/src/pages/DesktopAgentPage.jsx` differs between repos. The MVP copy has robust hub-account detection and diagnostics. The desktop copy currently does not.

2. The desktop route does not pass `currentUser` into `DesktopAgentPage`.

   Desktop:

   ```jsx
   <DesktopAgentPage />
   ```

   MVP:

   ```jsx
   <DesktopAgentPage currentUser={currentUser} />
   ```

3. `frontend-dist` is synced to the current desktop source, but that source is behind the MVP source for hub-account button diagnostics.

   The built desktop bundle contains `Register This Desktop` and `Check Windows Print Helper`, but does not contain the newer diagnostic strings:

   - `Login as hub account to register this desktop.`
   - `Detected role:`
   - `isHubAccount:`
   - `Reason button hidden:`

4. The desktop docs contain at least one stale Windows helper path.

   Actual code/package path:

   ```txt
   desktop-shell/vendor/win/SumatraPDF.exe
   ```

   `docs/WINDOWS_PRINTING.md` still mentions the older `vendor/sumatrapdf/SumatraPDF.exe` path.

5. Local generated output exists but is ignored.

   Present local generated folders include:

   - `desktop-shell/release/`
   - `frontend/dist/`
   - `frontend/node_modules/`
   - `desktop-shell/node_modules/`

   These are not tracked by git and should not be committed.

## Source Of Truth Rules

- For shared web UI behavior, MVP `printease-mvp-main/frontend/src` is usually the source of truth.
- For desktop-only runtime behavior, desktop `printease-desk/frontend/src` is allowed to differ.
- Do not blindly copy the entire MVP frontend over desktop. The desktop frontend has desktop-only additions:
  - Hash/file runtime routing
  - route error boundary
  - desktop auth persistence through the preload bridge
  - desktop bridge detection
- For `DesktopAgentPage.jsx`, merge intentionally:
  - keep desktop printer/helper/session controls
  - preserve MVP robust hub-account detection
  - pass `currentUser` from `App.jsx`

## Sync Rules

- Do not run `mvp-to-desk` while desktop-only fixes are unreviewed.
- Use `./sync-shared-frontend.sh status` before applying a sync.
- Use `desk-to-mvp --apply` only when a desktop frontend fix should become shared.
- Use `mvp-to-desk --apply` only after checking that it will not overwrite desktop-specific routing, desktop bridge, auth persistence, or printing helper work.
- Never sync:
  - `.env*`
  - `node_modules/`
  - `dist/`
  - `frontend-dist/`
  - `desktop-shell/`
  - `desktop-shell/release/`
  - backend code into the desktop release repo

## Build Rules

- Edit the real desktop UI in `frontend/src`.
- Rebuild desktop UI with:

  ```bash
  npm run build:frontend
  ```

- This runs the Vite build in `frontend/` and copies `frontend/dist` to `frontend-dist/`.
- Before release, verify that `frontend-dist` contains the expected UI text.
- Do not package from stale `frontend-dist`.

## Release Rules

- GitHub release tags use:

  ```txt
  desktop-v<version>
  ```

- Root `package.json`, `desktop-shell/package.json`, and `desktop-shell/package-lock.json` should match the release version.
- The workflow triggers on:

  ```yaml
  push:
    tags:
      - "desktop-v*"
  ```

- Linux release assets expected:
  - `*.AppImage`
  - `*.AppImage.blockmap`
  - `*.deb`
  - `latest-linux.yml`

- Windows release assets expected:
  - `*.exe`
  - `*.exe.blockmap`
  - `latest.yml`

- The workflow currently uses separate Linux and Windows build jobs, uploads workflow artifacts, then publishes them from one `publish-release` job. This is safer than two jobs writing to the same GitHub Release independently.
- The Windows job verifies that the packaged output includes:

  ```txt
  resources/vendor/win/SumatraPDF.exe
  ```

## How Register This Desktop Can Disappear

The button is controlled by frontend state. Known hide causes:

1. `desktopAvailable` is false.

   The page can show a desktop-shell warning if the preload bridge is not available or the app is not running inside Electron.

2. `agentStatusLoaded` is false.

   The UI shows `Checking saved desktop agent...` until local agent state is loaded.

3. `agentSession?.paired` is true.

   This is expected. If the desktop is already paired, the registration button is hidden.

4. Hub-account detection is too strict or missing.

   The MVP copy has robust detection using `currentUser`, localStorage fallback, role aliases, and hub identity fields. The current desktop copy does not have that logic.

5. `App.jsx` does not pass `currentUser`.

   MVP passes `currentUser`; desktop currently does not.

6. `frontend-dist` is stale.

   Even if `frontend/src` is fixed, Electron will still show the old UI until `npm run build:frontend` refreshes `frontend-dist`.

## How To Test Register This Desktop

1. Build the desktop frontend:

   ```bash
   npm run build:frontend
   ```

2. Confirm `frontend-dist` contains:

   ```txt
   Register This Desktop
   Checking saved desktop agent
   ```

3. If the robust hub-account diagnostics are part of the intended fix, also confirm:

   ```txt
   Login as hub account to register this desktop.
   Detected role:
   isHubAccount:
   Reason button hidden:
   ```

4. Launch the desktop app, login as a hub account, open Desktop Agent, and verify the button is shown when:
   - desktop bridge is available
   - saved agent status finished loading
   - no paired local desktop agent exists

5. If already paired, use the intended clear/reconnect flow, not manual file deletion.

## Backend Integration Findings

- Backend route exists:

  ```txt
  POST /api/hub-agents/desktop/register
  ```

- It is protected by:

  ```js
  authMiddleware
  roleMiddleware('hub')
  ```

- The controller is `registerDesktopDevice` in `backend/src/controllers/desktopController.js`.
- CORS includes a desktop app origin with default:

  ```txt
  app://printease
  ```

- No backend change is required for the button visibility problem. If backend code changes are made later, Render must be redeployed.

## Gitignore And Output Findings

- `frontend-dist/` is intentionally tracked because Electron loads it.
- `desktop-shell/release/`, generated installers, blockmaps, and `latest*.yml` are ignored.
- `desktop-shell/vendor/win/SumatraPDF.exe` is explicitly allowed despite the general `*.exe` ignore rule.
- The desktop repo `.gitignore` also contains a broad `backend/` ignore rule, which matches the policy that backend code must not be bundled into the desktop release repo.

## Current Action Items

1. Merge the robust hub-account detection from MVP `DesktopAgentPage.jsx` into desktop without losing desktop-only printing/helper/session controls.
2. Change desktop `App.jsx` to pass `currentUser` into `DesktopAgentPage`.
3. Rebuild `frontend-dist` after those source changes.
4. Update `docs/WINDOWS_PRINTING.md` to use `desktop-shell/vendor/win/SumatraPDF.exe`.
5. Add a simple pre-release checklist command that greps `frontend-dist` for critical desktop-agent strings.

## Phase 2 Repair Applied

Applied locally after the audit, without commit/tag/push:

- Desktop `frontend/src/pages/DesktopAgentPage.jsx` now includes the MVP robust hub-account detection helpers:
  - `normalizeRole(value)`
  - `getUserRoleInfo(user)`
  - `getStoredUser()`
- The desktop page now evaluates:

  ```js
  const activeUser = currentUser || storedUser;
  const roleInfo = useMemo(() => getUserRoleInfo(activeUser), [activeUser]);
  const isLoggedIn = Boolean(activeUser);
  const isHubAccount = roleInfo.isHubAccount;
  ```

- `Register This Desktop` is now shown only when:

  ```txt
  agentStatusLoaded
  !agentSession?.paired
  isLoggedIn
  isHubAccount
  ```

- Non-hub or missing-account state now shows:

  ```txt
  Login as hub account to register this desktop.
  ```

- Advanced diagnostics now includes:
  - detected normalized role
  - detected account type/source role values
  - `isHubAccount`
  - reason the button is hidden

- Desktop `frontend/src/App.jsx` now passes:

  ```jsx
  <DesktopAgentPage currentUser={currentUser} />
  ```

Why this broke:

- The desktop page was not receiving `currentUser`, so it could not reliably know the logged-in account in Electron runtime.
- The desktop page also lacked the robust MVP role/identity fallback logic, so hub-like accounts could be missed even when a valid user existed.
- Since the register button is gated by account state, agent state, and desktop bridge state, this affected `Register This Desktop` while other UI still rendered.

Prevention rule:

- After any frontend sync or release fix, explicitly check both:
  - `frontend/src/App.jsx` passes `currentUser` to `DesktopAgentPage`.
  - `frontend/src/pages/DesktopAgentPage.jsx` still contains robust role detection and the account diagnostics.
- Then rebuild and grep `frontend-dist` for the registration and diagnostic strings before tagging a release.
