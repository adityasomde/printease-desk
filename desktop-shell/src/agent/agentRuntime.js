import { sendHeartbeat } from "../../agent/heartbeat.js";
import { processNextJob, processNextConversionJob, predownloadPendingDocuments } from "../../agent/jobPoller.js";
import { syncPrinters } from "../../agent/statusReporter.js";
import { appState, emitAgentSession, sanitizeAgentSession, emitPrinterResult } from "../state/appState.js";
import { clearStoredDesktopAgent, isAgentPaired } from "./authStore.js";
import { listPrinters } from "../../printer/printExecutor.js";
import { getApiBaseUrl } from "../../config/backend.js";
import { app } from "electron";

function requirePairedAgent() {
  if (!isAgentPaired()) {
    return { success: false, message: "Desktop agent is not paired with a Hub.", session: sanitizeAgentSession() };
  }
  return null;
}

export async function sendAgentHeartbeat() {
  const pairingError = requirePairedAgent();
  if (pairingError) return pairingError;
  const result = await sendHeartbeat({ agentToken: appState.agentSession.accessToken, selectedPrinter: appState.agentSession.selectedPrinterName });
  if (result.success) {
    appState.agentSession.lastHeartbeatAt = new Date().toISOString();
    appState.agentSession.lastHeartbeatError = "";
  } else {
    appState.agentSession.lastHeartbeatError = result.message || "Heartbeat failed.";
    if (result.status === 401 || result.status === 403) {
      await clearStoredDesktopAgent();
      appState.agentSession.lastHeartbeatError = "Stored desktop agent credential was rejected.";
    }
  }
  emitAgentSession();
  return { ...result, session: sanitizeAgentSession() };
}

export function startHeartbeatLoop() {
  if (appState.heartbeatTimer) return { success: true, message: "Heartbeat loop is already running.", session: sanitizeAgentSession() };
  appState.heartbeatTimer = setInterval(() => {
    sendAgentHeartbeat().catch(() => {});
  }, 25000);
  appState.heartbeatTimer.unref?.();
  return { success: true, message: "Heartbeat loop started.", intervalMs: 25000, session: sanitizeAgentSession() };
}

export async function syncPrintersToCloud(printerResult, event = "printers:sync") {
  if (!isAgentPaired()) {
    const result = { success: false, message: "Pair desktop before syncing printers to cloud.", skipped: true };
    appState.agentSession.lastPrinterSyncError = result.message;
    emitAgentSession();
    return result;
  }
  if (!printerResult?.success) {
    const result = { success: false, message: printerResult?.error || printerResult?.message || "Local printer discovery failed; cloud sync skipped." };
    appState.agentSession.lastPrinterSyncError = result.message;
    emitAgentSession();
    return result;
  }
  const syncResult = await syncPrinters({
    agentToken: appState.agentSession.accessToken,
    printers: (printerResult.printers || []).map((printer) => ({
      ...printer,
      isDefault: appState.agentSession.selectedPrinterName ? printer.printerName === appState.agentSession.selectedPrinterName : Boolean(printer.isDefault),
    })),
  });
  if (syncResult.success) {
    appState.agentSession.lastPrinterSyncAt = new Date().toISOString();
    appState.agentSession.lastPrinterSyncError = "";
  } else {
    appState.agentSession.lastPrinterSyncError = syncResult.message || "Cloud printer sync failed.";
  }
  emitAgentSession();
  return syncResult;
}

export async function applyPrinterDiscoveryResult(result, event) {
  appState.latestPrinterResult = result;
  emitPrinterResult(result);
  if (isAgentPaired()) {
    const cloudSync = await syncPrintersToCloud(result, event);
    appState.latestPrinterResult = { ...result, cloudSync };
    emitPrinterResult(appState.latestPrinterResult);
    return appState.latestPrinterResult;
  }
  appState.agentSession.lastPrinterSyncError = result?.success ? "Printer detected locally but not synced to hub. Pair desktop first." : result?.message || result?.error || "Local printer discovery failed.";
  emitAgentSession();
  return result;
}

