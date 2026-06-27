import fs from "node:fs";
import electron from "electron"; const { app, shell, net } = electron;
import { agentState, agentSession } from "../state/agentState.js";
import { getBackendUrl, getApiBaseUrl } from "../../config/backend.js";
import { getDocumentCacheDirectory, getDocumentCacheMaxAgeDays, getDocumentCacheMaxSizeBytes } from "../../agent/documentCache.js";
const VERSION = "0.1.78";
import { secureHandle } from "../../security/ipcSecurity.js";
import { checkForUpdates, getUpdateStatus, installUpdateNow } from "../../updater.js";
import { isSafeApprovalUrl } from "../../security/urlValidator.js";
// Re-importing services
import { runPredownloadNow, pollJobsNow, runConversionNow, startAgentRuntime, stopAgentRuntime, syncAgentPrinters, pollAgentOnce, startAgentPolling, stopAgentPolling } from "../services/pollingService.js";
import { getStoredDesktopAuth, setStoredDesktopAuth, clearStoredDesktopAuth, getStoredDesktopAgent, setStoredDesktopAgent, restoreStoredDesktopAgent, clearStoredDesktopAgent, migrateFileLocalStorageAuth, ensureDeviceIdentity, sanitizeAgentSession, startAgentPairing, confirmAgentPairing, sendAgentHeartbeat } from "../services/authService.js";
import { diagnoseWindowsPrintHelperSafe, diagnoseLibreOfficeSafe, checkBackendHealth, reportPrinterDiagnostic, syncPrintersToCloud, applyPrinterDiscoveryResult, refreshLocalPrinterResult, syncLatestPrinterStatus, selectDesktopPrinter } from "../services/diagnosticService.js";

