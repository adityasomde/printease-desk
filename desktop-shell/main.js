import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import electron from "electron";
import { diagnosePrinters, listPrinters, stopPrinting, testPrint } from "./printer/printExecutor.js";
import { findLibreOfficeExecutable, LIBREOFFICE_MANUAL_DOWNLOAD_URL } from "./agent/printPreparation/conversionEngine.js";

async function diagnoseWindowsPrintHelperSafe() {
  if (process.platform !== "win32") {
    return {
      success: false,
      platform: process.platform,
      message: "Windows print helper diagnostics are only available on Windows.",
    };
  }

  const module = await import("./printer/windows/windowsPrinter.js");
  return module.diagnoseWindowsPrintHelper();
}

async function diagnoseLibreOfficeSafe() {
  try {
    const result = await findLibreOfficeExecutable();
    return {
      success: result.found,
      ...result,
      manualDownloadUrl: result.manualDownloadUrl || LIBREOFFICE_MANUAL_DOWNLOAD_URL,
      message: result.found
        ? `LibreOffice detected from ${result.source || "system"}.`
        : result.message,
    };
  } catch (error) {
    return {
      success: false,
      found: false,
      reasonCode: "CONVERSION_ENGINE_DIAGNOSTIC_FAILED",
      message: error?.message || "Could not inspect LibreOffice.",
      manualDownloadUrl: LIBREOFFICE_MANUAL_DOWNLOAD_URL,
    };
  }
}
import { confirmPairing, sendHeartbeat, startPairing } from "./agent/heartbeat.js";
import {
  cleanupDocumentCache,
  findCachedDocument,
  getDocumentCacheDirectory,
  getDocumentCacheMaxAgeDays,
  getDocumentCacheMaxSizeBytes,
  setDocumentCacheDirectory,
} from "./agent/documentCache.js";
import { predownloadPendingDocuments, processNextJob, processNextConversionJob } from "./agent/jobPoller.js";
import { syncPrinters } from "./agent/statusReporter.js";
import { getApiBaseUrl, getBackendUrl } from "./config/backend.js";
import { loadConfig, saveConfig, setConfigDirectory } from "./local/config.js";
import { checkForUpdates, getUpdateStatus, initializeUpdater, installUpdateNow } from "./updater.js";
import { secureHandle } from "./security/ipcSecurity.js";
import { isSafeApprovalUrl } from "./security/urlValidator.js";

const { app, BrowserWindow, dialog, ipcMain, net, protocol, safeStorage, session, shell } = electron;

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
const VERSION = "0.1.92";
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
  converterPath: "",
};

function serializeStartupError(error) {
  if (!error) return "";
  return error.stack || error.message || String(error);
}

function getStartupLogPath() {
  try {
    const userData = app.getPath("userData");
    fs.mkdirSync(userData, { recursive: true });
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
    ...detail,
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
    writeStartupLog(`${name}:failed`, { error: serializeStartupError(error) });
    console.warn(`[DESKTOP STARTUP] ${name} failed`, error?.stack || error?.message || error);
    return null;
  }
}

process.on("uncaughtException", (error) => {
  writeStartupLog("uncaughtException", { error: serializeStartupError(error) });
  console.error("[DESKTOP UNCAUGHT EXCEPTION]", error);
});

process.on("unhandledRejection", (reason) => {
  writeStartupLog("unhandledRejection", { error: serializeStartupError(reason) });
  console.error("[DESKTOP UNHANDLED REJECTION]", reason);
});

import { appState, emitAgentSession, emitPrinterResult, sanitizeAgentSession } from "./src/state/appState.js";
import { registerAuthIpc } from "./src/ipc/authIpc.js";
import { registerPrinterIpc } from "./src/ipc/printerIpc.js";
import { registerSystemIpc } from "./src/ipc/systemIpc.js";
import { registerJobIpc } from "./src/ipc/jobIpc.js";
import { registerDesktopProtocol, loadFrontend, isAllowedNavigation, getProductionIndexPath, getDesktopAppUrl } from "./src/frontendLoader.js";
import { restoreStoredDesktopAgent, migrateFileLocalStorageAuth, ensureDeviceIdentity } from "./src/agent/authStore.js";
import { startAgentRuntime, stopAgentRuntime, refreshLocalPrinterResult } from "./src/agent/agentRuntime.js";