export async function refreshLocalPrinterResult(event) {
  const result = await listPrinters();
  return applyPrinterDiscoveryResult(result, event);
}

export async function syncLatestPrinterStatus(event) {
  const result = await listPrinters();
  return applyPrinterDiscoveryResult(result, event);
}

export function startPrinterSyncLoop() {
  if (appState.printerSyncTimer) return { success: true, message: "Printer sync loop is already running.", session: sanitizeAgentSession() };
  appState.printerSyncTimer = setInterval(() => {
    syncLatestPrinterStatus("printer-sync-loop").catch(() => {});
  }, 30000);
  appState.printerSyncTimer.unref?.();
  return { success: true, message: "Printer sync loop started.", intervalMs: 30000, session: sanitizeAgentSession() };
}

export async function pollJobsNow(reason = "manual", payload = {}) {
  const pairingError = requirePairedAgent();
  if (pairingError) return pairingError;
  if (appState.isPollingJobs) return { success: true, skipped: true, message: "Job poll already running.", session: sanitizeAgentSession() };
  appState.isPollingJobs = true;
  try {
    const printerName = payload.printerName || appState.agentSession.selectedPrinterName;
    if (!printerName && (!appState.latestPrinterResult?.printers || appState.latestPrinterResult.printers.length === 0)) {
      appState.agentSession.lastJobPollAt = new Date().toISOString();
      appState.agentSession.lastJobPollError = "No local printer selected/available.";
      appState.agentSession.lastJobPollMessage = "Auto-print is online but waiting for a local printer.";
      emitAgentSession();
      return { success: true, skipped: true, message: appState.agentSession.lastJobPollError, session: sanitizeAgentSession() };
    }
    const result = await processNextJob({ agentToken: appState.agentSession.accessToken, printerName });
    appState.agentSession.lastJobPollAt = new Date().toISOString();
    if (result.success && result.job) {
      appState.agentSession.lastJobPollError = "";
      appState.agentSession.lastJobPollMessage = `Printed job ${result.job.jobId || result.job.orderId || ""}`.trim();
    } else if (result.success) {
      appState.agentSession.lastJobPollError = "";
      appState.agentSession.lastJobPollMessage = result.message || "No jobs.";
    } else if (result.status === 401 || result.status === 403) {
      appState.agentSession.lastJobPollError = "Stored desktop agent credential was rejected.";
      await clearStoredDesktopAgent();
    } else if (result.job) {
      appState.agentSession.lastJobPollError = result.message || "Print job failed.";
      appState.agentSession.lastJobPollMessage = `Job failed ${result.job.jobId || result.job.orderId || ""}`.trim();
    }
    emitAgentSession();
    return { ...result, selectedPrinterName: printerName, session: sanitizeAgentSession() };
  } catch (error) {
    appState.agentSession.lastJobPollAt = new Date().toISOString();
    appState.agentSession.lastJobPollError = error.message || "Could not poll print jobs.";
    emitAgentSession();
    return { success: false, message: appState.agentSession.lastJobPollError, session: sanitizeAgentSession() };
  } finally {
    appState.isPollingJobs = false;
  }
}

export async function syncAgentPrinters() {
  const pairingError = requirePairedAgent();
  if (pairingError) return pairingError;
  const printerResult = await refreshLocalPrinterResult("agent:manual-printer-sync");
  if (!printerResult.success) return {
    ...printerResult,
    session: sanitizeAgentSession()
  };
  const heartbeat = await sendAgentHeartbeat();
  const printerSync = printerResult.cloudSync || (await syncPrintersToCloud(printerResult, "agent:manual-printer-sync"));
  const runtime = startJobPollLoop("manual-printer-sync");
  return {
    success: Boolean(heartbeat.success && printerSync.success && runtime.success),
    heartbeat,
    printerSync,
    runtime,
    localPrinters: printerResult.printers,
    session: sanitizeAgentSession()
  };
}

