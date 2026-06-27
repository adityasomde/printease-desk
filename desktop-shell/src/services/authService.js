import fs from "node:fs";
import path from "node:path";
import electron from "electron"; const { app, net, safeStorage } = electron;
import { agentState, agentSession } from "../state/agentState.js";
import { getApiBaseUrl } from "../../config/backend.js";
import { startPairing, confirmPairing, sendHeartbeat } from "../../agent/heartbeat.js";

export function getDesktopAuthPath() {
  return path.join(app.getPath("userData"), DESKTOP_AUTH_FILE);
}

export function getDesktopAgentPath() {
  return path.join(app.getPath("userData"), DESKTOP_AGENT_FILE);
}

export function normalizeDesktopAuthPayload(payload = {}) {
  const token = typeof payload.token === "string" ? payload.token : "";
  const user = payload.user && typeof payload.user === "object" ? payload.user : null;
  if (!token || !user) {
    return null;
  }
  return {
    token,
    user,
    savedAt: new Date().toISOString()
  };
}

export function encodeDesktopAuth(payload) {
  const text = JSON.stringify(payload);
  if (safeStorage?.isEncryptionAvailable?.()) {
    return {
      encrypted: true,
      data: Buffer.from(safeStorage.encryptString(text)).toString("base64")
    };
  }
  return {
    encrypted: false,
    data: text
  };
}

export function decodeDesktopAuth(stored) {
  if (!stored || typeof stored !== "object") return null;
  if (stored.encrypted) {
    const decrypted = safeStorage.decryptString(Buffer.from(String(stored.data || ""), "base64"));
    return JSON.parse(decrypted);
  }
  return JSON.parse(String(stored.data || "{}"));
}

export async function getStoredDesktopAuth() {
  try {
    const authPath = getDesktopAuthPath();
    if (!fs.existsSync(authPath)) {
      return {
        success: true,
        auth: null
      };
    }
    const stored = JSON.parse(await fs.promises.readFile(authPath, "utf8"));
    const auth = decodeDesktopAuth(stored);
    return {
      success: true,
      auth: normalizeDesktopAuthPayload(auth),
      encrypted: Boolean(stored.encrypted)
    };
  } catch (error) {
    return {
      success: false,
      auth: null,
      error: error?.message || "Could not read desktop auth storage."
    };
  }
}

export async function setStoredDesktopAuth(_event, payload = {}) {
  try {
    const auth = normalizeDesktopAuthPayload(payload);
    if (!auth) {
      return {
        success: false,
        error: "Desktop auth payload is invalid."
      };
    }
    await fs.promises.mkdir(app.getPath("userData"), {
      recursive: true
    });
    await fs.promises.writeFile(getDesktopAuthPath(), JSON.stringify(encodeDesktopAuth(auth), null, 2), "utf8");
    return {
      success: true
    };
  } catch (error) {
    return {
      success: false,
      error: error?.message || "Could not save desktop auth storage."
    };
  }
}

export async function clearStoredDesktopAuth() {
  try {
    await fs.promises.rm(getDesktopAuthPath(), {
      force: true
    });
    return {
      success: true
    };
  } catch (error) {
    return {
      success: false,
      error: error?.message || "Could not clear desktop auth storage."
    };
  }
}

export function normalizeDesktopAgentPayload(payload = {}) {
  const token = typeof payload.agentToken === "string" ? payload.agentToken : payload.accessToken;
  const agentId = typeof payload.agentId === "string" ? payload.agentId : "";
  const hubId = typeof payload.hubId === "string" ? payload.hubId : payload.shopId;
  const deviceId = typeof payload.deviceId === "string" ? payload.deviceId : agentSession.deviceId;
  const deviceName = typeof payload.deviceName === "string" ? payload.deviceName : agentSession.deviceName;
  if (!token || !agentId || !hubId || !deviceId || !deviceName) {
    return null;
  }
  return {
    agentToken: token,
    agentId,
    hubId,
    linkedHubUserId: typeof payload.linkedHubUserId === "string" ? payload.linkedHubUserId : "",
    linkedHubCentreId: typeof payload.linkedHubCentreId === "string" ? payload.linkedHubCentreId : "",
    deviceId,
    deviceName,
    pairedAt: typeof payload.pairedAt === "string" ? payload.pairedAt : new Date().toISOString(),
    selectedPrinterName: typeof payload.selectedPrinterName === "string" ? payload.selectedPrinterName : agentSession.selectedPrinterName,
    savedAt: new Date().toISOString()
  };
}

