import { BrowserWindow } from "electron";

export const appState = {
  mainWindow: null,
  isPredownloading: false,
  isConverting: false,
  isPollingJobs: false,
  heartbeatTimer: null,
  printerSyncTimer: null,
  jobPollTimer: null,
  predownloadTimer: null,
  conversionTimer: null,
  latestPrinterResult: null,
  agentSession: {
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
    conversionRunning: false,
    conversionLoopRunning: false,
    lastConversionMessage: "",
    lastConversionError: "",
    lastConversionAt: "",
    converterPath: "",
  }
};

export function sanitizeAgentSession() {
  const paired = Boolean(
    appState.agentSession.agentId &&
    appState.agentSession.hubId &&
    appState.agentSession.accessToken
  );

  return {
    ...appState.agentSession,
    success: true,
    accessToken: undefined,
    paired,
    heartbeatRunning: Boolean(appState.heartbeatTimer),
    printerSyncRunning: Boolean(appState.printerSyncTimer),
    polling: Boolean(appState.jobPollTimer),
    predownloadRunning: Boolean(appState.isPredownloading),
    predownloadLoopRunning: Boolean(appState.predownloadTimer),
    conversionRunning: Boolean(appState.isConverting),
    conversionLoopRunning: Boolean(appState.conversionTimer),
    autoPrintRunning: Boolean(
      paired &&
      appState.heartbeatTimer &&
      appState.printerSyncTimer &&
      appState.jobPollTimer
    ),
  };
}

export function emitAgentSession() {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send("agent:updated", sanitizeAgentSession());
    }
  }
}

export function emitPrinterResult(result) {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send("agent:printers", result);
    }
  }
}