export function startJobPollLoop(reason = "manual-start", payload = {}) {
  const pairingError = requirePairedAgent();
  if (pairingError) return pairingError;

  let startedAny = false;
  const intervalMs = Math.max(3000, Number(payload.intervalMs) || 5000);

  if (!appState.jobPollTimer) {
    appState.jobPollTimer = setInterval(() => {
      pollJobsNow("job-poll-loop").catch(() => {});
    }, intervalMs);
    appState.jobPollTimer.unref?.();
    pollJobsNow(reason, payload).catch(() => {});
    startedAny = true;
  }

  if (!appState.predownloadTimer) {
    startPredownloadLoop(reason);
    startedAny = true;
  }

  if (!appState.conversionTimer) {
    startConversionLoop(reason);
    startedAny = true;
  }

  if (startedAny) {
    emitAgentSession();
  }

  return {
    success: true,
    message: startedAny ? "Job polling and background loops started." : "Job polling is already running.",
    intervalMs,
    session: sanitizeAgentSession()
  };
}

export async function runPredownloadNow(reason = "loop") {
  const pairingError = requirePairedAgent();
  if (pairingError) return pairingError;
  if (appState.isPredownloading) return { success: true, skipped: true, session: sanitizeAgentSession() };
  appState.isPredownloading = true;
  appState.agentSession.predownloadRunning = true;
  appState.agentSession.lastPredownloadMessage = "Checking pending documents for conversion.";
  appState.agentSession.lastPredownloadError = "";
  emitAgentSession();
  try {
    const result = await predownloadPendingDocuments({ agentToken: appState.agentSession.accessToken });
    appState.agentSession.lastPredownloadAt = new Date().toISOString();
    appState.agentSession.lastPredownloadChecked = Number(result?.checked || 0);
    appState.agentSession.lastPredownloadCached = Number(result?.cached || 0);
    appState.agentSession.lastPredownloadFailures = Array.isArray(result?.failures) ? result.failures.length : 0;
    appState.agentSession.lastPredownloadError = result?.success === false ? (result.message || "Predownload failed.") : "";
    appState.agentSession.lastPredownloadMessage = result?.success === false ? appState.agentSession.lastPredownloadError : `Checked ${appState.agentSession.lastPredownloadChecked}, cached/prepared ${appState.agentSession.lastPredownloadCached}.`;
    return { ...result, session: sanitizeAgentSession() };
  } catch (error) {
    appState.agentSession.lastPredownloadAt = new Date().toISOString();
    appState.agentSession.lastPredownloadError = error.message || "Could not predownload pending documents.";
    appState.agentSession.lastPredownloadMessage = appState.agentSession.lastPredownloadError;
    return { success: false, message: appState.agentSession.lastPredownloadError, session: sanitizeAgentSession() };
  } finally {
    appState.isPredownloading = false;
    appState.agentSession.predownloadRunning = false;
    emitAgentSession();
  }
}

export function startPredownloadLoop(reason = "manual-start", payload = {}) {
  const pairingError = requirePairedAgent();
  if (pairingError) return pairingError;
  if (appState.predownloadTimer) return { success: true, message: "Predownload loop is already running.", session: sanitizeAgentSession() };
  const intervalMs = Math.max(60000, Number(payload.predownloadIntervalMs) || 90000);
  appState.predownloadTimer = setInterval(() => {
    runPredownloadNow("predownload-loop").catch(() => {});
  }, intervalMs);
  appState.predownloadTimer.unref?.();
  appState.agentSession.predownloadLoopRunning = true;
  runPredownloadNow(reason).catch(() => {});
  return { success: true, message: "Predownload loop started.", intervalMs, session: sanitizeAgentSession() };
}

