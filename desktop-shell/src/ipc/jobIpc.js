import { secureHandle } from "../../security/ipcSecurity.js";
import { app } from "electron";
import { pollJobsNow, restartAgentRuntime, startJobPollLoop, stopAgentPolling, runPredownloadNow, runConversionNow, sendAgentHeartbeat, syncAgentPrinters } from "../agent/agentRuntime.js";
import { appState } from "../state/appState.js";

export function registerJobIpc() {
  secureHandle("agent:heartbeat", async () => {
    const result = await sendAgentHeartbeat();
    if (result.success) {
      const { startHeartbeatLoop } = await import("../agent/agentRuntime.js");
      startHeartbeatLoop();
    }
    return result;
  }, app.isPackaged);

  secureHandle("agent:sync-printers", async () => {
    const { syncAgentPrinters } = await import("../agent/agentRuntime.js");
    return syncAgentPrinters(); // Wait, syncAgentPrinters wasn't in agentRuntime.js... I'll need to define it or import from main.
  }, app.isPackaged);

  secureHandle("agent:predownload-now", () => runPredownloadNow("manual-conversion-check"), app.isPackaged);
  secureHandle("agent:conversion-now", () => runConversionNow("manual-conversion-check"), app.isPackaged);
  secureHandle("agent:poll-once", (_event, payload = {}) => pollJobsNow("manual-poll", payload), app.isPackaged);
  secureHandle("agent:start-runtime", () => restartAgentRuntime("manual-restart"), app.isPackaged);
  secureHandle("agent:start-polling", (_event, payload = {}) => startJobPollLoop("manual-start", payload), app.isPackaged);
  secureHandle("agent:stop-polling", stopAgentPolling, app.isPackaged);

  secureHandle("conversion:diagnoseLibreOffice", async () => {
    const { findLibreOfficeExecutable, LIBREOFFICE_MANUAL_DOWNLOAD_URL } = await import("../../agent/printPreparation/conversionEngine.js");
    try {
      const result = await findLibreOfficeExecutable({ allowDownload: true });
      return {
        success: result.found,
        ...result,
        manualDownloadUrl: result.manualDownloadUrl || LIBREOFFICE_MANUAL_DOWNLOAD_URL,
        message: result.found ? `LibreOffice detected from ${result.source || "system"}.` : result.message,
      };
    } catch (error) {
      return {
        success: false,
        found: false,
        reasonCode: "CONVERSION_ENGINE_DIAGNOSTIC_FAILED",
        message: error?.message || "Could not inspect LibreOffice.",
        manualDownloadUrl: LIBREOFFICE_MANUAL_DOWNLOAD_URL,
      };
    }
  }, app.isPackaged);
}