export function registerIpcHandlers() {
  if (agentState.ipcHandlersRegistered) return;
  agentState.ipcHandlersRegistered = true;
  secureHandle("desktop:status", async () => {
    const printerResult = agentState.latestPrinterResult || (await refreshLocalPrinterResult("desktop:status"));
    return {
      success: true,
      isDesktop: true,
      platform: process.platform,
      backendUrl: getBackendUrl({
        packaged: app.isPackaged
      }),
      apiBaseUrl: getApiBaseUrl({
        packaged: app.isPackaged
      }),
      version: VERSION,
      documentCache: {
        directory: getDocumentCacheDirectory(),
        maxAgeDays: getDocumentCacheMaxAgeDays(),
        maxSizeBytes: getDocumentCacheMaxSizeBytes()
      },
      printerResult
    };
  }, app.isPackaged);
  secureHandle("backend:health", () => checkBackendHealth(), app.isPackaged);
  secureHandle("desktop:open-external-url", async (_event, url) => {
    if (!url || typeof url !== "string") {
      return {
        success: false,
        message: "URL is required."
      };
    }
    try {
      const parsedUrl = new URL(url);
      if (parsedUrl.protocol !== "https:") {
        return {
          success: false,
          message: "Only HTTPS links can be opened externally."
        };
      }
      await shell.openExternal(parsedUrl.toString());
      return {
        success: true
      };
    } catch (error) {
      return {
        success: false,
        message: error?.message || "Could not open link."
      };
    }
  }, app.isPackaged);
  secureHandle("desktop:download-url", async (_event, payload = {}) => {
    const url = typeof payload === "string" ? payload : payload.url;
    if (!url || typeof url !== "string") {
      return {
        success: false,
        message: "Download URL is required."
      };
    }
    try {
      const parsedUrl = new URL(url);
      if (parsedUrl.protocol !== "https:") {
        return {
          success: false,
          message: "Only HTTPS files can be downloaded."
        };
      }
      if (!agentState.mainWindow || agentState.mainWindow.isDestroyed()) {
        return {
          success: false,
          message: "Desktop window is not ready for download."
        };
      }
      agentState.mainWindow.webContents.downloadURL(parsedUrl.toString());
      return {
        success: true
      };
    } catch (error) {
      return {
        success: false,
        message: error?.message || "Could not start download."
      };
    }
  }, app.isPackaged);
  secureHandle("desktop:get-cached-document-url", async (_event, documentId) => {
    const id = String(documentId || "").trim();
    if (!id) {
      return {
        success: false,
        message: "Document ID is required."
      };
    }
    const cachedDocumentPath = await findCachedDocument(id);
    if (!cachedDocumentPath) {
      return {
        success: false,
        message: "Document is not cached on this desktop yet."
      };
    }
    return {
      success: true,
      url: `${DESKTOP_PROTOCOL_ORIGIN}/cache/${encodeURIComponent(id)}`
    };
  }, app.isPackaged);
  secureHandle("desktop:print-html", async (_event, payload = {}) => {
    const html = typeof payload.html === "string" ? payload.html : "";
    const title = typeof payload.title === "string" ? payload.title.slice(0, 120) : "PrintEase";
    if (!html || html.length > 250000) {
      return {
        success: false,
        message: "Printable HTML is missing or too large."
      };
    }
    const printWindow = new BrowserWindow({
      width: 900,
      height: 1100,
      show: false,
      title,
      parent: agentState.mainWindow || undefined,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    });
    try {
      await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
      await new Promise((resolve, reject) => {
        printWindow.webContents.print({
          silent: false,
          printBackground: true
        }, (success, failureReason) => {
          if (success) resolve();else reject(new Error(failureReason || "Print was cancelled or failed."));
        });
      });
      return {
        success: true
      };
    } catch (error) {
      return {
        success: false,
        message: error?.message || "Could not print QR."
      };
    } finally {
      if (!printWindow.isDestroyed()) {
        printWindow.close();
      }
    }
  }, app.isPackaged);
  secureHandle("printers:list", () => refreshLocalPrinterResult("printers:list"), app.isPackaged);
  secureHandle("printers:select", selectDesktopPrinter, app.isPackaged);
  secureHandle("printers:diagnose", async () => {
    const result = await diagnosePrinters();
    console.log("[DESKTOP PRINTER DIAGNOSTICS]", JSON.stringify(result, null, 2));
    await reportPrinterDiagnostic("printers:diagnose", result);
    return result;
  }, app.isPackaged);
  secureHandle("printers:test-print", (_event, payload = {}) => {
    const printerName = (typeof payload === "string" ? payload : payload?.printerName) || agentSession.selectedPrinterName;
    return testPrint(printerName);
  }, app.isPackaged);
  secureHandle("printing:stop", () => stopPrinting(), app.isPackaged);
  secureHandle("printer:diagnoseWindowsHelper", () => diagnoseWindowsPrintHelperSafe(), app.isPackaged);
  secureHandle("conversion:diagnoseLibreOffice", () => diagnoseLibreOfficeSafe(), app.isPackaged);
  secureHandle("agent:status", () => sanitizeAgentSession(), app.isPackaged);
  secureHandle("agent:start-pairing", startAgentPairing, app.isPackaged);
  secureHandle("agent:open-approval-url", async (_event, url) => {
    if (!url || typeof url !== "string") {
      return {
        success: false,
        message: "Approval URL is required."
      };
    }
    let approvalUrl;
    try {
      approvalUrl = new URL(url);
      const allowedOrigin = new URL(getBackendUrl({
        packaged: app.isPackaged
      })).origin;
      if (approvalUrl.protocol !== "https:" || approvalUrl.origin !== allowedOrigin) {
        return {
          success: false,
          message: "Approval URL is not trusted."
        };
      }
    } catch {
      return {
        success: false,
        message: "Approval URL is invalid."
      };
    }
    try {
      await shell.openExternal(approvalUrl.toString());
      return {
        success: true,
        message: "Approval URL opened in browser."
      };
    } catch (error) {
      return {
        success: false,
        message: error?.message || "Could not open approval URL."
      };
    }
  }, app.isPackaged);
  secureHandle("agent:confirm-pairing", confirmAgentPairing, app.isPackaged);
  secureHandle("agent:heartbeat", async () => {
    const result = await sendAgentHeartbeat();
    if (result.success) startHeartbeatLoop();
    return result;
  }, app.isPackaged);
  secureHandle("agent:sync-printers", syncAgentPrinters, app.isPackaged);
  secureHandle("agent:predownload-now", () => runPredownloadNow("manual-conversion-check"), app.isPackaged);
  secureHandle("agent:poll-once", pollAgentOnce, app.isPackaged);
  secureHandle("agent:start-polling", startAgentPolling, app.isPackaged);
  secureHandle("agent:stop-polling", stopAgentPolling, app.isPackaged);
  secureHandle("updater:check", () => checkForUpdates(), app.isPackaged);
  secureHandle("updater:status", () => getUpdateStatus(), app.isPackaged);
  secureHandle("updater:install", () => installUpdateNow(), app.isPackaged);
  secureHandle("desktopAuth:get", () => getStoredDesktopAuth(), app.isPackaged);
  secureHandle("desktopAuth:set", setStoredDesktopAuth, app.isPackaged);
  secureHandle("desktopAuth:clear", () => clearStoredDesktopAuth(), app.isPackaged);
  secureHandle("desktopAgent:get", () => getStoredDesktopAgent(), app.isPackaged);
  secureHandle("desktopAgent:set", setStoredDesktopAgent, app.isPackaged);
  secureHandle("desktopAgent:clear", () => clearStoredDesktopAgent(), app.isPackaged);
  secureHandle("desktopAgent:device-identity", async () => {
    await ensureDeviceIdentity();
    return {
      success: true,
      deviceId: agentSession.deviceId,
      deviceName: agentSession.deviceName
    };
  }, app.isPackaged);
}