export function applyStoredAgentToSession(agent) {
  if (!agent) return false;
  agentSession.deviceId = agent.deviceId || agentSession.deviceId;
  agentSession.deviceName = agent.deviceName || agentSession.deviceName;
  agentSession.agentId = agent.agentId || "";
  agentSession.hubId = agent.hubId || "";
  agentSession.accessToken = agent.agentToken || "";
  agentSession.pairedAt = agent.pairedAt || "";
  agentSession.selectedPrinterName = agent.selectedPrinterName || agentSession.selectedPrinterName || "";
  agentSession.pairingCode = "";
  agentSession.pairingSessionId = "";
  agentSession.expiresAt = "";
  return isAgentPaired();
}

export async function getStoredDesktopAgent() {
  try {
    const agentPath = getDesktopAgentPath();
    if (!fs.existsSync(agentPath)) {
      return {
        success: true,
        agent: null
      };
    }
    const stored = JSON.parse(await fs.promises.readFile(agentPath, "utf8"));
    const agent = normalizeDesktopAgentPayload(decodeDesktopAuth(stored));
    return {
      success: true,
      agent: agent ? {
        agentId: agent.agentId,
        hubId: agent.hubId,
        deviceId: agent.deviceId,
        deviceName: agent.deviceName,
        linkedHubUserId: agent.linkedHubUserId,
        linkedHubCentreId: agent.linkedHubCentreId,
        pairedAt: agent.pairedAt,
        selectedPrinterName: agent.selectedPrinterName,
        savedAt: agent.savedAt
      } : null,
      encrypted: Boolean(stored.encrypted),
      session: sanitizeAgentSession()
    };
  } catch (error) {
    return {
      success: false,
      agent: null,
      error: error?.message || "Could not read desktop agent storage.",
      session: sanitizeAgentSession()
    };
  }
}

export async function setStoredDesktopAgent(_event, payload = {}) {
  try {
    const agent = normalizeDesktopAgentPayload(payload);
    if (!agent) {
      return {
        success: false,
        error: "Desktop agent credential payload is invalid.",
        session: sanitizeAgentSession()
      };
    }
    await fs.promises.mkdir(app.getPath("userData"), {
      recursive: true
    });
    await fs.promises.writeFile(getDesktopAgentPath(), JSON.stringify(encodeDesktopAuth(agent), null, 2), "utf8");
    applyStoredAgentToSession(agent);
    await saveConfig({
      deviceId: agentSession.deviceId,
      deviceName: agentSession.deviceName,
      agentId: agentSession.agentId,
      hubId: agentSession.hubId,
      selectedPrinterName: agentSession.selectedPrinterName
    });
    const runtime = await startAgentRuntime("agent-stored");
    emitAgentSession();
    return {
      success: true,
      runtime,
      session: sanitizeAgentSession()
    };
  } catch (error) {
    return {
      success: false,
      error: error?.message || "Could not save desktop agent credential.",
      session: sanitizeAgentSession()
    };
  }
}

export async function restoreStoredDesktopAgent() {
  try {
    const agentPath = getDesktopAgentPath();
    if (!fs.existsSync(agentPath)) return {
      success: true,
      restored: false
    };
    const stored = JSON.parse(await fs.promises.readFile(agentPath, "utf8"));
    const agent = normalizeDesktopAgentPayload(decodeDesktopAuth(stored));
    const restored = applyStoredAgentToSession(agent);
    if (restored) {
      await saveConfig({
        deviceId: agentSession.deviceId,
        deviceName: agentSession.deviceName,
        agentId: agentSession.agentId,
        hubId: agentSession.hubId,
        selectedPrinterName: agentSession.selectedPrinterName
      });
      console.log("[DESKTOP AGENT] restored stored agent credential", {
        agentId: agentSession.agentId,
        hubId: agentSession.hubId,
        deviceId: agentSession.deviceId
      });
    }
    return {
      success: true,
      restored
    };
  } catch (error) {
    console.warn("[DESKTOP AGENT RESTORE FAILED]", error?.message || error);
    return {
      success: false,
      restored: false,
      error: error?.message || "Could not restore desktop agent credential."
    };
  }
}