function reportStartupPrinterDiagnostics() {
  refreshLocalPrinterResult("desktop:startup-list")
    .then((result) => console.log("[DESKTOP STARTUP PRINTERS]", JSON.stringify(result, null, 2)))
    .catch((error) => console.warn("[DESKTOP STARTUP PRINTERS FAILED]", error.message || error));
  diagnosePrinters()
    .then(async (result) => console.log("[DESKTOP STARTUP PRINTER DIAGNOSTICS]", JSON.stringify(result, null, 2)))
    .catch((error) => console.warn("[DESKTOP STARTUP PRINTER DIAGNOSTICS FAILED]", error.message || error));
}

function registerIpcHandlers() {
  if (appState.ipcHandlersRegistered) return;
  appState.ipcHandlersRegistered = true;
  registerAuthIpc();
  registerPrinterIpc();
  registerSystemIpc();
  registerJobIpc();
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
    icon: path.join(__dirname, "assets/icon.png"),
    webPreferences: {
      preload: PRELOAD_PATH,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      plugins: true,
    },
  });

  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("preload-error", (_event, preloadPath, error) => {
    writeStartupLog("preload-error", {
      preloadPath,
      error: serializeStartupError(error),
    });
    console.error("[DESKTOP PRELOAD ERROR]", {
      preloadPath,
      error: error?.stack || error?.message || String(error),
    });
  });
  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    writeStartupLog("render-process-gone", details || {});
    console.error("[DESKTOP RENDER PROCESS GONE]", details);
  });
  mainWindow.webContents.on("did-start-loading", () => {
    writeStartupLog("did-start-loading", {
      url: mainWindow?.webContents.getURL(),
    });
    console.log("[DESKTOP LOAD START]", mainWindow?.webContents.getURL());
  });
  mainWindow.webContents.on("dom-ready", () => {
    writeStartupLog("dom-ready", {
      url: mainWindow?.webContents.getURL(),
    });
    console.log("[DESKTOP DOM READY]", mainWindow?.webContents.getURL());

    if (process.env.PE_DEBUG_RENDERER === "1") {
      mainWindow?.webContents.openDevTools({ mode: "detach" });
    }
  });
  mainWindow.webContents.on("did-stop-loading", () => {
    writeStartupLog("did-stop-loading", {
      url: mainWindow?.webContents.getURL(),
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
      sourceId,
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
      url: validatedURL,
    });
    writeStartupLog("did-fail-load", {
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
    writeStartupLog("did-finish-load", {
      url: mainWindow.webContents.getURL(),
    });
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

  loadFrontend(mainWindow, __dirname, writeStartupLog).catch(async (error) => {
    writeStartupLog("load-frontend:failed", { error: serializeStartupError(error) });
    console.error("[DESKTOP LOAD FRONTEND FAILED]", error);
    try {
      await mainWindow?.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(getDevServerErrorHtml())}`);
    } catch (fallbackError) {
      writeStartupLog("load-frontend-fallback:failed", { error: serializeStartupError(fallbackError) });
    }
  });
}

app.whenReady().then(async () => {
  writeStartupLog("app-ready");
  
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [
          "default-src 'self' app: file:; " +
          "script-src 'self' app: file: 'unsafe-inline' 'unsafe-eval'; " +
          "style-src 'self' app: file: 'unsafe-inline'; " +
          "img-src 'self' app: file: data: blob: https:; " +
          "connect-src 'self' app: file: https: wss:; " +
          "font-src 'self' app: file: data:; " +
          "frame-src 'self' app: file: blob:; " +
          "object-src 'self' app: file: blob:;"
        ]
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
  runStartupStep("restore-stored-agent", () => restoreStoredDesktopAgent()).then((restoredAgent) => {
    if (restoredAgent?.restored) {
      // Delay starting agent background services by 7 seconds to let startup load lightly.
      setTimeout(() => {
        startAgentRuntime("startup-stored-agent").catch((error) => {
          agentSession.lastJobPollError = error.message || "Could not start background desktop agent.";
          writeStartupLog("startup-stored-agent:failed", { error: serializeStartupError(error) });
          emitAgentSession();
          console.warn("[DESKTOP AGENT BACKGROUND] startup failed", agentSession.lastJobPollError);
        });
      }, 7000);
    }
  });
  runStartupStep("migrate-file-local-storage-auth", () => migrateFileLocalStorageAuth());
  runStartupStep("initialize-updater", () => initializeUpdater({ mainWindow }));

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
}).catch((error) => {
  writeStartupLog("app-ready:fatal", { error: serializeStartupError(error) });
  dialog.showErrorBox(
    "PrintEase Desktop failed to start",
    `PrintEase could not open.\n\n${error?.message || String(error)}\n\nLog file: ${getStartupLogPath()}`
  );
});

app.on("before-quit", () => {
  stopAgentRuntime("app-before-quit");
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
