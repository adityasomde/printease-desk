const PRINTER_SYNC_INTERVAL_MS = 30000;
const JOB_POLL_INTERVAL_MS = 5000;
const PREDOWNLOAD_INTERVAL_MS = 90000;
import fs from "node:fs";
import path from "node:path";
import electron from "electron"; const { net } = electron;
import { agentState, agentSession } from "../state/agentState.js";
import { getApiBaseUrl, getBackendUrl } from "../../config/backend.js";
import { stopPrinting, listPrinters } from "../../printer/printExecutor.js";

export function stopAgentRuntime(reason = "stopped") {
  if (agentState.heartbeatTimer) {
    clearInterval(agentState.heartbeatTimer);
    agentState.heartbeatTimer = null;
  }
  if (agentState.printerSyncTimer) {
    clearInterval(agentState.printerSyncTimer);
    agentState.printerSyncTimer = null;
  }
  if (agentState.jobPollTimer) {
    clearInterval(agentState.jobPollTimer);
    agentState.jobPollTimer = null;
  }
  if (agentState.predownloadTimer) {
    clearInterval(agentState.predownloadTimer);
    agentState.predownloadTimer = null;
  }
  if (agentState.conversionTimer) {
    clearInterval(agentState.conversionTimer);
    agentState.conversionTimer = null;
  }
  agentState.isPollingJobs = false;
  agentState.isPredownloading = false;
  agentState.isConverting = false;
  agentSession.predownloadRunning = false;
  agentSession.predownloadLoopRunning = false;
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
  if (agentState.isPredownloading) {
    return {
      success: true,
      skipped: true,
      message: "Predownload already running.",
      session: sanitizeAgentSession()
    };
  }
  agentState.isPredownloading = true;
  agentSession.predownloadRunning = true;
  agentSession.lastPredownloadMessage = "Checking pending documents for conversion.";
  agentSession.lastPredownloadError = "";
  emitAgentSession();
  try {
    const result = await predownloadPendingDocuments({
      agentToken: agentSession.accessToken
    });
    agentSession.lastPredownloadAt = new Date().toISOString();
    agentSession.lastPredownloadChecked = Number(result?.checked || 0);
    agentSession.lastPredownloadCached = Number(result?.cached || 0);
    agentSession.lastPredownloadFailures = Array.isArray(result?.failures) ? result.failures.length : 0;
    agentSession.lastPredownloadError = result?.success === false ? result.message || "Predownload failed." : "";
    agentSession.lastPredownloadMessage = result?.success === false ? agentSession.lastPredownloadError : `Checked ${agentSession.lastPredownloadChecked}, cached/prepared ${agentSession.lastPredownloadCached}, failures ${agentSession.lastPredownloadFailures}.`;
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
    agentSession.lastPredownloadAt = new Date().toISOString();
    agentSession.lastPredownloadError = error.message || "Could not predownload pending documents.";
    agentSession.lastPredownloadMessage = agentSession.lastPredownloadError;
    return {
      success: false,
      message: agentSession.lastPredownloadError,
      session: sanitizeAgentSession()
    };
  } finally {
    agentState.isPredownloading = false;
    agentSession.predownloadRunning = false;
    emitAgentSession();
  }
}

