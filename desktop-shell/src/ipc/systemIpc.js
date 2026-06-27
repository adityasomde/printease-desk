import { secureHandle } from "../../security/ipcSecurity.js";
import { app, shell, BrowserWindow } from "electron";
import { getBackendUrl, getApiBaseUrl } from "../../config/backend.js";
import { getDocumentCacheDirectory, getDocumentCacheMaxAgeDays, getDocumentCacheMaxSizeBytes, findCachedDocument } from "../../agent/documentCache.js";
import { checkForUpdates, getUpdateStatus, installUpdateNow } from "../../updater.js";
import { appState, sanitizeAgentSession } from "../state/appState.js";
import { isAllowedNavigation } from "../frontendLoader.js";

const VERSION = "0.1.94";
const DESKTOP_PROTOCOL_ORIGIN = "app://printease";

async function checkBackendHealth() {
  const backendUrl = getBackendUrl({ packaged: app.isPackaged });
  const apiBaseUrl = getApiBaseUrl({ packaged: app.isPackaged });
  try {
    const response = await fetch(`${apiBaseUrl}/health`, { method: "GET", headers: { Accept: "application/json" } });
    const data = await response.json().catch(() => null);
    return { success: response.ok, status: response.status, backendUrl, apiBaseUrl, data };
  } catch (error) {
    return { success: false, backendUrl, apiBaseUrl, error: error.message || "Could not reach backend health endpoint." };
  }
}

export function registerSystemIpc() {
  secureHandle("desktop:status", async () => {
    return {
      success: true,
      isDesktop: true,
      platform: process.platform,
      backendUrl: getBackendUrl({ packaged: app.isPackaged }),
      apiBaseUrl: getApiBaseUrl({ packaged: app.isPackaged }),
      version: VERSION,
      documentCache: {
        directory: getDocumentCacheDirectory(),
        maxAgeDays: getDocumentCacheMaxAgeDays(),
        maxSizeBytes: getDocumentCacheMaxSizeBytes(),
      },
      agentSession: sanitizeAgentSession(),
      printerResult: appState.latestPrinterResult,
    };
  }, app.isPackaged);

  secureHandle("backend:health", () => checkBackendHealth(), app.isPackaged);

  secureHandle("desktop:open-external-url", async (_event, url) => {
    if (!url || typeof url !== "string") return { success: false, message: "URL is required." };
    try {
      const parsedUrl = new URL(url);
      if (parsedUrl.protocol !== "https:") return { success: false, message: "Only HTTPS links can be opened externally." };
      await shell.openExternal(parsedUrl.toString());
      return { success: true };
    } catch (error) {
      return { success: false, message: error?.message || "Could not open link." };
    }
  }, app.isPackaged);

  secureHandle("desktop:download-url", async (_event, payload = {}) => {
    const url = typeof payload === "string" ? payload : payload.url;
    if (!url || typeof url !== "string") return { success: false, message: "Download URL is required." };
    try {
      const parsedUrl = new URL(url);
      if (parsedUrl.protocol !== "https:") return { success: false, message: "Only HTTPS files can be downloaded." };
      if (!appState.mainWindow || appState.mainWindow.isDestroyed()) return { success: false, message: "Desktop window is not ready for download." };
      appState.mainWindow.webContents.downloadURL(parsedUrl.toString());
      return { success: true };
    } catch (error) {
      return { success: false, message: error?.message || "Could not start download." };
    }
  }, app.isPackaged);

  secureHandle("desktop:get-cached-document-url", async (_event, documentId) => {
    const id = String(documentId || "").trim();
    if (!id) return { success: false, message: "Document ID is required." };
    const cachedDocumentPath = await findCachedDocument(id);
    if (!cachedDocumentPath) return { success: false, message: "Document is not cached on this desktop yet." };
    return { success: true, url: `${DESKTOP_PROTOCOL_ORIGIN}/cache/${encodeURIComponent(id)}` };
  }, app.isPackaged);

  secureHandle("desktop:print-html", async (_event, payload = {}) => {
    const html = typeof payload.html === "string" ? payload.html : "";
    const title = typeof payload.title === "string" ? payload.title.slice(0, 120) : "PrintEase";
    if (!html || html.length > 250000) return { success: false, message: "Printable HTML is missing or too large." };
    const printWindow = new BrowserWindow({
      width: 900, height: 1100, show: false, title, parent: appState.mainWindow || undefined,
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    try {
      await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
      await new Promise((resolve, reject) => {
        printWindow.webContents.print({ silent: false, printBackground: true }, (success, failureReason) => {
          if (success) resolve(); else reject(new Error(failureReason || "Print was cancelled or failed."));
        });
      });
      return { success: true };
    } catch (error) {
      return { success: false, message: error?.message || "Could not print QR." };
    } finally {
      if (!printWindow.isDestroyed()) printWindow.close();
    }
  }, app.isPackaged);

  secureHandle("updater:check", () => checkForUpdates(), app.isPackaged);
  secureHandle("updater:status", () => getUpdateStatus(), app.isPackaged);
  secureHandle("updater:install", () => installUpdateNow(), app.isPackaged);

  secureHandle("agent:open-approval-url", async (_event, url) => {
    if (!url || typeof url !== "string") return { success: false, message: "Approval URL is required." };
    let approvalUrl;
    try {
      approvalUrl = new URL(url);
      const allowedOrigin = new URL(getBackendUrl({ packaged: app.isPackaged })).origin;
      if (approvalUrl.protocol !== "https:" || approvalUrl.origin !== allowedOrigin) return { success: false, message: "Approval URL is not trusted." };
    } catch {
      return { success: false, message: "Approval URL is invalid." };
    }
    try {
      await shell.openExternal(approvalUrl.toString());
      return { success: true, message: "Approval URL opened in browser." };
    } catch (error) {
      return { success: false, message: error?.message || "Could not open approval URL." };
    }
  }, app.isPackaged);
}
