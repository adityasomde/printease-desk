import { sendHeartbeat, backendRequest } from "./heartbeat.js";

function normalizeCondition(printer = {}) {
  const parts = [printer.condition, printer.status, printer.rawStatus, printer.rawAccepting]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (printer.accepting === false || parts.includes("not accepting")) return "paused";
  if (["printing", "processing"].some((word) => parts.includes(word))) return "printing";
  if (["paused", "disabled", "stopped"].some((word) => parts.includes(word))) return "paused";
  if (["offline", "unable", "disconnected"].some((word) => parts.includes(word))) return "offline";
  if (["idle", "available", "enabled", "accepting"].some((word) => parts.includes(word))) return "available";
  return "unknown";
}

function printerWarning(printer, condition) {
  if (!printer?.printerName) {
    return {
      warningCode: "PRINTER_NOT_FOUND",
      warningText: "Printer name was missing from local discovery.",
    };
  }

  if (condition === "offline") {
    return {
      warningCode: "PRINTER_OFFLINE",
      warningText: "Local printer appears offline or disconnected.",
    };
  }

  if (condition === "paused") {
    return {
      warningCode: "PRINTER_PAUSED",
      warningText: printer.accepting === false
        ? "Local printer is not accepting jobs."
        : "Local printer appears paused or disabled.",
    };
  }

  return {
    warningCode: printer.warningCode || null,
    warningText: printer.warningText || null,
  };
}

function normalizePrinters(printers) {
  if (!Array.isArray(printers)) return [];

  return printers
    .map((printer) => {
      const condition = normalizeCondition(printer);
      const warning = printerWarning(printer, condition);

      return {
        printerName: printer.printerName,
        systemPrinterId: printer.systemPrinterId || printer.printerName,
        status: printer.status || condition,
        condition,
        accepting: typeof printer.accepting === "boolean" ? printer.accepting : condition !== "paused" && condition !== "offline",
        isDefault: Boolean(printer.isDefault),
        lastCheckedAt: printer.lastCheckedAt || new Date().toISOString(),
        warningCode: warning.warningCode,
        warningText: warning.warningText,
      };
    })
    .filter((printer) => printer.printerName);
}

export async function syncPrinters({ agentToken, printers = [] } = {}) {
  if (!agentToken) {
    return {
      success: false,
      message: "Pair desktop before syncing printers to cloud.",
    };
  }

  try {
    return await backendRequest({
      endpoint: "/agent/printers",
      method: "POST",
      agentToken,
      body: {
        printers: normalizePrinters(printers),
      },
    });
  } catch (error) {
    return {
      success: false,
      message: error.message || "Could not sync printers.",
      status: error.status || 0,
    };
  }
}

export async function reportStatus({ agentToken, printers = [], paused = false } = {}) {
  if (!agentToken) {
    return {
      success: false,
      message: "Pair desktop before reporting status.",
    };
  }

  const [heartbeat, printerSync] = await Promise.all([
    sendHeartbeat({ agentToken, paused }),
    syncPrinters({ agentToken, printers }),
  ]);

  return {
    success: Boolean(heartbeat.success && printerSync.success),
    heartbeat,
    printerSync,
  };
}
