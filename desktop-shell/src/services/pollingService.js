const PRINTER_SYNC_INTERVAL_MS = 30000;
const JOB_POLL_INTERVAL_MS = 5000;
const PREDOWNLOAD_INTERVAL_MS = 90000;
import fs from "node:fs";
import path from "node:path";
import electron from "electron"; const { net } = electron;
import { appState } from "../state/appState.js";
import { getApiBaseUrl, getBackendUrl } from "../../config/backend.js";
import { stopPrinting, listPrinters } from "../../printer/printExecutor.js";

export function stopAgentRuntime(reason = "stopped") {
  if (appState.heartbeatTimer) {
    clearInterval(appState.heartbeatTimer);
    appState.heartbeatTimer = null;
  }
  if (appState.printerSyncTimer) {
    clearInterval(appState.printerSyncTimer);
    appState.printerSyncTimer = null;
  }
  if (appState.jobPollTimer) {
    clearInterval(appState.jobPollTimer);
    appState.jobPollTimer = null;
  }
  if (appState.predownloadTimer) {
    clearInterval(appState.predownloadTimer);
    appState.predownloadTimer = null;
  }
  if (appState.conversionTimer) {
    clearInterval(appState.conversionTimer);
    appState.conversionTimer = null;
  }
  appState.isPollingJobs = false;
  appState.isPredownloading = false;
  appState.isConverting = false;
  appState.agentSession.predownloadRunning = false;
  appState.agentSession.predownloadLoopRunning = false;
  console.log("[DESKTOP AGENT BACKGROUND] stopped", reason);
  emitAgentSession();
  return {
    success: true,
    message: "Background desktop agent stopped.",
    reason,
    session: sanitizeAgentSession()
  };
}

export async function runPredownloadNow(reason = "manual") {
  const pairingError = requirePairedAgent();
  if (pairingError) return pairingError;
  if (appState.isPredownloading) {
    return {
      success: true,
      skipped: true,
      message: "Predownload already running.",
      session: sanitizeAgentSession()
    };
  }
  appState.isPredownloading = true;
  appState.agentSession.predownloadRunning = true;
  appState.agentSession.lastPredownloadMessage = "Checking pending documents for conversion.";
  appState.agentSession.lastPredownloadError = "";
  emitAgentSession();
  try {
    const result = await predownloadPendingDocuments({
      agentToken: appState.agentSession.accessToken
    });
    appState.agentSession.lastPredownloadAt = new Date().toISOString();
    appState.agentSession.lastPredownloadChecked = Number(result?.checked || 0);
    appState.agentSession.lastPredownloadCached = Number(result?.cached || 0);
    appState.agentSession.lastPredownloadFailures = Array.isArray(result?.failures) ? result.failures.length : 0;
    appState.agentSession.lastPredownloadError = result?.success === false ? result.message || "Predownload failed." : "";
    appState.agentSession.lastPredownloadMessage = result?.success === false ? appState.agentSession.lastPredownloadError : `Checked ${appState.agentSession.lastPredownloadChecked}, cached/prepared ${appState.agentSession.lastPredownloadCached}, failures ${appState.agentSession.lastPredownloadFailures}.`;
    if (result?.cached) {
      console.log("[DESKTOP AGENT BACKGROUND] predownload cached pending documents", {
        reason,
        cached: result.cached,
        checked: result.checked,
        failures: Array.isArray(result.failures) ? result.failures.length : 0
      });
    }
    return {
      ...result,
      session: sanitizeAgentSession()
    };
  } catch (error) {
    appState.agentSession.lastPredownloadAt = new Date().toISOString();
    appState.agentSession.lastPredownloadError = error.message || "Could not predownload pending documents.";
    appState.agentSession.lastPredownloadMessage = appState.agentSession.lastPredownloadError;
    return {
      success: false,
      message: appState.agentSession.lastPredownloadError,
      session: sanitizeAgentSession()
    };
  } finally {
    appState.isPredownloading = false;
    appState.agentSession.predownloadRunning = false;
    emitAgentSession();
  }
}

