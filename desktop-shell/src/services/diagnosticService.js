import fs from "node:fs";
import { exec } from "node:child_process";
import electron from "electron"; const { app, net } = electron;
import { agentState, agentSession } from "../state/agentState.js";
import { findLibreOfficeExecutable, LIBREOFFICE_MANUAL_DOWNLOAD_URL } from "../../agent/printPreparation/conversionEngine.js";
import { getBackendUrl } from "../../config/backend.js";
import { diagnosePrinters, testPrint } from "../../printer/printExecutor.js";
import { syncPrinters } from "../../agent/statusReporter.js";

export async function diagnoseWindowsPrintHelperSafe() {
  if (process.platform !== "win32") {
    return {
      success: false,
      platform: process.platform,
      message: "Windows print helper diagnostics are only available on Windows."
    };
  }
  const module = await import("./printer/windows/windowsPrinter.js");
  return module.diagnoseWindowsPrintHelper();
}

export async function diagnoseLibreOfficeSafe() {
  try {
    const result = await findLibreOfficeExecutable();
    return {
      success: result.found,
      ...result,
      manualDownloadUrl: result.manualDownloadUrl || LIBREOFFICE_MANUAL_DOWNLOAD_URL,
      message: result.found ? `LibreOffice detected from ${result.source || "system"}.` : result.message
    };
  } catch (error) {
    return {
      success: false,
      found: false,
      reasonCode: "CONVERSION_ENGINE_DIAGNOSTIC_FAILED",
      message: error?.message || "Could not inspect LibreOffice.",
      manualDownloadUrl: LIBREOFFICE_MANUAL_DOWNLOAD_URL
    };
  }
}

export async function checkBackendHealth() {
  const backendUrl = getBackendUrl({
    packaged: app.isPackaged
  });
  const apiBaseUrl = getApiBaseUrl({
    packaged: app.isPackaged
  });
  try {
    const response = await fetch(`${apiBaseUrl}/health`, {
      method: "GET",
      headers: {
        Accept: "application/json"
      }
    });
    const data = await response.json().catch(() => null);
    return {
      success: response.ok,
      status: response.status,
      backendUrl,
      apiBaseUrl,
      data
    };
  } catch (error) {
    return {
      success: false,
      backendUrl,
      apiBaseUrl,
      error: error.message || "Could not reach backend health endpoint."
    };
  }
}

export async function reportPrinterDiagnostic(event, result) {
  try {
    await fetch(`${getApiBaseUrl({
      packaged: app.isPackaged
    })}/desktop/printer-diagnostics`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({
        event,
        deviceId: agentSession.deviceId || null,
        deviceName: agentSession.deviceName || null,
        platform: process.platform,
        version: VERSION,
        paired: Boolean(agentSession.accessToken),
        result
      })
    });
  } catch (error) {
    console.warn("[DESKTOP PRINTER DIAGNOSTIC REPORT FAILED]", error.message || error);
  }
}

export async function syncPrintersToCloud(printerResult, event = "printers:sync") {
  if (!isAgentPaired()) {
    const result = {
      success: false,
      message: "Pair desktop before syncing printers to cloud.",
      skipped: true
    };
    agentSession.lastPrinterSyncError = result.message;
    emitAgentSession();
    return result;
  }
  if (!printerResult?.success) {
    const result = {
      success: false,
      message: printerResult?.error || printerResult?.message || "Local printer discovery failed; cloud sync skipped."
    };
    agentSession.lastPrinterSyncError = result.message;
    emitAgentSession();
    return result;
  }
  const syncResult = await syncPrinters({
    agentToken: agentSession.accessToken,
    printers: (printerResult.printers || []).map(printer => ({
      ...printer,
      isDefault: agentSession.selectedPrinterName ? printer.printerName === agentSession.selectedPrinterName : Boolean(printer.isDefault)
    }))
  });
  if (syncResult.success) {
    agentSession.lastPrinterSyncAt = new Date().toISOString();
    agentSession.lastPrinterSyncError = "";
    console.log("[DESKTOP AGENT BACKGROUND] printer sync success", {
      event,
      printerCount: printerResult.printers?.length || 0
    });
  } else {
    agentSession.lastPrinterSyncError = syncResult.message || "Cloud printer sync failed.";
    console.warn("[DESKTOP AGENT BACKGROUND] printer sync fail", {
      event,
      message: agentSession.lastPrinterSyncError
    });
  }
  console.log("[DESKTOP PRINTER CLOUD SYNC]", JSON.stringify({
    event,
    success: syncResult.success,
    printerCount: printerResult.printers?.length || 0,
    message: syncResult.message
  }, null, 2));
  emitAgentSession();
  return syncResult;
}

export async function applyPrinterDiscoveryResult(result, event) {
  latestPrinterResult = result;
  emitPrinterResult(result);
  if (isAgentPaired()) {
    const cloudSync = await syncPrintersToCloud(result, event);
    latestPrinterResult = {
      ...result,
      cloudSync
    };
    emitPrinterResult(latestPrinterResult);
    return latestPrinterResult;
  }
  agentSession.lastPrinterSyncError = result?.success ? "Printer detected locally but not synced to hub. Pair desktop first." : result?.message || result?.error || "Local printer discovery failed.";
  emitAgentSession();
  return result;
}

export async function refreshLocalPrinterResult(event) {
  const result = await listPrinters();
  console.log("[DESKTOP PRINTERS]", JSON.stringify(result, null, 2));
  await reportPrinterDiagnostic(event, result);
  return applyPrinterDiscoveryResult(result, event);
}

export async function syncLatestPrinterStatus(event) {
  const result = await listPrinters();
  console.log("[DESKTOP PRINTER STATUS SYNC]", JSON.stringify({
    event,
    success: result.success,
    printerCount: result.printers?.length || 0,
    defaultPrinter: result.defaultPrinter || null,
    message: result.message || result.error || "Printer status discovered locally."
  }, null, 2));
  return applyPrinterDiscoveryResult(result, event);
}

export async function selectDesktopPrinter(_event, payload = {}) {
  const printerName = typeof payload === "string" ? payload : payload?.printerName;
  if (!printerName) {
    return {
      success: false,
      message: "Choose a printer before saving selection.",
      session: sanitizeAgentSession()
    };
  }
  const printerResult = latestPrinterResult || (await refreshLocalPrinterResult("printers:select-load"));
  const printer = findPrinterByName(printerResult, printerName);
  if (!printer) {
    return {
      success: false,
      message: "Selected printer was not found locally. Refresh printers and try again.",
      session: sanitizeAgentSession()
    };
  }
  agentSession.selectedPrinterName = printer.printerName;
  await saveConfig({
    deviceId: agentSession.deviceId,
    deviceName: agentSession.deviceName,
    agentId: agentSession.agentId,
    hubId: agentSession.hubId,
    selectedPrinterName: agentSession.selectedPrinterName
  });
  latestPrinterResult = {
    ...printerResult,
    printers: (printerResult.printers || []).map(item => ({
      ...item,
      isDefault: item.printerName === agentSession.selectedPrinterName
    }))
  };
  emitPrinterResult(latestPrinterResult);
  let heartbeat = null;
  let printerSync = null;
  if (isAgentPaired()) {
    heartbeat = await sendAgentHeartbeat();
    printerSync = await syncPrintersToCloud(latestPrinterResult, "printers:selected");
    startJobPollLoop("printer-selected", {
      printerName: agentSession.selectedPrinterName
    });
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
    session: sanitizeAgentSession()
  };
}