export async function runConversionNow(reason = "loop") {
  const pairingError = requirePairedAgent();
  if (pairingError) return pairingError;
  if (appState.isConverting) return { success: true, skipped: true };
  appState.isConverting = true;
  appState.agentSession.conversionRunning = true;
  appState.agentSession.lastConversionMessage = "Running conversion loop...";
  emitAgentSession();
  try {
    const result = await processNextConversionJob({ agentToken: appState.agentSession.accessToken });
    appState.agentSession.lastConversionAt = new Date().toISOString();
    if (result.success && result.processed) {
      appState.agentSession.lastConversionError = "";
      appState.agentSession.lastConversionMessage = `Converted ${result.documentId}.`;
      if (result.details?.enginePath) appState.agentSession.converterPath = result.details.enginePath;
    } else if (result.success) {
      appState.agentSession.lastConversionMessage = "No pending conversions.";
    } else {
      appState.agentSession.lastConversionError = result.message || "Conversion failed.";
      appState.agentSession.lastConversionMessage = appState.agentSession.lastConversionError;
      if (result.details?.enginePath) appState.agentSession.converterPath = result.details.enginePath;
    }
  } catch (error) {
    appState.agentSession.lastConversionError = error.message || "Conversion error.";
    appState.agentSession.lastConversionMessage = appState.agentSession.lastConversionError;
  } finally {
    appState.isConverting = false;
    appState.agentSession.conversionRunning = false;
    emitAgentSession();
  }
}

export function startConversionLoop(reason = "manual-start") {
  const pairingError = requirePairedAgent();
  if (pairingError) return pairingError;
  if (appState.conversionTimer) return { success: true, message: "Conversion loop is already running." };
  appState.conversionTimer = setInterval(() => {
    runConversionNow("conversion-loop").catch(() => {});
  }, 4000);
  appState.conversionTimer.unref?.();
  appState.agentSession.conversionLoopRunning = true;
  emitAgentSession();
  runConversionNow(reason).catch(() => {});
  return { success: true, message: "Conversion loop started." };
}

export async function startAgentRuntime(reason) {
  const heartbeat = await sendAgentHeartbeat();
  const printerResult = await refreshLocalPrinterResult(reason + ":printer-sync");
  const loop = startHeartbeatLoop();
  const printerLoop = startPrinterSyncLoop();
  const jobLoop = startJobPollLoop(reason + ":job-poll");
  const predownloadLoop = startPredownloadLoop(reason + ":predownload");
  const conversionLoop = startConversionLoop(reason + ":conversion");
  return {
    success: Boolean(heartbeat.success && loop.success && printerLoop.success && jobLoop.success && predownloadLoop.success && conversionLoop.success),
    heartbeat,
    printerResult,
    loop,
    printerLoop,
    jobLoop,
    predownloadLoop,
    conversionLoop,
    session: sanitizeAgentSession(),
  };
}

export function stopAgentRuntime(reason) {
  if (appState.heartbeatTimer) clearInterval(appState.heartbeatTimer);
  if (appState.printerSyncTimer) clearInterval(appState.printerSyncTimer);
  if (appState.jobPollTimer) clearInterval(appState.jobPollTimer);
  if (appState.predownloadTimer) clearInterval(appState.predownloadTimer);
  if (appState.conversionTimer) clearInterval(appState.conversionTimer);
  appState.heartbeatTimer = null;
  appState.printerSyncTimer = null;
  appState.jobPollTimer = null;
  appState.predownloadTimer = null;
  appState.conversionTimer = null;
  appState.agentSession.predownloadLoopRunning = false;
  appState.agentSession.conversionLoopRunning = false;
  appState.agentSession.conversionRunning = false;
  appState.isConverting = false;
}

export async function restartAgentRuntime(reason = "manual-restart") {
  stopAgentRuntime(`${reason}:stop`);
  return startAgentRuntime(`${reason}:start`);
}

export function stopAgentPolling() {
  if (appState.jobPollTimer) {
    clearInterval(appState.jobPollTimer);
    appState.jobPollTimer = null;
  }
  if (appState.predownloadTimer) {
    clearInterval(appState.predownloadTimer);
    appState.predownloadTimer = null;
    appState.agentSession.predownloadLoopRunning = false;
  }
  if (appState.conversionTimer) {
    clearInterval(appState.conversionTimer);
    appState.conversionTimer = null;
    appState.isConverting = false;
    appState.agentSession.conversionLoopRunning = false;
    appState.agentSession.conversionRunning = false;
  }
  emitAgentSession();
  return { success: true, message: "Job polling stopped.", session: sanitizeAgentSession() };
}