export async function clearStoredDesktopAgent() {
  try {
    await fs.promises.rm(getDesktopAgentPath(), {
      force: true
    });
    stopAgentRuntime("agent-cleared");
    agentSession.agentId = "";
    agentSession.hubId = "";
    agentSession.accessToken = "";
    agentSession.pairedAt = "";
    agentSession.pairingCode = "";
    agentSession.pairingSessionId = "";
    agentSession.expiresAt = "";
    agentSession.lastJobPollError = "";
    agentSession.lastJobPollMessage = "";
    emitAgentSession();
    return {
      success: true,
      session: sanitizeAgentSession()
    };
  } catch (error) {
    return {
      success: false,
      error: error?.message || "Could not clear desktop agent credential.",
      session: sanitizeAgentSession()
    };
  }
}

export async function migrateFileLocalStorageAuth() {
  if (!app.isPackaged) return;
  const existing = await getStoredDesktopAuth();
  if (existing?.auth?.token && existing.auth.user) return;
  const localIndex = getProductionIndexPath();
  if (!fs.existsSync(localIndex)) return;
  const migrationWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  try {
    await migrationWindow.loadFile(localIndex);
    const stored = await migrationWindow.webContents.executeJavaScript(`(() => {
      const token = localStorage.getItem("printease_token");
      const userText = localStorage.getItem("printease_user");
      return { token, userText };
    })()`);
    if (stored?.token && stored?.userText) {
      const user = JSON.parse(stored.userText);
      await setStoredDesktopAuth(null, {
        token: stored.token,
        user
      });
      console.log("[DESKTOP AUTH] migrated file localStorage auth");
    }
  } catch (error) {
    console.warn("[DESKTOP AUTH MIGRATION FAILED]", error?.message || error);
  } finally {
    migrationWindow.destroy();
  }
}

export function sanitizeAgentSession() {
  return {
    success: true,
    deviceId: agentSession.deviceId,
    deviceName: agentSession.deviceName,
    pairingCode: agentSession.pairingCode,
    pairingSessionId: agentSession.pairingSessionId,
    expiresAt: agentSession.expiresAt,
    agentId: agentSession.agentId,
    hubId: agentSession.hubId,
    paired: Boolean(agentSession.accessToken),
    pairedAt: agentSession.pairedAt,
    lastHeartbeatAt: agentSession.lastHeartbeatAt,
    lastHeartbeatError: agentSession.lastHeartbeatError,
    selectedPrinterName: agentSession.selectedPrinterName,
    lastPrinterSyncAt: agentSession.lastPrinterSyncAt,
    lastPrinterSyncError: agentSession.lastPrinterSyncError,
    lastJobPollAt: agentSession.lastJobPollAt,
    lastJobPollError: agentSession.lastJobPollError,
    lastJobPollMessage: agentSession.lastJobPollMessage,
    predownloadRunning: Boolean(isPredownloading || agentSession.predownloadRunning),
    predownloadLoopRunning: Boolean(predownloadTimer || agentSession.predownloadLoopRunning),
    isConverting: Boolean(isConverting),
    conversionLoopRunning: Boolean(conversionTimer),
    lastConversionAt: agentSession.lastConversionAt,
    lastConversionError: agentSession.lastConversionError,
    lastConversionMessage: agentSession.lastConversionMessage,
    converterPath: agentSession.converterPath,
    lastPredownloadAt: agentSession.lastPredownloadAt,
    lastPredownloadError: agentSession.lastPredownloadError,
    lastPredownloadMessage: agentSession.lastPredownloadMessage,
    lastPredownloadChecked: agentSession.lastPredownloadChecked,
    lastPredownloadCached: agentSession.lastPredownloadCached,
    lastPredownloadFailures: agentSession.lastPredownloadFailures,
    heartbeatRunning: Boolean(heartbeatTimer),
    printerSyncRunning: Boolean(printerSyncTimer),
    polling: Boolean(jobPollTimer),
    autoPrintRunning: Boolean(heartbeatTimer && printerSyncTimer && jobPollTimer)
  };
}

