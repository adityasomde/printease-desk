import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const { app, BrowserWindow, dialog } = require("electron");

const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const UPDATE_LOG_FILE = "updater.log";

let mainWindow = null;
let autoUpdater = null;
let updateStatus = {
  status: "idle",
  message: "Updater has not started.",
};
let updateCheckTimer = null;
let updateDownloaded = false;
let registered = false;
let isPrintingActive = () => false;

function getAutoUpdater() {
  if (!autoUpdater) {
    autoUpdater = require("electron-updater").autoUpdater;
  }

  return autoUpdater;
}

function getUpdaterLogPath() {
  try {
    const userData = app.getPath("userData");
    fs.mkdirSync(userData, { recursive: true });
    return path.join(userData, UPDATE_LOG_FILE);
  } catch {
    return path.join(process.cwd(), UPDATE_LOG_FILE);
  }
}

function readPackageType() {
  try {
    const packageTypePath = path.join(process.resourcesPath || "", "package-type");
    if (!fs.existsSync(packageTypePath)) return "";
    return fs.readFileSync(packageTypePath, "utf8").trim();
  } catch {
    return "";
  }
}

function getUpdaterDiagnostics() {
  const updater = getAutoUpdater();
  return {
    currentVersion: app.getVersion(),
    packaged: app.isPackaged,
    platform: process.platform,
    arch: process.arch,
    updaterClass: updater?.constructor?.name || "unknown",
    packageType: readPackageType() || (process.env.APPIMAGE ? "AppImage" : ""),
    hasAppImageEnv: Boolean(process.env.APPIMAGE),
    appImagePath: process.env.APPIMAGE || "",
    resourcesPath: process.resourcesPath || "",
    updaterLogPath: getUpdaterLogPath(),
  };
}

function writeUpdaterLog(event, detail = {}) {
  const entry = {
    at: new Date().toISOString(),
    event,
    ...getUpdaterDiagnostics(),
    ...detail,
  };

  try {
    fs.appendFileSync(getUpdaterLogPath(), `${JSON.stringify(entry)}\n`, "utf8");
  } catch {
    // Update diagnostics should never block app startup or printing.
  }
}

function serializeError(error) {
  return error?.message || "Update check failed.";
}

export function sendUpdateStatus(status) {
  updateStatus = {
    ...getUpdaterDiagnostics(),
    ...updateStatus,
    ...status,
    updatedAt: new Date().toISOString(),
  };

  writeUpdaterLog(updateStatus.status || "status", {
    message: updateStatus.message,
    version: updateStatus.version,
    error: updateStatus.error,
  });

  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send("updater:status", updateStatus);
    }
  }

  return updateStatus;
}

async function promptInstallDownloadedUpdate() {
  const targetWindow = mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
  const options = {
    type: "info",
    title: "PrintEase Desktop Update",
    message: "Update downloaded. Install now?",
    buttons: ["Install Now", "Later"],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
  };
  const response = targetWindow
    ? await dialog.showMessageBox(targetWindow, options)
    : await dialog.showMessageBox(options);

  if (response.response === 0) {
    return installUpdateNow();
  }

  return getUpdateStatus();
}

function registerUpdaterEvents() {
  if (registered) return;
  registered = true;

  const updater = getAutoUpdater();

  updater.autoDownload = false;
  updater.autoInstallOnAppQuit = false;
  updater.logger = {
    info: (message) => writeUpdaterLog("info", { message }),
    warn: (message) => writeUpdaterLog("warn", { message }),
    error: (message) => writeUpdaterLog("error", { message }),
    debug: (message) => writeUpdaterLog("debug", { message }),
  };

  updater.on("checking-for-update", () => {
    sendUpdateStatus({ status: "checking", message: "Checking for updates." });
  });

  updater.on("update-available", (info) => {
    updateDownloaded = false;
    sendUpdateStatus({
      status: "update-available",
      message: "Update available. Downloading in the background.",
      version: info?.version,
    });

    updater.downloadUpdate().catch((error) => {
      sendUpdateStatus({ status: "error", message: serializeError(error) });
    });
  });

  updater.on("download-progress", (progress = {}) => {
    sendUpdateStatus({
      status: "downloading",
      message: "Downloading update.",
      percent: Math.round(progress.percent || 0),
    });
  });

  updater.on("update-downloaded", (info) => {
    updateDownloaded = true;
    sendUpdateStatus({
      status: "downloaded",
      message: "Update downloaded. Waiting for approval to install.",
      version: info?.version,
    });

    promptInstallDownloadedUpdate().catch((error) => {
      sendUpdateStatus({ status: "error", message: serializeError(error) });
    });
  });

  updater.on("update-not-available", (info) => {
    sendUpdateStatus({
      status: "up-to-date",
      message: "PrintEase Desktop is up to date.",
      version: info?.version,
    });
  });

  updater.on("error", (error) => {
    sendUpdateStatus({ status: "error", message: serializeError(error) });
  });
}

export function initializeUpdater({ mainWindow: window, isPrintingActive: printingActiveCheck } = {}) {
  mainWindow = window || mainWindow;
  isPrintingActive = printingActiveCheck || (() => false);

  if (!app.isPackaged) {
    return sendUpdateStatus({
      status: "idle",
      message: "Updates are available only in packaged app.",
    });
  }

  registerUpdaterEvents();
  writeUpdaterLog("initialize");

  // Delay the initial update check to prevent startup bandwidth spam.
  setTimeout(() => {
    checkForUpdates().catch((error) => {
      sendUpdateStatus({ status: "error", message: serializeError(error) });
    });
  }, 20000);

  if (!updateCheckTimer) {
    updateCheckTimer = setInterval(() => {
      checkForUpdates().catch((error) => {
        sendUpdateStatus({ status: "error", message: serializeError(error) });
      });
    }, UPDATE_CHECK_INTERVAL_MS);
    updateCheckTimer.unref?.();
  }

  return getUpdateStatus();
}

export async function checkForUpdates() {
  if (!app.isPackaged) {
    return sendUpdateStatus({
      status: "idle",
      message: "Updates are available only in packaged app.",
    });
  }

  registerUpdaterEvents();
  sendUpdateStatus({ status: "checking", message: "Checking for updates." });
  writeUpdaterLog("manual-check-start");
  const result = await getAutoUpdater().checkForUpdates();
  writeUpdaterLog("manual-check-finished", {
    updateInfo: result?.updateInfo || null,
  });
  return getUpdateStatus();
}

export function getUpdateStatus() {
  return updateStatus;
}

export function installUpdateNow() {
  if (!app.isPackaged) {
    return sendUpdateStatus({
      status: "idle",
      message: "Updates are available only in packaged app.",
    });
  }

  if (!updateDownloaded) {
    return sendUpdateStatus({
      status: updateStatus.status || "idle",
      message: "No downloaded update is ready to install.",
    });
  }

  if (isPrintingActive?.() || false) {
    return sendUpdateStatus({
      status: "downloaded",
      message: "Update downloaded. Finish printing before installing.",
    });
  }

  sendUpdateStatus({ status: "installing", message: "Installing update." });
  setImmediate(() => getAutoUpdater().quitAndInstall(false, true));
  return getUpdateStatus();
}
