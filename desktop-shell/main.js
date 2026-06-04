import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { diagnoseWindowsPrintHelper } from "./printer/windowsPrinter.js";
import { diagnosePrinters, listPrinters, stopPrinting, testPrint } from "./printer/printExecutor.js";
import { confirmPairing, sendHeartbeat, startPairing } from "./agent/heartbeat.js";
import { processNextJob } from "./agent/jobPoller.js";
import { syncPrinters } from "./agent/statusReporter.js";
import { getApiBaseUrl, getBackendUrl } from "./config/backend.js";
import { loadConfig, saveConfig, setConfigDirectory } from "./local/config.js";
import { checkForUpdates, getUpdateStatus, initializeUpdater, installUpdateNow } from "./updater.js";

const require = createRequire(import.meta.url);
const { app, BrowserWindow, ipcMain, net, protocol, safeStorage, session, shell } = require("electron");

protocol.registerSchemesAsPrivileged([
  {
    scheme: "app",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);

const DEV_FRONTEND_URL = process.env.PRINTEASE_FRONTEND_URL || "http://127.0.0.1:5175";
const USE_DEV_FRONTEND = process.env.PRINTEASE_USE_DEV_FRONTEND === "1";
const VERSION = "0.1.24";
const HEARTBEAT_INTERVAL_MS = 25000;
const PRINTER_SYNC_INTERVAL_MS = 30000;
const JOB_POLL_INTERVAL_MS = 5000;
const DESKTOP_PROTOCOL_ORIGIN = "app://printease";
const DESKTOP_AUTH_FILE = "desktop-auth.json";
const DESKTOP_AGENT_FILE = "desktop-agent.json";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PRELOAD_PATH = path.join(__dirname, "preload.cjs");

let mainWindow = null;
let ipcHandlersRegistered = false;
let latestPrinterResult = null;
let heartbeatTimer = null;
let printerSyncTimer = null;
let jobPollTimer = null;
let isPollingJobs = false;
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
};

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

function isPathInside(parentPath, childPath) {
  const relative = path.relative(parentPath, childPath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function registerDesktopProtocol() {
  if (!app.isPackaged) return;

  protocol.handle("app", (request) => {
    const frontendRoot = getFrontendDistRoot();

    try {
      const requestUrl = new URL(request.url);
      if (requestUrl.hostname !== "printease") {
        return new Response("Not found", { status: 404 });
      }

      const requestedPath = decodeURIComponent(requestUrl.pathname || "/");
      const relativePath = requestedPath === "/" ? "index.html" : requestedPath.replace(/^\/+/, "");
      const candidatePath = path.normalize(path.join(frontendRoot, relativePath));

      if (!isPathInside(frontendRoot, candidatePath)) {
        return new Response("Forbidden", { status: 403 });
      }

      if (fs.existsSync(candidatePath) && fs.statSync(candidatePath).isFile()) {
        return net.fetch(pathToFileURL(candidatePath).toString());
      }

      if (!path.extname(candidatePath)) {
        return net.fetch(pathToFileURL(getProductionIndexPath()).toString());
      }

      return new Response("Not found", { status: 404 });
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

function getDesktopAuthPath() {
  return path.join(app.getPath("userData"), DESKTOP_AUTH_FILE);
}

function getDesktopAgentPath() {
  return path.join(app.getPath("userData"), DESKTOP_AGENT_FILE);
}

function normalizeDesktopAuthPayload(payload = {}) {
  const token = typeof payload.token === "string" ? payload.token : "";
  const user = payload.user && typeof payload.user === "object" ? payload.user : null;

  if (!token || !user) {
    return null;
  }

  return {
    token,
    user,
    savedAt: new Date().toISOString(),
  };
}

function encodeDesktopAuth(payload) {
  const text = JSON.stringify(payload);

  if (safeStorage?.isEncryptionAvailable?.()) {
    return {
      encrypted: true,
      data: Buffer.from(safeStorage.encryptString(text)).toString("base64"),
    };
  }

  return {
    encrypted: false,
    data: text,
  };
}

function decodeDesktopAuth(stored) {
  if (!stored || typeof stored !== "object") return null;

  if (stored.encrypted) {
    const decrypted = safeStorage.decryptString(Buffer.from(String(stored.data || ""), "base64"));
    return JSON.parse(decrypted);
  }

  return JSON.parse(String(stored.data || "{}"));
}

async function getStoredDesktopAuth() {
  try {
    const authPath = getDesktopAuthPath();
    if (!fs.existsSync(authPath)) {
      return { success: true, auth: null };
    }

    const stored = JSON.parse(await fs.promises.readFile(authPath, "utf8"));
    const auth = decodeDesktopAuth(stored);

    return {
      success: true,
      auth: normalizeDesktopAuthPayload(auth),
      encrypted: Boolean(stored.encrypted),
    };
  } catch (error) {
    return {
      success: false,
      auth: null,
      error: error?.message || "Could not read desktop auth storage.",
    };
  }
}

async function setStoredDesktopAuth(_event, payload = {}) {
  try {
    const auth = normalizeDesktopAuthPayload(payload);
    if (!auth) {
      return { success: false, error: "Desktop auth payload is invalid." };
    }

    await fs.promises.mkdir(app.getPath("userData"), { recursive: true });
    await fs.promises.writeFile(getDesktopAuthPath(), JSON.stringify(encodeDesktopAuth(auth), null, 2), "utf8");

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error?.message || "Could not save desktop auth storage.",
    };
  }
}

async function clearStoredDesktopAuth() {
  try {
    await fs.promises.rm(getDesktopAuthPath(), { force: true });
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error?.message || "Could not clear desktop auth storage.",
    };
  }
}

function normalizeDesktopAgentPayload(payload = {}) {
  const token = typeof payload.agentToken === "string" ? payload.agentToken : payload.accessToken;
  const agentId = typeof payload.agentId === "string" ? payload.agentId : "";
  const hubId = typeof payload.hubId === "string" ? payload.hubId : payload.shopId;
  const deviceId = typeof payload.deviceId === "string" ? payload.deviceId : agentSession.deviceId;
  const deviceName = typeof payload.deviceName === "string" ? payload.deviceName : agentSession.deviceName;

  if (!token || !agentId || !hubId || !deviceId || !deviceName) {
    return null;
  }

  return {
    agentToken: token,
    agentId,
    hubId,
    linkedHubUserId: typeof payload.linkedHubUserId === "string" ? payload.linkedHubUserId : "",
    linkedHubCentreId: typeof payload.linkedHubCentreId === "string" ? payload.linkedHubCentreId : "",
    deviceId,
    deviceName,
    pairedAt: typeof payload.pairedAt === "string" ? payload.pairedAt : new Date().toISOString(),
    selectedPrinterName: typeof payload.selectedPrinterName === "string"
      ? payload.selectedPrinterName
      : agentSession.selectedPrinterName,
    savedAt: new Date().toISOString(),
  };
}

function applyStoredAgentToSession(agent) {
  if (!agent) return false;

  agentSession.deviceId = agent.deviceId || agentSession.deviceId;
  agentSession.deviceName = agent.deviceName || agentSession.deviceName;
  agentSession.agentId = agent.agentId || "";
  agentSession.hubId = agent.hubId || "";
  agentSession.accessToken = agent.agentToken || "";
  agentSession.pairedAt = agent.pairedAt || "";
  agentSession.selectedPrinterName = agent.selectedPrinterName || agentSession.selectedPrinterName || "";
  agentSession.pairingCode = "";
  agentSession.pairingSessionId = "";
  agentSession.expiresAt = "";
  return isAgentPaired();
}

async function getStoredDesktopAgent() {
  try {
    const agentPath = getDesktopAgentPath();
    if (!fs.existsSync(agentPath)) {
      return { success: true, agent: null };
    }

    const stored = JSON.parse(await fs.promises.readFile(agentPath, "utf8"));
    const agent = normalizeDesktopAgentPayload(decodeDesktopAuth(stored));

    return {
      success: true,
      agent: agent ? {
        agentId: agent.agentId,
        hubId: agent.hubId,
        deviceId: agent.deviceId,
        deviceName: agent.deviceName,
        linkedHubUserId: agent.linkedHubUserId,
        linkedHubCentreId: agent.linkedHubCentreId,
        pairedAt: agent.pairedAt,
        selectedPrinterName: agent.selectedPrinterName,
        savedAt: agent.savedAt,
      } : null,
      encrypted: Boolean(stored.encrypted),
      session: sanitizeAgentSession(),
    };
  } catch (error) {
    return {
      success: false,
      agent: null,
      error: error?.message || "Could not read desktop agent storage.",
      session: sanitizeAgentSession(),
    };
  }
}

async function setStoredDesktopAgent(_event, payload = {}) {
  try {
    const agent = normalizeDesktopAgentPayload(payload);
    if (!agent) {
      return { success: false, error: "Desktop agent credential payload is invalid.", session: sanitizeAgentSession() };
    }

    await fs.promises.mkdir(app.getPath("userData"), { recursive: true });
    await fs.promises.writeFile(getDesktopAgentPath(), JSON.stringify(encodeDesktopAuth(agent), null, 2), "utf8");
    applyStoredAgentToSession(agent);

    await saveConfig({
      deviceId: agentSession.deviceId,
      deviceName: agentSession.deviceName,
      agentId: agentSession.agentId,
      hubId: agentSession.hubId,
      selectedPrinterName: agentSession.selectedPrinterName,
    });

    const runtime = await startAgentRuntime("agent-stored");
    emitAgentSession();
    return { success: true, runtime, session: sanitizeAgentSession() };
  } catch (error) {
    return {
      success: false,
      error: error?.message || "Could not save desktop agent credential.",
      session: sanitizeAgentSession(),
    };
  }
}

async function restoreStoredDesktopAgent() {
  try {
    const agentPath = getDesktopAgentPath();
    if (!fs.existsSync(agentPath)) return { success: true, restored: false };

    const stored = JSON.parse(await fs.promises.readFile(agentPath, "utf8"));
    const agent = normalizeDesktopAgentPayload(decodeDesktopAuth(stored));
    const restored = applyStoredAgentToSession(agent);

    if (restored) {
      await saveConfig({
        deviceId: agentSession.deviceId,
        deviceName: agentSession.deviceName,
        agentId: agentSession.agentId,
        hubId: agentSession.hubId,
        selectedPrinterName: agentSession.selectedPrinterName,
      });
      console.log("[DESKTOP AGENT] restored stored agent credential", {
        agentId: agentSession.agentId,
        hubId: agentSession.hubId,
        deviceId: agentSession.deviceId,
      });
    }

    return { success: true, restored };
  } catch (error) {
    console.warn("[DESKTOP AGENT RESTORE FAILED]", error?.message || error);
    return { success: false, restored: false, error: error?.message || "Could not restore desktop agent credential." };
  }
}

async function clearStoredDesktopAgent() {
  try {
    await fs.promises.rm(getDesktopAgentPath(), { force: true });
    stopAgentRuntime("agent-cleared");
    agentSession.agentId = "";
    agentSession.hubId = "";
    agentSession.accessToken = "";
    agentSession.pairedAt = "";
    agentSession.pairingCode = "";
    agentSession.pairingSessionId = "";
    agentSession.expiresAt = "";
    agentSession.lastJobPollError = "";
    agentSession.lastJobPollMessage = "";
    emitAgentSession();
    return { success: true, session: sanitizeAgentSession() };
  } catch (error) {
    return {
      success: false,
      error: error?.message || "Could not clear desktop agent credential.",
      session: sanitizeAgentSession(),
    };
  }
}

async function migrateFileLocalStorageAuth() {
  if (!app.isPackaged) return;

  const existing = await getStoredDesktopAuth();
  if (existing?.auth?.token && existing.auth.user) return;

  const localIndex = getProductionIndexPath();
  if (!fs.existsSync(localIndex)) return;

  const migrationWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  try {
    await migrationWindow.loadFile(localIndex);
    const stored = await migrationWindow.webContents.executeJavaScript(`(() => {
      const token = localStorage.getItem("printease_token");
      const userText = localStorage.getItem("printease_user");
      return { token, userText };
    })()`);

    if (stored?.token && stored?.userText) {
      const user = JSON.parse(stored.userText);
      await setStoredDesktopAuth(null, { token: stored.token, user });
      console.log("[DESKTOP AUTH] migrated file localStorage auth");
    }
  } catch (error) {
    console.warn("[DESKTOP AUTH MIGRATION FAILED]", error?.message || error);
  } finally {
    migrationWindow.destroy();
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
    console.log("[DESKTOP AGENT BACKGROUND] printer sync success", {
      event,
      printerCount: printerResult.printers?.length || 0,
    });
  } else {
    agentSession.lastPrinterSyncError = syncResult.message || "Cloud printer sync failed.";
    console.warn("[DESKTOP AGENT BACKGROUND] printer sync fail", {
      event,
      message: agentSession.lastPrinterSyncError,
    });
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
    lastJobPollAt: agentSession.lastJobPollAt,
    lastJobPollError: agentSession.lastJobPollError,
    lastJobPollMessage: agentSession.lastJobPollMessage,
    heartbeatRunning: Boolean(heartbeatTimer),
    printerSyncRunning: Boolean(printerSyncTimer),
    polling: Boolean(jobPollTimer),
    autoPrintRunning: Boolean(heartbeatTimer && printerSyncTimer && jobPollTimer),
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

  return preferred?.printerName || printers[0]?.printerName || "";
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
    startJobPollLoop("printer-selected", { printerName: agentSession.selectedPrinterName });
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
    await setStoredDesktopAgent(null, {
      agentToken: agentSession.accessToken,
      agentId: agentSession.agentId,
      hubId: agentSession.hubId,
      deviceId: agentSession.deviceId,
      deviceName: agentSession.deviceName,
      pairedAt: agentSession.pairedAt,
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
    console.log("[DESKTOP AGENT BACKGROUND] heartbeat success", {
      agentId: agentSession.agentId || null,
      selectedPrinterName: agentSession.selectedPrinterName || null,
    });
  } else {
    agentSession.lastHeartbeatError = result.message || "Heartbeat failed.";
    console.warn("[DESKTOP AGENT BACKGROUND] heartbeat fail", {
      status: result.status || null,
      message: agentSession.lastHeartbeatError,
    });
    if (result.status === 401 || result.status === 403) {
      await clearStoredDesktopAgent();
      agentSession.lastHeartbeatError = "Stored desktop agent credential was rejected. Register or pair this desktop again.";
    }
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
    console.log("[DESKTOP AGENT BACKGROUND] already running heartbeat");
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
    console.log("[DESKTOP AGENT BACKGROUND] already running printer sync");
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

function stopAgentRuntime(reason = "stopped") {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }

  if (printerSyncTimer) {
    clearInterval(printerSyncTimer);
    printerSyncTimer = null;
  }

  if (jobPollTimer) {
    clearInterval(jobPollTimer);
    jobPollTimer = null;
  }

  isPollingJobs = false;
  console.log("[DESKTOP AGENT BACKGROUND] stopped", reason);
  emitAgentSession();
  return {
    success: true,
    message: "Background desktop agent stopped.",
    reason,
    session: sanitizeAgentSession(),
  };
}

async function pollJobsNow(reason = "manual", payload = {}) {
  const pairingError = requirePairedAgent();
  if (pairingError) return pairingError;

  if (isPollingJobs) {
    console.log("[DESKTOP AGENT BACKGROUND] poll skipped because previous poll still running", { reason });
    return {
      success: true,
      skipped: true,
      message: "Job poll already running.",
      session: sanitizeAgentSession(),
    };
  }

  if (!payload.printerName && !resolveLocalPrinterName()) {
    await syncLatestPrinterStatus(`${reason}:resolve-printer`).catch(() => null);
  }

  const printerName = payload.printerName || resolveLocalPrinterName();
  const knownPrinters = Array.isArray(latestPrinterResult?.printers) ? latestPrinterResult.printers : [];
  if (!printerName && knownPrinters.length === 0) {
    agentSession.lastJobPollAt = new Date().toISOString();
    agentSession.lastJobPollError = "No local printer selected/available.";
    agentSession.lastJobPollMessage = "Auto-print is online but waiting for a local printer.";
    console.warn("[DESKTOP AGENT BACKGROUND] no local printer selected/available", { reason });
    emitAgentSession();
    return {
      success: true,
      skipped: true,
      message: agentSession.lastJobPollError,
      session: sanitizeAgentSession(),
    };
  }

  isPollingJobs = true;

  try {
    const result = await processNextJob({
      agentToken: agentSession.accessToken,
      printerName,
    });

    agentSession.lastJobPollAt = new Date().toISOString();

    if (result.success) {
      agentSession.lastJobPollError = "";
      agentSession.lastJobPollMessage = result.job
        ? `Printed job ${result.job.jobId || result.job.orderId || ""}`.trim()
        : result.message || "Job poll success.";
      console.log("[DESKTOP AGENT BACKGROUND] job poll success/job printed", {
        reason,
        printerName,
        jobId: result.job?.jobId || null,
        orderId: result.job?.orderId || null,
      });
    } else if (result.status === 401 || result.status === 403) {
      agentSession.lastJobPollError = "Stored desktop agent credential was rejected. Register or pair this desktop again.";
      console.warn("[DESKTOP AGENT BACKGROUND] stopped auth rejected", {
        reason,
        status: result.status,
        message: result.message,
      });
      await clearStoredDesktopAgent();
    } else if (result.job) {
      agentSession.lastJobPollError = result.message || "Print job failed.";
      agentSession.lastJobPollMessage = `Job failed ${result.job.jobId || result.job.orderId || ""}`.trim();
      console.warn("[DESKTOP AGENT BACKGROUND] job poll success/job failed", {
        reason,
        printerName,
        jobId: result.job?.jobId || null,
        orderId: result.job?.orderId || null,
        message: result.message,
      });
    } else {
      agentSession.lastJobPollError = "";
      agentSession.lastJobPollMessage = result.message || "No jobs.";
      console.log("[DESKTOP AGENT BACKGROUND] job poll success/no jobs", {
        reason,
        printerName: printerName || null,
      });
    }

    emitAgentSession();
    return {
      ...result,
      selectedPrinterName: printerName,
      session: sanitizeAgentSession(),
    };
  } catch (error) {
    agentSession.lastJobPollAt = new Date().toISOString();
    agentSession.lastJobPollError = error.message || "Could not poll print jobs.";
    console.warn("[DESKTOP AGENT BACKGROUND] job poll fail", {
      reason,
      printerName: printerName || null,
      message: agentSession.lastJobPollError,
    });
    emitAgentSession();
    return {
      success: false,
      message: agentSession.lastJobPollError,
      session: sanitizeAgentSession(),
    };
  } finally {
    isPollingJobs = false;
  }
}

function startJobPollLoop(reason = "manual-start", payload = {}) {
  const pairingError = requirePairedAgent();
  if (pairingError) return pairingError;

  if (jobPollTimer) {
    console.log("[DESKTOP AGENT BACKGROUND] already running job polling", { reason });
    return {
      success: true,
      message: "Job polling is already running.",
      session: sanitizeAgentSession(),
    };
  }

  const intervalMs = Math.max(3000, Number(payload.intervalMs) || JOB_POLL_INTERVAL_MS);
  jobPollTimer = setInterval(() => {
    pollJobsNow("job-poll-loop").catch((error) => {
      agentSession.lastJobPollError = error.message || "Job poll failed.";
      emitAgentSession();
      console.warn("[DESKTOP AGENT BACKGROUND] job poll fail", agentSession.lastJobPollError);
    });
  }, intervalMs);
  jobPollTimer.unref?.();

  pollJobsNow(reason, payload).catch((error) => {
    agentSession.lastJobPollError = error.message || "Initial job poll failed.";
    emitAgentSession();
  });

  console.log("[DESKTOP AGENT BACKGROUND] job polling started", {
    reason,
    intervalMs,
    selectedPrinterName: payload.printerName || resolveLocalPrinterName() || null,
  });
  emitAgentSession();
  return {
    success: true,
    message: "Job polling started.",
    intervalMs,
    session: sanitizeAgentSession(),
  };
}

async function startAgentRuntime(reason) {
  console.log("[DESKTOP AGENT BACKGROUND]", reason, {
    paired: isAgentPaired(),
    selectedPrinterName: agentSession.selectedPrinterName || null,
  });
  const heartbeat = await sendAgentHeartbeat();
  const printerResult = await refreshLocalPrinterResult(reason + ":printer-sync");
  const loop = startHeartbeatLoop();
  const printerLoop = startPrinterSyncLoop();
  const jobLoop = startJobPollLoop(reason + ":job-poll");

  return {
    success: Boolean(heartbeat.success && loop.success && printerLoop.success && jobLoop.success),
    heartbeat,
    printerResult,
    loop,
    printerLoop,
    jobLoop,
    session: sanitizeAgentSession(),
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
  const runtime = startJobPollLoop("manual-printer-sync");

  return {
    success: Boolean(heartbeat.success && printerSync.success && runtime.success),
    heartbeat,
    printerSync,
    runtime,
    localPrinters: printerResult.printers,
    session: sanitizeAgentSession(),
  };
}

async function pollAgentOnce(_event, payload = {}) {
  return pollJobsNow("manual-poll", payload);
}

function startAgentPolling(_event, payload = {}) {
  return startJobPollLoop("manual-start", payload);
}

function stopAgentPolling() {
  if (jobPollTimer) {
    clearInterval(jobPollTimer);
    jobPollTimer = null;
    console.log("[DESKTOP AGENT BACKGROUND] job polling stopped manual-stop");
  }

  emitAgentSession();
  return {
    success: true,
    message: "Job polling stopped.",
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
  ipcMain.handle("printer:diagnoseWindowsHelper", () => diagnoseWindowsPrintHelper());
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
  ipcMain.handle("desktopAuth:get", () => getStoredDesktopAuth());
  ipcMain.handle("desktopAuth:set", setStoredDesktopAuth);
  ipcMain.handle("desktopAuth:clear", () => clearStoredDesktopAuth());
  ipcMain.handle("desktopAgent:get", () => getStoredDesktopAgent());
  ipcMain.handle("desktopAgent:set", setStoredDesktopAgent);
  ipcMain.handle("desktopAgent:clear", () => clearStoredDesktopAgent());
  ipcMain.handle("desktopAgent:device-identity", async () => {
    await ensureDeviceIdentity();
    return {
      success: true,
      deviceId: agentSession.deviceId,
      deviceName: agentSession.deviceName,
    };
  });
}

function isAllowedNavigation(url) {
  if (url.startsWith("data:text/html")) return true;
  if (url.startsWith("file://")) return true;
  if (url.startsWith(DESKTOP_PROTOCOL_ORIGIN)) return true;

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

  mainWindow.webContents.on("did-fail-load", async (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame) return;

    console.warn("[DESKTOP LOAD FAILED]", {
      errorCode,
      errorDescription,
      url: validatedURL,
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
          await mainWindow?.webContents.executeJavaScript(
            `window.location.hash = ${JSON.stringify(failedHash.slice(1))};`
          );
        }
      }
      return;
    }

    if (!app.isPackaged && validatedURL.startsWith(DEV_FRONTEND_URL)) {
      await mainWindow?.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(getDevServerErrorHtml())}`);
    }
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
  registerDesktopProtocol();
  setConfigDirectory(app.getPath("userData"));
	  await ensureDeviceIdentity();
	  const restoredAgent = await restoreStoredDesktopAgent();
	  if (restoredAgent?.restored) {
	    startAgentRuntime("startup-stored-agent").catch((error) => {
	      agentSession.lastJobPollError = error.message || "Could not start background desktop agent.";
	      emitAgentSession();
	      console.warn("[DESKTOP AGENT BACKGROUND] startup failed", agentSession.lastJobPollError);
	    });
	  }
	  await migrateFileLocalStorageAuth();
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
  stopAgentRuntime("app-before-quit");
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