export async function ensureDeviceIdentity(deviceName) {
  if (agentSession.deviceId && agentSession.deviceName) return;
  const savedConfig = await loadConfig();
  agentSession.deviceId = savedConfig.deviceId || randomUUID();
  agentSession.deviceName = deviceName || savedConfig.deviceName || os.hostname() || "PrintEase Desktop";
  agentSession.selectedPrinterName = savedConfig.selectedPrinterName || agentSession.selectedPrinterName || "";
  await saveConfig({
    deviceId: agentSession.deviceId,
    deviceName: agentSession.deviceName,
    agentId: agentSession.agentId,
    hubId: agentSession.hubId,
    selectedPrinterName: agentSession.selectedPrinterName
  });
}

export async function startAgentPairing(_event, payload = {}) {
  await ensureDeviceIdentity(payload.deviceName);
  const result = await startPairing({
    deviceId: agentSession.deviceId,
    agentName: agentSession.deviceName
  });
  if (result.success) {
    agentSession.pairingCode = result.pairingCode || "";
    agentSession.pairingSessionId = result.pairingSessionId || "";
    agentSession.expiresAt = result.expiresAt || "";
  }
  return {
    ...result,
    session: sanitizeAgentSession()
  };
}

export async function confirmAgentPairing() {
  await ensureDeviceIdentity();
  if (!agentSession.pairingSessionId) {
    return {
      success: false,
      paired: false,
      message: "Start pairing before confirming.",
      session: sanitizeAgentSession()
    };
  }
  const result = await confirmPairing({
    pairingSessionId: agentSession.pairingSessionId,
    deviceId: agentSession.deviceId
  });
  const returnedAgentToken = result.accessToken || result.agentToken;
  if (result.success && result.paired && returnedAgentToken) {
    agentSession.accessToken = returnedAgentToken;
    agentSession.agentId = result.agentId || "";
    agentSession.hubId = result.hubId || result.shopId || "";
    agentSession.pairedAt = new Date().toISOString();
    agentSession.pairingCode = "";
    await saveConfig({
      deviceId: agentSession.deviceId,
      deviceName: agentSession.deviceName,
      agentId: agentSession.agentId,
      hubId: agentSession.hubId,
      selectedPrinterName: agentSession.selectedPrinterName
    });
    await setStoredDesktopAgent(null, {
      agentToken: agentSession.accessToken,
      agentId: agentSession.agentId,
      hubId: agentSession.hubId,
      deviceId: agentSession.deviceId,
      deviceName: agentSession.deviceName,
      pairedAt: agentSession.pairedAt,
      selectedPrinterName: agentSession.selectedPrinterName
    });
    result.runtime = await startAgentRuntime("agent:paired");
  }
  return {
    ...result,
    accessToken: undefined,
    agentToken: undefined,
    refreshToken: undefined,
    session: sanitizeAgentSession()
  };
}

export async function sendAgentHeartbeat() {
  const pairingError = requirePairedAgent();
  if (pairingError) return pairingError;
  const result = await sendHeartbeat({
    agentToken: agentSession.accessToken,
    selectedPrinter: agentSession.selectedPrinterName
  });
  if (result.success) {
    agentSession.lastHeartbeatAt = new Date().toISOString();
    agentSession.lastHeartbeatError = "";
    console.log("[DESKTOP AGENT BACKGROUND] heartbeat success", {
      agentId: agentSession.agentId || null,
      selectedPrinterName: agentSession.selectedPrinterName || null
    });
  } else {
    agentSession.lastHeartbeatError = result.message || "Heartbeat failed.";
    console.warn("[DESKTOP AGENT BACKGROUND] heartbeat fail", {
      status: result.status || null,
      message: agentSession.lastHeartbeatError
    });
    if (result.status === 401 || result.status === 403) {
      await clearStoredDesktopAgent();
      agentSession.lastHeartbeatError = "Stored desktop agent credential was rejected. Register or pair this desktop again.";
    }
  }
  emitAgentSession();
  return {
    ...result,
    session: sanitizeAgentSession()
  };
}