export async function pollJobsNow(reason = "manual", payload = {}) {
  const pairingError = requirePairedAgent();
  if (pairingError) return pairingError;
  if (appState.isPollingJobs) {
    console.log("[DESKTOP AGENT BACKGROUND] poll skipped because previous poll still running", {
      reason
    });
    return {
      success: true,
      skipped: true,
      message: "Job poll already running.",
      session: sanitizeAgentSession()
    };
  }
  appState.isPollingJobs = true;
  try {
    if (!payload.printerName && !resolveLocalPrinterName()) {
      await syncLatestPrinterStatus(`${reason}:resolve-printer`).catch(() => null);
    }
    const printerName = payload.printerName || resolveLocalPrinterName();
    const knownPrinters = Array.isArray(appState.latestPrinterResult?.printers) ? appState.latestPrinterResult.printers : [];
    if (!printerName && knownPrinters.length === 0) {
      appState.agentSession.lastJobPollAt = new Date().toISOString();
      appState.agentSession.lastJobPollError = "No local printer selected/available.";
      appState.agentSession.lastJobPollMessage = "Auto-print is online but waiting for a local printer.";
      console.warn("[DESKTOP AGENT BACKGROUND] no local printer selected/available", {
        reason
      });
      emitAgentSession();
      return {
        success: true,
        skipped: true,
        message: appState.agentSession.lastJobPollError,
        session: sanitizeAgentSession()
      };
    }
    const result = await processNextJob({
      agentToken: appState.agentSession.accessToken,
      printerName
    });
    appState.agentSession.lastJobPollAt = new Date().toISOString();
    if (result.success && result.job) {
      appState.agentSession.lastJobPollError = "";
      appState.agentSession.lastJobPollMessage = `Printed job ${result.job.jobId || result.job.orderId || ""}`.trim();
      console.log("[DESKTOP AGENT BACKGROUND] job poll success/job printed", {
        reason,
        printerName,
        jobId: result.job?.jobId || null,
        orderId: result.job?.orderId || null
      });
    } else if (result.success) {
      appState.agentSession.lastJobPollError = "";
      appState.agentSession.lastJobPollMessage = result.message || "No jobs.";
      console.log("[DESKTOP AGENT BACKGROUND] job poll success/no jobs", {
        reason,
        printerName: printerName || null
      });
    } else if (result.status === 401 || result.status === 403) {
      appState.agentSession.lastJobPollError = "Stored desktop agent credential was rejected. Register or pair this desktop again.";
      console.warn("[DESKTOP AGENT BACKGROUND] stopped auth rejected", {
        reason,
        status: result.status,
        message: result.message
      });
      await clearStoredDesktopAgent();
    } else if (result.job) {
      appState.agentSession.lastJobPollError = result.message || "Print job failed.";
      appState.agentSession.lastJobPollMessage = `Job failed ${result.job.jobId || result.job.orderId || ""}`.trim();
      console.warn("[DESKTOP AGENT BACKGROUND] job poll success/job failed", {
        reason,
        printerName,
        jobId: result.job?.jobId || null,
        orderId: result.job?.orderId || null,
        message: result.message
      });
    }
    emitAgentSession();
    return {
      ...result,
      selectedPrinterName: printerName,
      session: sanitizeAgentSession()
    };
  } catch (error) {
    appState.agentSession.lastJobPollAt = new Date().toISOString();
    appState.agentSession.lastJobPollError = error.message || "Could not poll print jobs.";
    console.warn("[DESKTOP AGENT BACKGROUND] job poll fail", {
      reason,
      printerName: printerName || null,
      message: appState.agentSession.lastJobPollError
    });
    emitAgentSession();
    return {
      success: false,
      message: appState.agentSession.lastJobPollError,
      session: sanitizeAgentSession()
    };
  } finally {
    appState.isPollingJobs = false;
  }
}

export async function runConversionNow(reason = "loop") {
  const pairingError = requirePairedAgent();
  if (pairingError) return pairingError;
  if (appState.isConverting) return {
    success: true,
    skipped: true
  };
  appState.isConverting = true;
  appState.agentSession.lastConversionMessage = "Running conversion loop...";
  emitAgentSession();
  try {
    const result = await processNextConversionJob({
      agentToken: appState.agentSession.accessToken
    });
    appState.agentSession.lastConversionAt = new Date().toISOString();
    if (result.success && result.processed) {
      appState.agentSession.lastConversionError = "";
      appState.agentSession.lastConversionMessage = `Converted ${result.documentId}.`;
      if (result.details && result.details.enginePath) {
        appState.agentSession.converterPath = result.details.enginePath;
      }
    } else if (result.success) {
      appState.agentSession.lastConversionMessage = "No pending conversions.";
    } else {
      appState.agentSession.lastConversionError = result.message || "Conversion failed.";
      appState.agentSession.lastConversionMessage = appState.agentSession.lastConversionError;
      if (result.details && result.details.enginePath) {
        appState.agentSession.converterPath = result.details.enginePath;
      }
    }
  } catch (error) {
    appState.agentSession.lastConversionError = error.message || "Conversion error.";
    appState.agentSession.lastConversionMessage = appState.agentSession.lastConversionError;
  } finally {
    appState.isConverting = false;
    emitAgentSession();
  }
}

export async function startAgentRuntime(reason) {
  console.log("[DESKTOP AGENT BACKGROUND]", reason, {
    paired: isAgentPaired(),
    selectedPrinterName: appState.agentSession.selectedPrinterName || null
  });
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
    session: sanitizeAgentSession()
  };
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

export async function pollAgentOnce(_event, payload = {}) {
  return pollJobsNow("manual-poll", payload);
}

export function startAgentPolling(_event, payload = {}) {
  return startJobPollLoop("manual-start", payload);
}

export function stopAgentPolling() {
  if (appState.jobPollTimer) {
    clearInterval(appState.jobPollTimer);
    appState.jobPollTimer = null;
    console.log("[DESKTOP AGENT BACKGROUND] job polling stopped manual-stop");
  }
  if (appState.predownloadTimer) {
    clearInterval(appState.predownloadTimer);
    appState.predownloadTimer = null;
    appState.agentSession.predownloadLoopRunning = false;
    console.log("[DESKTOP AGENT BACKGROUND] predownload stopped manual-stop");
  }
  if (appState.conversionTimer) {
    clearInterval(appState.conversionTimer);
    appState.conversionTimer = null;
    appState.isConverting = false;
    console.log("[DESKTOP AGENT BACKGROUND] conversion stopped manual-stop");
  }
  emitAgentSession();
  return {
    success: true,
    message: "Job polling stopped.",
    session: sanitizeAgentSession()
  };
}

