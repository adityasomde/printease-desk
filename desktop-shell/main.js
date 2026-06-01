import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { diagnosePrinters, listPrinters, stopPrinting, testPrint } from "./printer/printExecutor.js";
import { confirmPairing, sendHeartbeat, startPairing } from "./agent/heartbeat.js";
import { createJobPoller, processNextJob } from "./agent/jobPoller.js";
import { syncPrinters } from "./agent/statusReporter.js";
import { getApiBaseUrl, getBackendUrl } from "./config/backend.js";
import { loadConfig, saveConfig, setConfigDirectory } from "./local/config.js";
import { checkForUpdates, getUpdateStatus, initializeUpdater, installUpdateNow } from "./updater.js";

const require = createRequire(import.meta.url);
const { app, BrowserWindow, ipcMain, session, shell } = require("electron");

const DEV_FRONTEND_URL = process.env.PRINTEASE_FRONTEND_URL || "http://127.0.0.1:5175";
const USE_DEV_FRONTEND = process.env.PRINTEASE_USE_DEV_FRONTEND === "1";
const VERSION = "0.1.1";
const HEARTBEAT_INTERVAL_MS = 15000;
const PRINTER_SYNC_INTERVAL_MS = 30000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PRELOAD_PATH = path.join(__dirname, "preload.cjs");

let mainWindow = null;
let ipcHandlersRegistered = false;
let latestPrinterResult = null;
let heartbeatTimer = null;
let printerSyncTimer = null;
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
};
let jobPoller = null;

function getProductionIndexPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "frontend-dist", "index.html");
  }

  const bundledIndex = path.join(__dirname, "..", "frontend-dist", "index.html");
  if (fs.existsSync(bundledIndex)) return bundledIndex;

  // Development fallback: after `npm run build --prefix frontend`, Vite outputs here.
  return path.join(__dirname, "..", "frontend", "dist", "index.html");
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

  if (app.isPackaged) {
    await window.loadFile(localIndex);
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

async function checkBackendHealth() {
  const backendUrl = getBackendUrl({ packaged: app.isPackaged });
  const apiBaseUrl = getApiBaseUrl({ packaged: app.isPackaged });

  try {
    const response = await fetch(`${apiBaseUrl}/health`, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });
    const data = await response.json().catch(() => null);

    return {
      success: response.ok,
      status: response.status,
      backendUrl,
      apiBaseUrl,
      data,
    };
  } catch (error) {
    return {
      success: false,
      backendUrl,
      apiBaseUrl,
      error: error.message || "Could not reach backend health endpoint.",
    };
  }
}

