const { contextBridge, ipcRenderer } = require("electron");

try {
  console.log(`[DESKTOP PRELOAD] loading ${window.location.href}`);

  const agentBridge = {
    getStored: () => ipcRenderer.invoke("desktopAgent:get"),
    setStored: (payload) => ipcRenderer.invoke("desktopAgent:set", payload),
    clearStored: () => ipcRenderer.invoke("desktopAgent:clear"),
    getDeviceIdentity: () => ipcRenderer.invoke("desktopAgent:device-identity"),
  };

  const printerBridge = {
    diagnoseWindowsHelper: () => ipcRenderer.invoke("printer:diagnoseWindowsHelper"),
  };

  const bridge = {
    isDesktop: true,
    bridgeVersion: "0.1.18-cjs",
    agent: agentBridge,
    printer: printerBridge,
    getDesktopStatus: () => ipcRenderer.invoke("desktop:status"),
    checkBackendHealth: () => ipcRenderer.invoke("backend:health"),
    listPrinters: () => ipcRenderer.invoke("printers:list"),
    selectPrinter: (payload) => ipcRenderer.invoke("printers:select", payload),
    onPrintersUpdated: (callback) => {
      const listener = (_event, result) => callback(result);
      ipcRenderer.on("printers:updated", listener);
      return () => ipcRenderer.removeListener("printers:updated", listener);
    },
    diagnosePrinters: () => ipcRenderer.invoke("printers:diagnose"),
    diagnoseWindowsPrintHelper: () => ipcRenderer.invoke("printer:diagnoseWindowsHelper"),
    testPrint: (payload) => ipcRenderer.invoke("printers:test-print", payload),
    stopPrinting: () => ipcRenderer.invoke("printing:stop"),
    getAgentStatus: () => ipcRenderer.invoke("agent:status"),
    onAgentUpdated: (callback) => {
      const listener = (_event, result) => callback(result);
      ipcRenderer.on("agent:updated", listener);
      return () => ipcRenderer.removeListener("agent:updated", listener);
    },
    startPairing: (payload) => ipcRenderer.invoke("agent:start-pairing", payload),
    openApprovalUrl: (url) => ipcRenderer.invoke("agent:open-approval-url", url),
    confirmPairing: () => ipcRenderer.invoke("agent:confirm-pairing"),
    sendHeartbeat: () => ipcRenderer.invoke("agent:heartbeat"),
    syncPrinters: () => ipcRenderer.invoke("agent:sync-printers"),
    pollPrintJobs: (payload) => ipcRenderer.invoke("agent:poll-once", payload),
    startJobPolling: (payload) => ipcRenderer.invoke("agent:start-polling"),
    stopJobPolling: () => ipcRenderer.invoke("agent:stop-polling"),
    checkForUpdates: () => ipcRenderer.invoke("updater:check"),
    getUpdateStatus: () => ipcRenderer.invoke("updater:status"),
    installUpdateNow: () => ipcRenderer.invoke("updater:install"),
    getStoredAuth: () => ipcRenderer.invoke("desktopAuth:get"),
    saveStoredAuth: (payload) => ipcRenderer.invoke("desktopAuth:set", payload),
    clearStoredAuth: () => ipcRenderer.invoke("desktopAuth:clear"),
    getStoredAgent: () => ipcRenderer.invoke("desktopAgent:get"),
    saveStoredAgent: (payload) => ipcRenderer.invoke("desktopAgent:set", payload),
    clearStoredAgent: () => ipcRenderer.invoke("desktopAgent:clear"),
    getDeviceIdentity: () => ipcRenderer.invoke("desktopAgent:device-identity"),
    onUpdateStatus: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on("updater:status", listener);
      return () => ipcRenderer.removeListener("updater:status", listener);
    },
  };

  contextBridge.exposeInMainWorld("printeaseDesktop", bridge);
  console.log(`[DESKTOP PRELOAD] bridge exposed ${bridge.bridgeVersion}`);
} catch (error) {
  console.error(`[DESKTOP PRELOAD] failed ${error?.stack || error?.message || String(error)}`);
  throw error;
}
