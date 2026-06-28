# Desktop Agent Runtime And Conversion Notes

This document records the desktop agent workflow that must stay intact for
Register This Desktop, heartbeat, printer sync, print jobs, predownload, and
Office-document conversion.

## Runtime Startup

1. The hub owner logs in on the desktop app.
2. `frontend/src/pages/DesktopAgentPage.jsx` calls the backend endpoint
   `POST /api/hub-agents/desktop/register`.
3. The returned agent token is saved through the Electron bridge:
   `desktopAgent:set`.
4. `desktop-shell/src/agent/authStore.js` stores the encrypted credential and
   calls `startAgentRuntime("agent-stored")`.
5. `desktop-shell/src/agent/agentRuntime.js` starts these loops:
   - heartbeat loop
   - printer sync loop
   - paid print job polling loop
   - predownload cache loop
   - conversion loop

The renderer must never depend on the raw stored token. Use the sanitized
session from `desktop-shell/src/state/appState.js`, which derives:

- `paired`
- `heartbeatRunning`
- `printerSyncRunning`
- `polling`
- `predownloadLoopRunning`
- `conversionLoopRunning`
- `autoPrintRunning`

## Conversion Workflow

Office/OpenDocument files are not printed directly.

1. The web/backend marks the uploaded document as requiring desktop preparation.
2. The desktop conversion loop calls:
   `GET /api/agent/conversion-jobs/next`.
3. The desktop downloads the original file and converts it to PDF.
4. The desktop reports the result to:
   `POST /api/agent/preparation-result`.
5. The backend verifies the converted PDF, stores a print-ready file, and
   recalculates affected order pricing.
6. The print queue only becomes eligible after payment is ready and every file
   has a backend-verified print-ready PDF when required.

Do not queue Office originals directly to the printer.

## Verification Workflow

Some hub-side flows use bill verification:

1. Desktop asks `GET /api/agent/jobs/verify`.
2. Desktop reports to `POST /api/agent/jobs/:jobId/verify-result`.
3. Backend confirms/recalculates the bill using
   `backend/src/services/orderConfigurationService.js`.

Keep imports in `backend/src/controllers/agent/agentPreparation.js` relative to
`../../services/...` and `../../db/...`; `../services/...` points to a
non-existent folder from the split controller directory.

## Common Failure Modes

- Windows conversion reports LibreOffice missing:
  check `desktop-shell/agent/printPreparation/conversionEngine.js`. Packaged
  Windows builds must probe both
  `resources/vendor/libreoffice/win/program/soffice.com` and
  `resources/vendor/libreoffice/win/program/soffice.exe`, then local installs
  under `C:\Program Files\LibreOffice`. Do not rely on only one executable
  name.

- Windows conversion starts but LibreOffice exits immediately:
  check the `-env:UserInstallation=...` argument. Windows profile paths must
  be valid file URLs such as `file:///C:/Users/...`, not `file://C:/Users/...`.
  Use `libreOfficeProfile.js` instead of hand-building the URL.

- LibreOffice diagnostic smoke conversion fails:
  this should be reported as diagnostic detail, not treated as proof that the
  converter is missing. A real Office document conversion should still be
  attempted when `soffice --version` proves LibreOffice exists.

- Conversion page says offline although desktop is paired:
  the page is probably ignoring a plain sanitized session event. The bridge
  emits session objects, not always `{ success: true, session }`.

- Heartbeat looks stopped after refresh:
  check `sanitizeAgentSession()` derives timer state from `appState.*Timer`.

- Printer sync warning:
  inspect the backend response from `/api/agent/printers`. The backend must
  normalize local printer states to DB-safe values before inserting into
  `agent_printers`.

- Pending conversions last too long:
  check that the desktop is paired, `conversionLoopRunning` is true,
  LibreOffice diagnostics pass, and `/api/agent/preparation-result` is not
  failing after the PDF is produced.

- Payment collected but no print:
  verify backend readiness in `backend/src/services/printQueueService.js` and
  `backend/src/services/printJobReadinessService.js`. Office files must have a
  print-ready PDF path/hash before queueing.

## Local Checks

Run these before releasing a desktop agent fix:

```bash
npm run build:frontend
npm run verify:package --prefix desktop-shell
node --check desktop-shell/src/state/appState.js
node --check desktop-shell/src/ipc/systemIpc.js
node --check desktop-shell/src/agent/agentRuntime.js
```

For backend controller changes:

```bash
npm test --prefix backend
node --check backend/src/controllers/agent/agentPreparation.js
```