async function reportPrinterDiagnostic(event, result) {
  try {
    await fetch(`${getApiBaseUrl({ packaged: app.isPackaged })}/desktop/printer-diagnostics`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        event,
        deviceId: agentSession.deviceId || null,
        deviceName: agentSession.deviceName || null,
        platform: process.platform,
        version: VERSION,
        paired: Boolean(agentSession.accessToken),
        result,
      }),
    });
  } catch (error) {
    console.warn("[DESKTOP PRINTER DIAGNOSTIC REPORT FAILED]", error.message || error);
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

async function syncPrintersToCloud(printerResult, event = "printers:sync") {
  if (!isAgentPaired()) {
    const result = {
      success: false,
      message: "Pair desktop before syncing printers to cloud.",
      skipped: true,
    };
    agentSession.lastPrinterSyncError = result.message;
    emitAgentSession();
    return result;
  }

  if (!printerResult?.success) {
    const result = {
      success: false,
      message: printerResult?.error || printerResult?.message || "Local printer discovery failed; cloud sync skipped.",
    };
    agentSession.lastPrinterSyncError = result.message;
    emitAgentSession();
    return result;
  }

  const syncResult = await syncPrinters({
    agentToken: agentSession.accessToken,
    printers: (printerResult.printers || []).map((printer) => ({
      ...printer,
      isDefault: agentSession.selectedPrinterName
        ? printer.printerName === agentSession.selectedPrinterName
        : Boolean(printer.isDefault),
    })),
  });

  if (syncResult.success) {
    agentSession.lastPrinterSyncAt = new Date().toISOString();
    agentSession.lastPrinterSyncError = "";
  } else {
    agentSession.lastPrinterSyncError = syncResult.message || "Cloud printer sync failed.";
  }

  console.log("[DESKTOP PRINTER CLOUD SYNC]", JSON.stringify({
    event,
    success: syncResult.success,
    printerCount: printerResult.printers?.length || 0,
    message: syncResult.message,
  }, null, 2));
  emitAgentSession();
  return syncResult;
}

async function applyPrinterDiscoveryResult(result, event) {
  latestPrinterResult = result;
  emitPrinterResult(result);

  if (isAgentPaired()) {
    const cloudSync = await syncPrintersToCloud(result, event);
    latestPrinterResult = { ...result, cloudSync };
    emitPrinterResult(latestPrinterResult);
    return latestPrinterResult;
  }

  agentSession.lastPrinterSyncError = result?.success
    ? "Printer detected locally but not synced to hub. Pair desktop first."
    : result?.message || result?.error || "Local printer discovery failed.";
  emitAgentSession();
  return result;
}

async function refreshLocalPrinterResult(event) {
  const result = await listPrinters();
  console.log("[DESKTOP PRINTERS]", JSON.stringify(result, null, 2));
  await reportPrinterDiagnostic(event, result);
  return applyPrinterDiscoveryResult(result, event);
}

async function syncLatestPrinterStatus(event) {
  const result = await listPrinters();
  console.log("[DESKTOP PRINTER STATUS SYNC]", JSON.stringify({
    event,
    success: result.success,
    printerCount: result.printers?.length || 0,
    defaultPrinter: result.defaultPrinter || null,
    message: result.message || result.error || "Printer status discovered locally.",
  }, null, 2));
  return applyPrinterDiscoveryResult(result, event);
}

function reportStartupPrinterDiagnostics() {
  refreshLocalPrinterResult("desktop:startup-list")
    .then((result) => {
      console.log("[DESKTOP STARTUP PRINTERS]", JSON.stringify(result, null, 2));
    })
    .catch((error) => {
      console.warn("[DESKTOP STARTUP PRINTERS FAILED]", error.message || error);
    });

  diagnosePrinters()
    .then(async (result) => {
      console.log("[DESKTOP STARTUP PRINTER DIAGNOSTICS]", JSON.stringify(result, null, 2));
      await reportPrinterDiagnostic("desktop:startup-diagnose", result);
    })
    .catch((error) => {
      console.warn("[DESKTOP STARTUP PRINTER DIAGNOSTICS FAILED]", error.message || error);
    });
}

function sanitizeAgentSession() {
  return {
    success: true,
    deviceId: agentSession.deviceId,
    deviceName: agentSession.deviceName,
    pairingCode: agentSession.pairingCode,
    pairingSessionId: agentSession.pairingSessionId,
    expiresAt: agentSession.expiresAt,
    agentId: agentSession.agentId,
    hubId: agentSession.hubId,
    paired: Boolean(agentSession.accessToken),
    pairedAt: agentSession.pairedAt,
    lastHeartbeatAt: agentSession.lastHeartbeatAt,
    lastHeartbeatError: agentSession.lastHeartbeatError,
    selectedPrinterName: agentSession.selectedPrinterName,
    lastPrinterSyncAt: agentSession.lastPrinterSyncAt,
    lastPrinterSyncError: agentSession.lastPrinterSyncError,
    heartbeatRunning: Boolean(heartbeatTimer),
    printerSyncRunning: Boolean(printerSyncTimer),
    polling: Boolean(jobPoller?.isRunning),
  };
}

async function ensureDeviceIdentity(deviceName) {
  if (agentSession.deviceId && agentSession.deviceName) return;

  const savedConfig = await loadConfig();
  agentSession.deviceId = savedConfig.deviceId || randomUUID();
  agentSession.deviceName = deviceName || savedConfig.deviceName || os.hostname() || "PrintEase Desktop";
  agentSession.selectedPrinterName = savedConfig.selectedPrinterName || agentSession.selectedPrinterName || "";

  await saveConfig({
    deviceId: agentSession.deviceId,
    deviceName: agentSession.deviceName,
    agentId: agentSession.agentId,
    hubId: agentSession.hubId,
    selectedPrinterName: agentSession.selectedPrinterName,
  });
}

function findPrinterByName(printerResult, printerName) {
  const printers = Array.isArray(printerResult?.printers) ? printerResult.printers : [];
  return printers.find((printer) => (
    printer.printerName === printerName ||
    printer.systemPrinterId === printerName ||
    printer.displayName === printerName
  )) || null;
}

function resolveLocalPrinterName() {
  if (agentSession.selectedPrinterName) return agentSession.selectedPrinterName;
  if (!latestPrinterResult) return "";

  const printers = Array.isArray(latestPrinterResult.printers) ? latestPrinterResult.printers : [];
  const preferred = printers.find((printer) => printer.isDefault) || latestPrinterResult.defaultPrinter;

  return preferred?.printerName || "";
}

async function selectDesktopPrinter(_event, payload = {}) {
  const printerName = typeof payload === "string" ? payload : payload?.printerName;

  if (!printerName) {
    return {
      success: false,
      message: "Choose a printer before saving selection.",
      session: sanitizeAgentSession(),
    };
  }

  const printerResult = latestPrinterResult || await refreshLocalPrinterResult("printers:select-load");
  const printer = findPrinterByName(printerResult, printerName);

  if (!printer) {
    return {
      success: false,
      message: "Selected printer was not found locally. Refresh printers and try again.",
      session: sanitizeAgentSession(),
    };
  }

  agentSession.selectedPrinterName = printer.printerName;
  await saveConfig({
    deviceId: agentSession.deviceId,
    deviceName: agentSession.deviceName,
    agentId: agentSession.agentId,
    hubId: agentSession.hubId,
    selectedPrinterName: agentSession.selectedPrinterName,
  });

  latestPrinterResult = {
    ...printerResult,
    printers: (printerResult.printers || []).map((item) => ({
      ...item,
      isDefault: item.printerName === agentSession.selectedPrinterName,
    })),
  };
  emitPrinterResult(latestPrinterResult);

  let heartbeat = null;
  let printerSync = null;
  if (isAgentPaired()) {
    heartbeat = await sendAgentHeartbeat();
    printerSync = await syncPrintersToCloud(latestPrinterResult, "printers:selected");
  } else {
    agentSession.lastPrinterSyncError = "Printer selected locally but not synced to hub. Pair desktop first.";
  }

  emitAgentSession();

  return {
    success: true,
    message: "Selected printer " + agentSession.selectedPrinterName + ".",
    printer: findPrinterByName(latestPrinterResult, agentSession.selectedPrinterName),
    heartbeat,
    printerSync,
    session: sanitizeAgentSession(),
  };
}

function requirePairedAgent() {
  if (!agentSession.accessToken) {
    return {
      success: false,
      message: "Pair this desktop with a print hub before using agent actions.",
      session: sanitizeAgentSession(),
    };
  }

  return null;
}

async function startAgentPairing(_event, payload = {}) {
  await ensureDeviceIdentity(payload.deviceName);

  const result = await startPairing({
    deviceId: agentSession.deviceId,
    agentName: agentSession.deviceName,
  });

  if (result.success) {
    agentSession.pairingCode = result.pairingCode || "";
    agentSession.pairingSessionId = result.pairingSessionId || "";
    agentSession.expiresAt = result.expiresAt || "";
  }

  return {
    ...result,
    session: sanitizeAgentSession(),
  };
}

async function confirmAgentPairing() {
  await ensureDeviceIdentity();

  if (!agentSession.pairingSessionId) {
    return {
      success: false,
      paired: false,
      message: "Start pairing before confirming.",
      session: sanitizeAgentSession(),
    };
  }

  const result = await confirmPairing({
    pairingSessionId: agentSession.pairingSessionId,
    deviceId: agentSession.deviceId,
  });

  const returnedAgentToken = result.accessToken || result.agentToken;

  if (result.success && result.paired && returnedAgentToken) {
    agentSession.accessToken = returnedAgentToken;
    agentSession.agentId = result.agentId || "";
    agentSession.hubId = result.hubId || result.shopId || "";
    agentSession.pairedAt = new Date().toISOString();
    agentSession.pairingCode = "";

    await saveConfig({
      deviceId: agentSession.deviceId,
      deviceName: agentSession.deviceName,
      agentId: agentSession.agentId,
      hubId: agentSession.hubId,
      selectedPrinterName: agentSession.selectedPrinterName,
    });

    result.runtime = await startAgentRuntime("agent:paired");
  }

  return {
    ...result,
    accessToken: undefined,
    agentToken: undefined,
    refreshToken: undefined,
    session: sanitizeAgentSession(),
  };
}

async function sendAgentHeartbeat() {
  const pairingError = requirePairedAgent();
  if (pairingError) return pairingError;

  const result = await sendHeartbeat({
    agentToken: agentSession.accessToken,
    selectedPrinter: agentSession.selectedPrinterName,
  });

  if (result.success) {
    agentSession.lastHeartbeatAt = new Date().toISOString();
    agentSession.lastHeartbeatError = "";
  } else {
    agentSession.lastHeartbeatError = result.message || "Heartbeat failed.";
  }

  emitAgentSession();
  return {
    ...result,
    session: sanitizeAgentSession(),
  };
}

function startHeartbeatLoop() {
  if (!isAgentPaired()) {
    return {
      success: false,
      message: "Pair desktop before starting heartbeat.",
      session: sanitizeAgentSession(),
    };
  }

  if (heartbeatTimer) {
    return {
      success: true,
      message: "Heartbeat loop is already running.",
      session: sanitizeAgentSession(),
    };
  }

  heartbeatTimer = setInterval(() => {
    sendAgentHeartbeat().catch((error) => {
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
    session: sanitizeAgentSession(),
  };
}

function startPrinterSyncLoop() {
  if (!isAgentPaired()) {
    return {
      success: false,
      message: "Pair desktop before starting cloud printer sync.",
      session: sanitizeAgentSession(),
    };
  }

  if (printerSyncTimer) {
    return {
      success: true,
      message: "Printer sync loop is already running.",
      session: sanitizeAgentSession(),
    };
  }

  printerSyncTimer = setInterval(() => {
    syncLatestPrinterStatus("agent:printer-sync-loop").catch((error) => {
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
    session: sanitizeAgentSession(),
  };
}

async function startAgentRuntime(reason) {
  const heartbeat = await sendAgentHeartbeat();
  const printerResult = await refreshLocalPrinterResult(reason + ":printer-sync");
  const loop = startHeartbeatLoop();
  const printerLoop = startPrinterSyncLoop();

  return {
    success: Boolean(heartbeat.success && loop.success && printerLoop.success),
    heartbeat,
    printerResult,
    loop,
    printerLoop,
  };
}

async function syncAgentPrinters() {
  const pairingError = requirePairedAgent();
  if (pairingError) return pairingError;

  const printerResult = await refreshLocalPrinterResult("agent:manual-printer-sync");
  if (!printerResult.success) return {
    ...printerResult,
    session: sanitizeAgentSession(),
  };

  const heartbeat = await sendAgentHeartbeat();
  const printerSync = printerResult.cloudSync || await syncPrintersToCloud(printerResult, "agent:manual-printer-sync");

  return {
    success: Boolean(heartbeat.success && printerSync.success),
    heartbeat,
    printerSync,
    localPrinters: printerResult.printers,
    session: sanitizeAgentSession(),
  };
}

async function pollAgentOnce(_event, payload = {}) {
  const pairingError = requirePairedAgent();
  if (pairingError) return pairingError;

  return processNextJob({
    agentToken: agentSession.accessToken,
    printerName: payload.printerName || resolveLocalPrinterName(),
  });
}

function startAgentPolling(_event, payload = {}) {
  const pairingError = requirePairedAgent();
  if (pairingError) return pairingError;

  if (!jobPoller) {
    jobPoller = createJobPoller({
      agentToken: agentSession.accessToken,
      printerName: payload.printerName || agentSession.selectedPrinterName,
      intervalMs: payload.intervalMs,
    });
  }

  const result = jobPoller.start({
    agentToken: agentSession.accessToken,
    printerName: payload.printerName || resolveLocalPrinterName(),
    intervalMs: payload.intervalMs,
  });

  return {
    ...result,
    session: sanitizeAgentSession(),
  };
}

function stopAgentPolling() {
  const result = jobPoller?.stop() || {
    success: true,
    message: "Job polling is not running.",
  };

  return {
    ...result,
    session: sanitizeAgentSession(),
  };
}

function registerIpcHandlers() {
  if (ipcHandlersRegistered) return;
  ipcHandlersRegistered = true;

  ipcMain.handle("desktop:status", async () => {
    const printerResult = latestPrinterResult || await refreshLocalPrinterResult("desktop:status");

    return {
      success: true,
      isDesktop: true,
      platform: process.platform,
      backendUrl: getBackendUrl({ packaged: app.isPackaged }),
      apiBaseUrl: getApiBaseUrl({ packaged: app.isPackaged }),
      version: VERSION,
      printerResult,
    };
  });

  ipcMain.handle("backend:health", () => checkBackendHealth());
  ipcMain.handle("printers:list", () => refreshLocalPrinterResult("printers:list"));
  ipcMain.handle("printers:select", selectDesktopPrinter);
  ipcMain.handle("printers:diagnose", async () => {
    const result = await diagnosePrinters();
    console.log("[DESKTOP PRINTER DIAGNOSTICS]", JSON.stringify(result, null, 2));
    await reportPrinterDiagnostic("printers:diagnose", result);
    return result;
  });

  ipcMain.handle("printers:test-print", (_event, payload = {}) => {
    const printerName = (typeof payload === "string" ? payload : payload?.printerName) || agentSession.selectedPrinterName;
    return testPrint(printerName);
  });

  ipcMain.handle("printing:stop", () => stopPrinting());
  ipcMain.handle("agent:status", () => sanitizeAgentSession());
  ipcMain.handle("agent:start-pairing", startAgentPairing);
  ipcMain.handle("agent:open-approval-url", async (_event, url) => {
    if (!url || typeof url !== "string") {
      return { success: false, message: "Approval URL is required." };
    }

    let approvalUrl;
    try {
      approvalUrl = new URL(url);
      const allowedOrigin = new URL(getBackendUrl({ packaged: app.isPackaged })).origin;
      if (approvalUrl.protocol !== "https:" || approvalUrl.origin !== allowedOrigin) {
        return { success: false, message: "Approval URL is not trusted." };
      }
    } catch {
      return { success: false, message: "Approval URL is invalid." };
    }

    try {
      await shell.openExternal(approvalUrl.toString());
      return { success: true, message: "Approval URL opened in browser." };
    } catch (error) {
      return { success: false, message: error?.message || "Could not open approval URL." };
    }
  });
  ipcMain.handle("agent:confirm-pairing", confirmAgentPairing);
  ipcMain.handle("agent:heartbeat", async () => {
    const result = await sendAgentHeartbeat();
    if (result.success) startHeartbeatLoop();
    return result;
  });
  ipcMain.handle("agent:sync-printers", syncAgentPrinters);
  ipcMain.handle("agent:poll-once", pollAgentOnce);
  ipcMain.handle("agent:start-polling", startAgentPolling);
  ipcMain.handle("agent:stop-polling", stopAgentPolling);
  ipcMain.handle("updater:check", () => checkForUpdates());
  ipcMain.handle("updater:status", () => getUpdateStatus());
  ipcMain.handle("updater:install", () => installUpdateNow());
}

function isAllowedNavigation(url) {
  if (url.startsWith("data:text/html")) return true;
  if (url.startsWith("file://")) return true;

  try {
    return new URL(url).origin === new URL(DEV_FRONTEND_URL).origin;
  } catch {
    return false;
  }
}

function createMainWindow() {
  console.log("[DESKTOP WINDOW]", {
    frontendUrl: DEV_FRONTEND_URL,
    preload: PRELOAD_PATH,
  });

  mainWindow = new BrowserWindow({
    width: 1300,
    height: 850,
    minWidth: 1000,
    minHeight: 700,
    title: "PrintEase Desktop",
    webPreferences: {
      preload: PRELOAD_PATH,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("preload-error", (_event, preloadPath, error) => {
    console.error("[DESKTOP PRELOAD ERROR]", {
      preloadPath,
      error: error?.stack || error?.message || String(error),
    });
  });
  mainWindow.webContents.on("console-message", (_event, _level, message) => {
    if (String(message).startsWith("[DESKTOP PRELOAD]")) {
      console.log(message);
    }
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!isAllowedNavigation(url)) {
      event.preventDefault();
    }
  });

  mainWindow.webContents.on("did-fail-load", async (_event, _errorCode, _errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame || app.isPackaged || !validatedURL.startsWith(DEV_FRONTEND_URL)) return;
    await mainWindow?.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(getDevServerErrorHtml())}`);
  });
  mainWindow.webContents.on("did-finish-load", () => {
    mainWindow.webContents
      .executeJavaScript(`({
        hasBridge: Boolean(window.printeaseDesktop),
        isDesktop: Boolean(window.printeaseDesktop?.isDesktop),
        bridgeVersion: window.printeaseDesktop?.bridgeVersion || null,
        bridgeKeys: window.printeaseDesktop ? Object.keys(window.printeaseDesktop) : []
      })`)
      .then((bridgeState) => {
        console.log("[DESKTOP RENDERER]", {
          url: mainWindow.webContents.getURL(),
          ...bridgeState,
        });
      })
      .catch((error) => {
        console.warn("[DESKTOP RENDERER CHECK FAILED]", error.message || error);
      });

    if (latestPrinterResult) emitPrinterResult(latestPrinterResult);
  });

  loadFrontend(mainWindow);
}

app.whenReady().then(async () => {
  await session.defaultSession.clearCache();
  setConfigDirectory(app.getPath("userData"));
  await ensureDeviceIdentity();
  registerIpcHandlers();
  createMainWindow();
  initializeUpdater({ mainWindow });
  setTimeout(reportStartupPrinterDiagnostics, 1000);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("before-quit", () => {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  if (printerSyncTimer) clearInterval(printerSyncTimer);
  jobPoller?.stop?.();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