export async function pollJobsNow(reason = "manual", payload = {}) {
  const pairingError = requirePairedAgent();
  if (pairingError) return pairingError;
  if (agentState.isPollingJobs) {
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
  agentState.isPollingJobs = true;
  try {
    if (!payload.printerName && !resolveLocalPrinterName()) {
      await syncLatestPrinterStatus(`${reason}:resolve-printer`).catch(() => null);
    }
    const printerName = payload.printerName || resolveLocalPrinterName();
    const knownPrinters = Array.isArray(agentState.latestPrinterResult?.printers) ? agentState.latestPrinterResult.printers : [];
    if (!printerName && knownPrinters.length === 0) {
      agentSession.lastJobPollAt = new Date().toISOString();
      agentSession.lastJobPollError = "No local printer selected/available.";
      agentSession.lastJobPollMessage = "Auto-print is online but waiting for a local printer.";
      console.warn("[DESKTOP AGENT BACKGROUND] no local printer selected/available", {
        reason
      });
      emitAgentSession();
      return {
        success: true,
        skipped: true,
        message: agentSession.lastJobPollError,
        session: sanitizeAgentSession()
      };
    }
    const result = await processNextJob({
      agentToken: agentSession.accessToken,
      printerName
    });
    agentSession.lastJobPollAt = new Date().toISOString();
    if (result.success && result.job) {
      agentSession.lastJobPollError = "";
      agentSession.lastJobPollMessage = `Printed job ${result.job.jobId || result.job.orderId || ""}`.trim();
      console.log("[DESKTOP AGENT BACKGROUND] job poll success/job printed", {
        reason,
        printerName,
        jobId: result.job?.jobId || null,
        orderId: result.job?.orderId || null
      });
    } else if (result.success) {
      agentSession.lastJobPollError = "";
      agentSession.lastJobPollMessage = result.message || "No jobs.";
      console.log("[DESKTOP AGENT BACKGROUND] job poll success/no jobs", {
        reason,
        printerName: printerName || null
      });
    } else if (result.status === 401 || result.status === 403) {
      agentSession.lastJobPollError = "Stored desktop agent credential was rejected. Register or pair this desktop again.";
      console.warn("[DESKTOP AGENT BACKGROUND] stopped auth rejected", {
        reason,
        status: result.status,
        message: result.message
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
    agentSession.lastJobPollAt = new Date().toISOString();
    agentSession.lastJobPollError = error.message || "Could not poll print jobs.";
    console.warn("[DESKTOP AGENT BACKGROUND] job poll fail", {
      reason,
      printerName: printerName || null,
      message: agentSession.lastJobPollError
    });
    emitAgentSession();
    return {
      success: false,
      message: agentSession.lastJobPollError,
      session: sanitizeAgentSession()
    };
  } finally {
    agentState.isPollingJobs = false;
  }
}

export async function runConversionNow(reason = "loop") {
  const pairingError = requirePairedAgent();
  if (pairingError) return pairingError;
  if (agentState.isConverting) return {
    success: true,
    skipped: true
  };
  agentState.isConverting = true;
  agentSession.lastConversionMessage = "Running conversion loop...";
  emitAgentSession();
  try {
    const result = await processNextConversionJob({
      agentToken: agentSession.accessToken
    });
    agentSession.lastConversionAt = new Date().toISOString();
    if (result.success && result.processed) {
      agentSession.lastConversionError = "";
      agentSession.lastConversionMessage = `Converted ${result.documentId}.`;
      if (result.details && result.details.enginePath) {
        agentSession.converterPath = result.details.enginePath;
      }
    } else if (result.success) {
      agentSession.lastConversionError = "";
      agentSession.lastConversionMessage = "No pending conversions.";
    } else {
      agentSession.lastConversionError = result.message || "Conversion failed.";
      agentSession.lastConversionMessage = agentSession.lastConversionError;
      if (result.details && result.details.enginePath) {
        agentSession.converterPath = result.details.enginePath;
      }
    }
  } catch (error) {
    agentSession.lastConversionError = error.message || "Conversion error.";
    agentSession.lastConversionMessage = agentSession.lastConversionError;
  } finally {
    agentState.isConverting = false;
    emitAgentSession();
  }
}

export async function startAgentRuntime(reason) {
  console.log("[DESKTOP AGENT BACKGROUND]", reason, {
    paired: isAgentPaired(),
    selectedPrinterName: agentSession.selectedPrinterName || null
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
  if (agentState.jobPollTimer) {
    clearInterval(agentState.jobPollTimer);
    agentState.jobPollTimer = null;
    console.log("[DESKTOP AGENT BACKGROUND] job polling stopped manual-stop");
  }
  if (agentState.predownloadTimer) {
    clearInterval(agentState.predownloadTimer);
    agentState.predownloadTimer = null;
    agentSession.predownloadLoopRunning = false;
    console.log("[DESKTOP AGENT BACKGROUND] predownload stopped manual-stop");
  }
  if (agentState.conversionTimer) {
    clearInterval(agentState.conversionTimer);
    agentState.conversionTimer = null;
    agentState.isConverting = false;
    console.log("[DESKTOP AGENT BACKGROUND] conversion stopped manual-stop");
  }
  emitAgentSession();
  return {
    success: true,
    message: "Job polling stopped.",
    session: sanitizeAgentSession()
  };
}

