import { secureHandle } from "../../security/ipcSecurity.js";
import { app } from "electron";
import { refreshLocalPrinterResult } from "../agent/agentRuntime.js";
import { diagnosePrinters, testPrint, stopPrinting } from "../../printer/printExecutor.js";
import { appState } from "../state/appState.js";

async function reportPrinterDiagnostic(event, result) {
  try {
    const { getApiBaseUrl } = await import("../../config/backend.js");
    await fetch(`${getApiBaseUrl({ packaged: app.isPackaged })}/desktop/printer-diagnostics`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        event,
        deviceId: appState.agentSession.deviceId || null,
        deviceName: appState.agentSession.deviceName || null,
        platform: process.platform,
        version: "0.1.94",
        paired: Boolean(appState.agentSession.accessToken),
        result,
      }),
    });
  } catch (error) {
    console.warn("[DESKTOP PRINTER DIAGNOSTIC REPORT FAILED]", error.message || error);
  }
}

export function registerPrinterIpc() {
  secureHandle("printers:list", () => refreshLocalPrinterResult("printers:list"), app.isPackaged);
  
  secureHandle("printers:select", async (_event, payload = {}) => {
    const printerName = typeof payload === "string" ? payload : payload?.printerName;
    if (!printerName || typeof printerName !== "string") {
      return { success: false, message: "Printer name is required.", session: null };
    }

    appState.agentSession.selectedPrinterName = printerName;
    const { saveConfig } = await import("../../local/config.js");
    await saveConfig({
      deviceId: appState.agentSession.deviceId,
      deviceName: appState.agentSession.deviceName,
      agentId: appState.agentSession.agentId,
      hubId: appState.agentSession.hubId,
      selectedPrinterName: appState.agentSession.selectedPrinterName
    });
    return refreshLocalPrinterResult("printers:select");
  }, app.isPackaged);
  
  secureHandle("printers:diagnose", async () => {
    const result = await diagnosePrinters();
    await reportPrinterDiagnostic("printers:diagnose", result);
    return result;
  }, app.isPackaged);

  secureHandle("printers:test-print", (_event, payload = {}) => {
    const printerName = (typeof payload === "string" ? payload : payload?.printerName) || appState.agentSession.selectedPrinterName;
    return testPrint(printerName);
  }, app.isPackaged);

  secureHandle("printing:stop", () => stopPrinting(), app.isPackaged);

  secureHandle("printer:diagnoseWindowsHelper", async () => {
    if (process.platform !== "win32") {
      return { success: false, platform: process.platform, message: "Windows print helper diagnostics are only available on Windows." };
    }
    const module = await import("../../printer/windows/windowsPrinter.js");
    return module.diagnoseWindowsPrintHelper();
  }, app.isPackaged);
}
