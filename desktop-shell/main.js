import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import electron from "electron";
import { registerIpcHandlers } from "./src/ipc/handlers.js";

import { runPredownloadNow, pollJobsNow, runConversionNow, startAgentRuntime, stopAgentRuntime, syncAgentPrinters, pollAgentOnce, startAgentPolling, stopAgentPolling } from "./src/services/pollingService.js";
import { getStoredDesktopAuth, setStoredDesktopAuth, clearStoredDesktopAuth, getStoredDesktopAgent, setStoredDesktopAgent, restoreStoredDesktopAgent, clearStoredDesktopAgent, migrateFileLocalStorageAuth, ensureDeviceIdentity, sanitizeAgentSession, startAgentPairing, confirmAgentPairing, sendAgentHeartbeat, applyStoredAgentToSession, getDesktopAuthPath, getDesktopAgentPath, normalizeDesktopAuthPayload, encodeDesktopAuth, decodeDesktopAuth, normalizeDesktopAgentPayload } from "./src/services/authService.js";
import { diagnoseWindowsPrintHelperSafe, diagnoseLibreOfficeSafe, checkBackendHealth, reportPrinterDiagnostic, syncPrintersToCloud, applyPrinterDiscoveryResult, refreshLocalPrinterResult, syncLatestPrinterStatus, selectDesktopPrinter } from "./src/services/diagnosticService.js";
import { diagnosePrinters, listPrinters, stopPrinting, testPrint } from "./printer/printExecutor.js";
import { findLibreOfficeExecutable, LIBREOFFICE_MANUAL_DOWNLOAD_URL } from "./agent/printPreparation/conversionEngine.js";
import { confirmPairing, sendHeartbeat, startPairing } from "./agent/heartbeat.js";
import { cleanupDocumentCache, findCachedDocument, getDocumentCacheDirectory, getDocumentCacheMaxAgeDays, getDocumentCacheMaxSizeBytes, setDocumentCacheDirectory } from "./agent/documentCache.js";
import { predownloadPendingDocuments, processNextJob, processNextConversionJob } from "./agent/jobPoller.js";
import { syncPrinters } from "./agent/statusReporter.js";
import { getApiBaseUrl, getBackendUrl } from "./config/backend.js";
import { loadConfig, saveConfig, setConfigDirectory } from "./local/config.js";
import { checkForUpdates, getUpdateStatus, initializeUpdater, installUpdateNow } from "./updater.js";
import { secureHandle } from "./security/ipcSecurity.js";
import { isSafeApprovalUrl } from "./security/urlValidator.js";
const {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  net,
  protocol,
  safeStorage,
  session,
  shell
} = electron;
protocol.registerSchemesAsPrivileged([{
  scheme: "app",
  privileges: {
    standard: true,
    secure: true,
    supportFetchAPI: true,
    corsEnabled: true
  }
}]);
const DEV_FRONTEND_URL = process.env.PRINTEASE_FRONTEND_URL || "http://127.0.0.1:5175";
const USE_DEV_FRONTEND = process.env.PRINTEASE_USE_DEV_FRONTEND === "1";
const VERSION = "0.1.78";
const HEARTBEAT_INTERVAL_MS = 25000;
const PRINTER_SYNC_INTERVAL_MS = 30000;
const JOB_POLL_INTERVAL_MS = 5000;
const PREDOWNLOAD_INTERVAL_MS = 90000;
const DESKTOP_PROTOCOL_ORIGIN = "app://printease";
const DESKTOP_AUTH_FILE = "desktop-auth.json";
const DESKTOP_AGENT_FILE = "desktop-agent.json";
const STARTUP_LOG_FILE = "startup.log";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PRELOAD_PATH = path.join(__dirname, "preload.cjs");
let mainWindow = null;
let ipcHandlersRegistered = false;
let latestPrinterResult = null;
let heartbeatTimer = null;
let printerSyncTimer = null;
let jobPollTimer = null;
let predownloadTimer = null;
let conversionTimer = null;
let isPollingJobs = false;
let isPredownloading = false;
let isConverting = false;
let agentSession = {
  deviceId: "",
  deviceName: "",
  pairingCode: "",
  pairingSessionId: "",
  expiresAt: "",
  agentId: "",
  hubId: "",
  accessToken: "",
  pairedAt: "",
  lastHeartbeatAt: "",
  lastHeartbeatError: "",
  selectedPrinterName: "",
  lastPrinterSyncAt: "",
  lastPrinterSyncError: "",
  lastJobPollAt: "",
  lastJobPollError: "",
  lastJobPollMessage: "",
  predownloadRunning: false,
  predownloadLoopRunning: false,
  lastPredownloadAt: "",
  lastPredownloadError: "",
  lastPredownloadMessage: "",
  lastPredownloadChecked: 0,
  lastPredownloadCached: 0,
  lastPredownloadFailures: 0,
  lastConversionMessage: "",
  lastConversionError: "",
  lastConversionAt: "",
  converterPath: ""
};
function serializeStartupError(error) {
  if (!error) return "";
  return error.stack || error.message || String(error);
}
function getStartupLogPath() {
  try {
    const userData = app.getPath("userData");
    fs.mkdirSync(userData, {
      recursive: true
    });
    return path.join(userData, STARTUP_LOG_FILE);
  } catch {
    return path.join(os.tmpdir(), `printease-desktop-${STARTUP_LOG_FILE}`);
  }
}
function writeStartupLog(event, detail = {}) {
  const entry = {
    at: new Date().toISOString(),
    event,
    version: VERSION,
    packaged: app.isPackaged,
    platform: process.platform,
    arch: process.arch,
    ...detail
  };
  try {
    fs.appendFileSync(getStartupLogPath(), `${JSON.stringify(entry)}\n`, "utf8");
  } catch {
    // Last-resort startup diagnostics should never crash the app.
  }
}
async function runStartupStep(name, task) {
  writeStartupLog(`${name}:start`);
  try {
    const result = await task();
    writeStartupLog(`${name}:ok`);
    return result;
  } catch (error) {
    writeStartupLog(`${name}:failed`, {
      error: serializeStartupError(error)
    });
    console.warn(`[DESKTOP STARTUP] ${name} failed`, error?.stack || error?.message || error);
    return null;
  }
}
process.on("uncaughtException", error => {
  writeStartupLog("uncaughtException", {
    error: serializeStartupError(error)
  });
  console.error("[DESKTOP UNCAUGHT EXCEPTION]", error);
});
process.on("unhandledRejection", reason => {
  writeStartupLog("unhandledRejection", {
    error: serializeStartupError(reason)
  });
  console.error("[DESKTOP UNHANDLED REJECTION]", reason);
});
function getProductionIndexPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "frontend-dist", "index.html");
  }
  const bundledIndex = path.join(__dirname, "..", "frontend-dist", "index.html");
  if (fs.existsSync(bundledIndex)) return bundledIndex;

  // Development fallback: after `npm run build --prefix frontend`, Vite outputs here.
  return path.join(__dirname, "..", "frontend", "dist", "index.html");
}
function getFrontendDistRoot() {
  return path.dirname(getProductionIndexPath());
}
function getDesktopAppUrl() {
  return `${DESKTOP_PROTOCOL_ORIGIN}/index.html`;
}
function getFrontendBundleDiagnostics() {
  const indexPath = getProductionIndexPath();
  const frontendRoot = path.dirname(indexPath);
  const assetsPath = path.join(frontendRoot, "assets");
  let assetSample = [];
  try {
    if (fs.existsSync(assetsPath)) {
      assetSample = fs.readdirSync(assetsPath).slice(0, 12);
    }
  } catch (error) {
    assetSample = [`Could not read assets: ${error.message || error}`];
  }
  return {
    isPackaged: app.isPackaged,
    appPath: app.getAppPath(),
    resourcesPath: process.resourcesPath,
    indexPath,
    indexExists: fs.existsSync(indexPath),
    frontendRoot,
    assetsPath,
    assetsExists: fs.existsSync(assetsPath),
    assetSample,
    protocolUrl: getDesktopAppUrl()
  };
}
function isPathInside(parentPath, childPath) {
  const relative = path.relative(parentPath, childPath);
  return relative === "" || !relative.startsWith("..") && !path.isAbsolute(relative);
}
function registerDesktopProtocol() {
  protocol.handle("app", async request => {
    const frontendRoot = getFrontendDistRoot();
    try {
      const requestUrl = new URL(request.url);
      if (requestUrl.hostname !== "printease") {
        return new Response("Not found", {
          status: 404
        });
      }
      const requestedPath = decodeURIComponent(requestUrl.pathname || "/");
      if (requestedPath.startsWith("/cache/")) {
        const documentId = requestedPath.replace(/^\/cache\/+/, "");
        const cachedDocumentPath = await findCachedDocument(documentId);
        const cacheRoot = getDocumentCacheDirectory();
        if (!cachedDocumentPath || !isPathInside(cacheRoot, cachedDocumentPath)) {
          return new Response("Cached document not found", {
            status: 404
          });
        }
        return net.fetch(pathToFileURL(cachedDocumentPath).toString());
      }
      const relativePath = requestedPath === "/" ? "index.html" : requestedPath.replace(/^\/+/, "");
      const candidatePath = path.normalize(path.join(frontendRoot, relativePath));
      if (!isPathInside(frontendRoot, candidatePath)) {
        return new Response("Forbidden", {
          status: 403
        });
      }
      if (fs.existsSync(candidatePath) && fs.statSync(candidatePath).isFile()) {
        return net.fetch(pathToFileURL(candidatePath).toString());
      }
      if (!path.extname(candidatePath)) {
        return net.fetch(pathToFileURL(getProductionIndexPath()).toString());
      }
      return new Response("Not found", {
        status: 404
      });
    } catch (error) {
      console.warn("[DESKTOP PROTOCOL FAILED]", error?.message || error);
      return net.fetch(pathToFileURL(getProductionIndexPath()).toString());
    }
  });
}
function getDevServerErrorHtml() {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>PrintEase Desktop</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: #f8fafc;
        color: #0f172a;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      main {
        width: min(640px, calc(100vw - 48px));
        border: 1px solid #e2e8f0;
        border-radius: 18px;
        background: #fff;
        padding: 32px;
        box-shadow: 0 20px 45px rgba(15, 23, 42, 0.08);
      }
      h1 {
        margin: 0 0 12px;
        font-size: 28px;
      }
      p {
        color: #475569;
        line-height: 1.6;
      }
      pre {
        overflow-x: auto;
        border-radius: 12px;
        background: #0f172a;
        color: #e2e8f0;
        padding: 16px;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>PrintEase frontend bundle was not found</h1>
      <p>PrintEase Desktop normally loads <strong>frontend-dist/index.html</strong>. Make sure the built frontend bundle exists, then reopen the desktop shell.</p>
      <p>To intentionally use a Vite dev server, start it separately and relaunch with:</p>
      <pre>PRINTEASE_USE_DEV_FRONTEND=1 npm run dev --prefix desktop-shell</pre>
    </main>
  </body>
</html>`;
}
async function loadFrontend(window) {
  const localIndex = getProductionIndexPath();
  const bundleDiagnostics = getFrontendBundleDiagnostics();
  console.log("[DESKTOP FRONTEND BUNDLE]", bundleDiagnostics);
  writeStartupLog("frontend-bundle", bundleDiagnostics);
  if (app.isPackaged) {
    try {
      await window.loadURL(getDesktopAppUrl());
    } catch (error) {
      console.warn("[DESKTOP APP PROTOCOL LOAD FAILED]", error?.message || error);
      await window.loadFile(localIndex);
    }
    return;
  }
  if (!USE_DEV_FRONTEND && fs.existsSync(localIndex)) {
    await window.loadFile(localIndex);
    return;
  }
  try {
    await window.loadURL(DEV_FRONTEND_URL);
  } catch {
    if (fs.existsSync(localIndex)) {
      await window.loadFile(localIndex);
      return;
    }
    await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(getDevServerErrorHtml())}`);
  }
}
function isAgentPaired() {
  return Boolean(agentSession.accessToken && agentSession.agentId && agentSession.hubId);
}
function emitAgentSession() {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send("agent:updated", sanitizeAgentSession());
    }
  }
}
function emitPrinterResult(result) {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send("printers:updated", result);
    }
  }
}
function reportStartupPrinterDiagnostics() {
  refreshLocalPrinterResult("desktop:startup-list").then(result => {
    console.log("[DESKTOP STARTUP PRINTERS]", JSON.stringify(result, null, 2));
  }).catch(error => {
    console.warn("[DESKTOP STARTUP PRINTERS FAILED]", error.message || error);
  });
  diagnosePrinters().then(async result => {
    console.log("[DESKTOP STARTUP PRINTER DIAGNOSTICS]", JSON.stringify(result, null, 2));
    await reportPrinterDiagnostic("desktop:startup-diagnose", result);
  }).catch(error => {
    console.warn("[DESKTOP STARTUP PRINTER DIAGNOSTICS FAILED]", error.message || error);
  });
}
function findPrinterByName(printerResult, printerName) {
  const printers = Array.isArray(printerResult?.printers) ? printerResult.printers : [];
  return printers.find(printer => printer.printerName === printerName || printer.systemPrinterId === printerName || printer.displayName === printerName) || null;
}
function resolveLocalPrinterName() {
  if (agentSession.selectedPrinterName) return agentSession.selectedPrinterName;
  if (!latestPrinterResult) return "";
  const printers = Array.isArray(latestPrinterResult.printers) ? latestPrinterResult.printers : [];
  const preferred = printers.find(printer => printer.isDefault) || latestPrinterResult.defaultPrinter;
  return preferred?.printerName || printers[0]?.printerName || "";
}
function requirePairedAgent() {
  if (!agentSession.accessToken) {
    return {
      success: false,
      message: "Pair this desktop with a print hub before using agent actions.",
      session: sanitizeAgentSession()
    };
  }
  return null;
}
function startHeartbeatLoop() {
  if (!isAgentPaired()) {
    return {
      success: false,
      message: "Pair desktop before starting heartbeat.",
      session: sanitizeAgentSession()
    };
  }
  if (heartbeatTimer) {
    console.log("[DESKTOP AGENT BACKGROUND] already running heartbeat");
    return {
      success: true,
      message: "Heartbeat loop is already running.",
      session: sanitizeAgentSession()
    };
  }
  heartbeatTimer = setInterval(() => {
    sendAgentHeartbeat().catch(error => {
      agentSession.lastHeartbeatError = error.message || "Heartbeat failed.";
      emitAgentSession();
      console.warn("[DESKTOP HEARTBEAT FAILED]", error.message || error);
    });
  }, HEARTBEAT_INTERVAL_MS);
  heartbeatTimer.unref?.();
  emitAgentSession();
  return {
    success: true,
    message: "Heartbeat loop started.",
    session: sanitizeAgentSession()
  };
}
function startPrinterSyncLoop() {
  if (!isAgentPaired()) {
    return {
      success: false,
      message: "Pair desktop before starting cloud printer sync.",
      session: sanitizeAgentSession()
    };
  }
  if (printerSyncTimer) {
    console.log("[DESKTOP AGENT BACKGROUND] already running printer sync");
    return {
      success: true,
      message: "Printer sync loop is already running.",
      session: sanitizeAgentSession()
    };
  }
  printerSyncTimer = setInterval(() => {
    syncLatestPrinterStatus("agent:printer-sync-loop").catch(error => {
      agentSession.lastPrinterSyncError = error.message || "Printer sync failed.";
      emitAgentSession();
      console.warn("[DESKTOP PRINTER SYNC FAILED]", error.message || error);
    });
  }, PRINTER_SYNC_INTERVAL_MS);
  printerSyncTimer.unref?.();
  emitAgentSession();
  return {
    success: true,
    message: "Printer sync loop started.",
    session: sanitizeAgentSession()
  };
}
function startPredownloadLoop(reason = "manual-start", payload = {}) {
  const pairingError = requirePairedAgent();
  if (pairingError) return pairingError;
  if (predownloadTimer) {
    return {
      success: true,
      message: "Predownload loop is already running.",
      session: sanitizeAgentSession()
    };
  }
  const intervalMs = Math.max(60000, Number(payload.predownloadIntervalMs) || PREDOWNLOAD_INTERVAL_MS);
  predownloadTimer = setInterval(() => {
    runPredownloadNow("predownload-loop").catch(error => {
      console.warn("[DESKTOP AGENT BACKGROUND] predownload fail", error.message || error);
    });
  }, intervalMs);
  predownloadTimer.unref?.();
  agentSession.predownloadLoopRunning = true;
  runPredownloadNow(reason).catch(error => {
    console.warn("[DESKTOP AGENT BACKGROUND] initial predownload fail", error.message || error);
  });
  console.log("[DESKTOP AGENT BACKGROUND] predownload loop started", {
    reason,
    intervalMs
  });
  return {
    success: true,
    message: "Predownload loop started.",
    intervalMs,
    session: sanitizeAgentSession()
  };
}
function startConversionLoop(reason = "manual-start") {
  const pairingError = requirePairedAgent();
  if (pairingError) return pairingError;
  if (conversionTimer) return {
    success: true,
    message: "Conversion loop is already running."
  };
  conversionTimer = setInterval(() => {
    runConversionNow("conversion-loop").catch(() => {});
  }, 4000);
  conversionTimer.unref?.();
  runConversionNow(reason).catch(() => {});
  return {
    success: true,
    message: "Conversion loop started."
  };
}
function startJobPollLoop(reason = "manual-start", payload = {}) {
  const pairingError = requirePairedAgent();
  if (pairingError) return pairingError;
  if (jobPollTimer) {
    console.log("[DESKTOP AGENT BACKGROUND] already running job polling", {
      reason
    });
    return {
      success: true,
      message: "Job polling is already running.",
      session: sanitizeAgentSession()
    };
  }
  const intervalMs = Math.max(3000, Number(payload.intervalMs) || JOB_POLL_INTERVAL_MS);
  jobPollTimer = setInterval(() => {
    pollJobsNow("job-poll-loop").catch(error => {
      agentSession.lastJobPollError = error.message || "Job poll failed.";
      emitAgentSession();
      console.warn("[DESKTOP AGENT BACKGROUND] job poll fail", agentSession.lastJobPollError);
    });
  }, intervalMs);
  jobPollTimer.unref?.();
  pollJobsNow(reason, payload).catch(error => {
    agentSession.lastJobPollError = error.message || "Initial job poll failed.";
    emitAgentSession();
  });
  console.log("[DESKTOP AGENT BACKGROUND] job polling started", {
    reason,
    intervalMs,
    selectedPrinterName: payload.printerName || resolveLocalPrinterName() || null
  });
  emitAgentSession();
  return {
    success: true,
    message: "Job polling started.",
    intervalMs,
    session: sanitizeAgentSession()
  };
}
function isAllowedNavigation(url) {
  if (url.startsWith("data:text/html")) return true;
  if (url.startsWith(DESKTOP_PROTOCOL_ORIGIN)) return true;
  if (app.isPackaged) {
    return false;
  }
  if (url.startsWith("file://")) return true;
  if (!USE_DEV_FRONTEND) {
    return false;
  }
  try {
    return new URL(url).origin === new URL(DEV_FRONTEND_URL).origin;
  } catch {
    return false;
  }
}
function createMainWindow() {
  console.log("[DESKTOP WINDOW]", {
    frontendUrl: DEV_FRONTEND_URL,
    preload: PRELOAD_PATH
  });
  mainWindow = new BrowserWindow({
    width: 1300,
    height: 850,
    minWidth: 1000,
    minHeight: 700,
    title: "PrintEase Desktop",
    icon: path.join(__dirname, "assets/icon.png"),
    webPreferences: {
      preload: PRELOAD_PATH,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      plugins: true
    }
  });
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({
    action: "deny"
  }));
  mainWindow.webContents.on("preload-error", (_event, preloadPath, error) => {
    writeStartupLog("preload-error", {
      preloadPath,
      error: serializeStartupError(error)
    });
    console.error("[DESKTOP PRELOAD ERROR]", {
      preloadPath,
      error: error?.stack || error?.message || String(error)
    });
  });
  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    writeStartupLog("render-process-gone", details || {});
    console.error("[DESKTOP RENDER PROCESS GONE]", details);
  });
  mainWindow.webContents.on("did-start-loading", () => {
    writeStartupLog("did-start-loading", {
      url: mainWindow?.webContents.getURL()
    });
    console.log("[DESKTOP LOAD START]", mainWindow?.webContents.getURL());
  });
  mainWindow.webContents.on("dom-ready", () => {
    writeStartupLog("dom-ready", {
      url: mainWindow?.webContents.getURL()
    });
    console.log("[DESKTOP DOM READY]", mainWindow?.webContents.getURL());
    if (process.env.PE_DEBUG_RENDERER === "1") {
      mainWindow?.webContents.openDevTools({
        mode: "detach"
      });
    }
  });
  mainWindow.webContents.on("did-stop-loading", () => {
    writeStartupLog("did-stop-loading", {
      url: mainWindow?.webContents.getURL()
    });
    console.log("[DESKTOP LOAD STOP]", mainWindow?.webContents.getURL());
  });
  mainWindow.webContents.on("unresponsive", () => {
    writeStartupLog("renderer-unresponsive");
    console.warn("[DESKTOP RENDERER UNRESPONSIVE]");
  });
  mainWindow.on("closed", () => {
    writeStartupLog("main-window-closed");
    mainWindow = null;
  });
  mainWindow.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    const payload = {
      level,
      message: String(message),
      line,
      sourceId
    };
    writeStartupLog("renderer-console-message", payload);
    const prefix = level >= 2 ? "[DESKTOP RENDERER CONSOLE ERROR]" : "[DESKTOP RENDERER CONSOLE]";
    console.log(prefix, payload);
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!isAllowedNavigation(url)) {
      event.preventDefault();
    }
  });
  mainWindow.webContents.on("did-fail-load", async (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame) return;
    console.warn("[DESKTOP LOAD FAILED]", {
      errorCode,
      errorDescription,
      url: validatedURL
    });
    writeStartupLog("did-fail-load", {
      errorCode,
      errorDescription,
      url: validatedURL
    });
    if (validatedURL.startsWith("file://") || validatedURL.startsWith(DESKTOP_PROTOCOL_ORIGIN)) {
      const localIndex = getProductionIndexPath();
      if (fs.existsSync(localIndex)) {
        const failedHash = new URL(validatedURL).hash;
        if (app.isPackaged) {
          await mainWindow?.loadURL(getDesktopAppUrl());
        } else {
          await mainWindow?.loadFile(localIndex);
        }
        if (failedHash && failedHash !== "#") {
          await mainWindow?.webContents.executeJavaScript(`window.location.hash = ${JSON.stringify(failedHash.slice(1))};`);
        }
      }
      return;
    }
    if (!app.isPackaged && validatedURL.startsWith(DEV_FRONTEND_URL)) {
      await mainWindow?.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(getDevServerErrorHtml())}`);
    }
  });
  mainWindow.webContents.on("did-finish-load", () => {
    writeStartupLog("did-finish-load", {
      url: mainWindow.webContents.getURL()
    });
    mainWindow.webContents.executeJavaScript(`({
        hasBridge: Boolean(window.printeaseDesktop),
        isDesktop: Boolean(window.printeaseDesktop?.isDesktop),
        bridgeVersion: window.printeaseDesktop?.bridgeVersion || null,
        bridgeKeys: window.printeaseDesktop ? Object.keys(window.printeaseDesktop) : []
      })`).then(bridgeState => {
      console.log("[DESKTOP RENDERER]", {
        url: mainWindow.webContents.getURL(),
        ...bridgeState
      });
    }).catch(error => {
      console.warn("[DESKTOP RENDERER CHECK FAILED]", error.message || error);
    });
    if (latestPrinterResult) emitPrinterResult(latestPrinterResult);
  });
  loadFrontend(mainWindow).catch(async error => {
    writeStartupLog("load-frontend:failed", {
      error: serializeStartupError(error)
    });
    console.error("[DESKTOP LOAD FRONTEND FAILED]", error);
    try {
      await mainWindow?.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(getDevServerErrorHtml())}`);
    } catch (fallbackError) {
      writeStartupLog("load-frontend-fallback:failed", {
        error: serializeStartupError(fallbackError)
      });
    }
  });
}
app.whenReady().then(async () => {
  writeStartupLog("app-ready");
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": ["default-src 'self' app: file:; " + "script-src 'self' app: file: 'unsafe-inline' 'unsafe-eval'; " + "style-src 'self' app: file: 'unsafe-inline'; " + "img-src 'self' app: file: data: blob: https:; " + "connect-src 'self' app: file: https: wss:; " + "font-src 'self' app: file: data:; " + "frame-src 'self' app: file: blob:; " + "object-src 'self' app: file: blob:;"]
      }
    });
  });
  await runStartupStep("clear-cache", () => session.defaultSession.clearCache());
  await runStartupStep("register-desktop-protocol", () => registerDesktopProtocol());
  await runStartupStep("set-config-directory", () => setConfigDirectory(app.getPath("userData")));
  await runStartupStep("set-document-cache-directory", () => setDocumentCacheDirectory(path.join(app.getPath("userData"), "document-cache")));
  runStartupStep("cleanup-document-cache", () => cleanupDocumentCache());
  await runStartupStep("register-ipc-handlers", () => registerIpcHandlers());
  await runStartupStep("create-main-window", () => createMainWindow());
  runStartupStep("ensure-device-identity", () => ensureDeviceIdentity()).then(() => emitAgentSession());
  runStartupStep("restore-stored-agent", () => restoreStoredDesktopAgent()).then(restoredAgent => {
    if (restoredAgent?.restored) {
      // Delay starting agent background services by 7 seconds to let startup load lightly.
      setTimeout(() => {
        startAgentRuntime("startup-stored-agent").catch(error => {
          agentSession.lastJobPollError = error.message || "Could not start background desktop agent.";
          writeStartupLog("startup-stored-agent:failed", {
            error: serializeStartupError(error)
          });
          emitAgentSession();
          console.warn("[DESKTOP AGENT BACKGROUND] startup failed", agentSession.lastJobPollError);
        });
      }, 7000);
    }
  });
  runStartupStep("migrate-file-local-storage-auth", () => migrateFileLocalStorageAuth());
  runStartupStep("initialize-updater", () => initializeUpdater({
    mainWindow
  }));
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
}).catch(error => {
  writeStartupLog("app-ready:fatal", {
    error: serializeStartupError(error)
  });
  dialog.showErrorBox("PrintEase Desktop failed to start", `PrintEase could not open.\n\n${error?.message || String(error)}\n\nLog file: ${getStartupLogPath()}`);
});
app.on("before-quit", () => {
  stopAgentRuntime("app-before-quit");
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});