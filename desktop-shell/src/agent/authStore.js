import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { app, safeStorage, BrowserWindow } from "electron";
import { appState, emitAgentSession, sanitizeAgentSession } from "../state/appState.js";
import { getProductionIndexPath } from "../frontendLoader.js";
import { saveConfig } from "../../local/config.js";
import { startAgentRuntime, stopAgentRuntime } from "./agentRuntime.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const shellDir = path.join(__dirname, "..", "..");

const DESKTOP_AUTH_FILE = "desktop-auth.json";
const DESKTOP_AGENT_FILE = "desktop-agent.json";

function getDesktopAuthPath() {
  return path.join(app.getPath("userData"), DESKTOP_AUTH_FILE);
}

function getDesktopAgentPath() {
  return path.join(app.getPath("userData"), DESKTOP_AGENT_FILE);
}

function normalizeDesktopAuthPayload(payload = {}) {
  const token = typeof payload.token === "string" ? payload.token : "";
  const user = payload.user && typeof payload.user === "object" ? payload.user : null;
  if (!token || !user) return null;
  return { token, user, savedAt: new Date().toISOString() };
}

function encodeDesktopAuth(payload) {
  const text = JSON.stringify(payload);
  if (safeStorage?.isEncryptionAvailable?.()) {
    return {
      encrypted: true,
      data: Buffer.from(safeStorage.encryptString(text)).toString("base64"),
    };
  }
  return { encrypted: false, data: text };
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
    if (!fs.existsSync(authPath)) return { success: true, auth: null };
    const stored = JSON.parse(await fs.promises.readFile(authPath, "utf8"));
    const auth = decodeDesktopAuth(stored);
    return { success: true, auth: normalizeDesktopAuthPayload(auth), encrypted: Boolean(stored.encrypted) };
  } catch (error) {
    return { success: false, auth: null, error: error?.message || "Could not read desktop auth storage." };
  }
}

export async function setStoredDesktopAuth(_event, payload = {}) {
  try {
    const auth = normalizeDesktopAuthPayload(payload);
    if (!auth) return { success: false, error: "Desktop auth payload is invalid." };
    await fs.promises.mkdir(app.getPath("userData"), { recursive: true });
    await fs.promises.writeFile(getDesktopAuthPath(), JSON.stringify(encodeDesktopAuth(auth), null, 2), "utf8");
    return { success: true };
  } catch (error) {
    return { success: false, error: error?.message || "Could not save desktop auth storage." };
  }
}

export async function clearStoredDesktopAuth() {
  try {
    await fs.promises.rm(getDesktopAuthPath(), { force: true });
    return { success: true };
  } catch (error) {
    return { success: false, error: error?.message || "Could not clear desktop auth storage." };
  }
}

function extractPrinterNameString(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    return value.printerName || value.name || value.displayName || "";
  }
  return String(value);
}

function normalizeDesktopAgentPayload(payload = {}) {
  const token = typeof payload.agentToken === "string" ? payload.agentToken : payload.accessToken;
  const agentId = typeof payload.agentId === "string" ? payload.agentId : "";
  const hubId = typeof payload.hubId === "string" ? payload.hubId : payload.shopId;
  const deviceId = typeof payload.deviceId === "string" ? payload.deviceId : appState.agentSession.deviceId;
  const deviceName = typeof payload.deviceName === "string" ? payload.deviceName : appState.agentSession.deviceName;
  if (!token || !agentId || !hubId || !deviceId || !deviceName) return null;
  return {
    agentToken: token,
    agentId,
    hubId,
    linkedHubUserId: typeof payload.linkedHubUserId === "string" ? payload.linkedHubUserId : "",
    linkedHubCentreId: typeof payload.linkedHubCentreId === "string" ? payload.linkedHubCentreId : "",
    deviceId,
    deviceName,
    pairedAt: typeof payload.pairedAt === "string" ? payload.pairedAt : new Date().toISOString(),
    selectedPrinterName: extractPrinterNameString(payload.selectedPrinterName || appState.agentSession.selectedPrinterName),
    savedAt: new Date().toISOString(),
  };
}

export function isAgentPaired() {
  return Boolean(appState.agentSession.agentId && appState.agentSession.hubId && appState.agentSession.accessToken);
}

export function applyStoredAgentToSession(agent) {
  if (!agent) return false;
  appState.agentSession.deviceId = agent.deviceId || appState.agentSession.deviceId;
  appState.agentSession.deviceName = agent.deviceName || appState.agentSession.deviceName;
  appState.agentSession.agentId = agent.agentId || "";
  appState.agentSession.hubId = agent.hubId || "";
  appState.agentSession.accessToken = agent.agentToken || "";
  appState.agentSession.pairedAt = agent.pairedAt || "";
  appState.agentSession.selectedPrinterName = extractPrinterNameString(agent.selectedPrinterName || appState.agentSession.selectedPrinterName || "");
  appState.agentSession.pairingCode = "";
  appState.agentSession.pairingSessionId = "";
  appState.agentSession.expiresAt = "";
  return isAgentPaired();
}

export async function getStoredDesktopAgent() {
  try {
    const agentPath = getDesktopAgentPath();
    if (!fs.existsSync(agentPath)) return { success: true, agent: null };
    const stored = JSON.parse(await fs.promises.readFile(agentPath, "utf8"));
    const agent = normalizeDesktopAgentPayload(decodeDesktopAuth(stored));
    return {
      success: true,
      agent: agent ? { ...agent } : null,
      encrypted: Boolean(stored.encrypted),
      session: sanitizeAgentSession(),
    };
  } catch (error) {
    return { success: false, agent: null, error: error?.message || "Could not read desktop agent storage.", session: sanitizeAgentSession() };
  }
}

export async function setStoredDesktopAgent(_event, payload = {}) {
  try {
    const agent = normalizeDesktopAgentPayload(payload);
    if (!agent) return { success: false, error: "Desktop agent credential payload is invalid.", session: sanitizeAgentSession() };
    await fs.promises.mkdir(app.getPath("userData"), { recursive: true });
    await fs.promises.writeFile(getDesktopAgentPath(), JSON.stringify(encodeDesktopAuth(agent), null, 2), "utf8");
    applyStoredAgentToSession(agent);
    await saveConfig({
      deviceId: appState.agentSession.deviceId,
      deviceName: appState.agentSession.deviceName,
      agentId: appState.agentSession.agentId,
      hubId: appState.agentSession.hubId,
      selectedPrinterName: appState.agentSession.selectedPrinterName,
    });
    const runtime = await startAgentRuntime("agent-stored");
    emitAgentSession();
    return { success: true, runtime, session: sanitizeAgentSession() };
  } catch (error) {
    return { success: false, error: error?.message || "Could not save desktop agent credential.", session: sanitizeAgentSession() };
  }
}

export async function restoreStoredDesktopAgent() {
  try {
    const agentPath = getDesktopAgentPath();
    if (!fs.existsSync(agentPath)) return { success: true, restored: false };
    const stored = JSON.parse(await fs.promises.readFile(agentPath, "utf8"));
    const agent = normalizeDesktopAgentPayload(decodeDesktopAuth(stored));
    const restored = applyStoredAgentToSession(agent);
    if (restored) {
      await saveConfig({
        deviceId: appState.agentSession.deviceId,
        deviceName: appState.agentSession.deviceName,
        agentId: appState.agentSession.agentId,
        hubId: appState.agentSession.hubId,
        selectedPrinterName: appState.agentSession.selectedPrinterName,
      });
    }
    return { success: true, restored };
  } catch (error) {
    return { success: false, restored: false, error: error?.message || "Could not restore desktop agent credential." };
  }
}

export async function clearStoredDesktopAgent() {
  try {
    await fs.promises.rm(getDesktopAgentPath(), { force: true });
    stopAgentRuntime("agent-cleared");
    appState.agentSession.agentId = "";
    appState.agentSession.hubId = "";
    appState.agentSession.accessToken = "";
    appState.agentSession.pairedAt = "";
    appState.agentSession.pairingCode = "";
    appState.agentSession.pairingSessionId = "";
    appState.agentSession.expiresAt = "";
    appState.agentSession.lastHeartbeatAt = "";
    appState.agentSession.lastHeartbeatError = "";
    appState.agentSession.lastPrinterSyncAt = "";
    appState.agentSession.lastPrinterSyncError = "";
    appState.agentSession.lastJobPollAt = "";
    appState.agentSession.lastJobPollError = "";
    appState.agentSession.lastJobPollMessage = "";
    emitAgentSession();
    return { success: true, session: sanitizeAgentSession() };
  } catch (error) {
    return { success: false, error: error?.message || "Could not clear desktop agent credential.", session: sanitizeAgentSession() };
  }
}

export async function ensureDeviceIdentity(deviceName) {
  if (appState.agentSession.deviceId && appState.agentSession.deviceName) return;
  const savedConfig = await import("../../local/config.js").then(m => m.loadConfig());
  appState.agentSession.deviceId = savedConfig.deviceId || (await import("node:crypto")).randomUUID();
  appState.agentSession.deviceName = deviceName || savedConfig.deviceName || (await import("node:os")).hostname() || "PrintEase Desktop";
  appState.agentSession.selectedPrinterName = extractPrinterNameString(savedConfig.selectedPrinterName || appState.agentSession.selectedPrinterName || "");
  await import("../../local/config.js").then(m => m.saveConfig({
    deviceId: appState.agentSession.deviceId,
    deviceName: appState.agentSession.deviceName,
    agentId: appState.agentSession.agentId,
    hubId: appState.agentSession.hubId,
    selectedPrinterName: appState.agentSession.selectedPrinterName
  }));
}

export async function startAgentPairing(_event, payload = {}) {
  await ensureDeviceIdentity(payload.deviceName);
  const result = await import("../../agent/heartbeat.js").then(m => m.startPairing({
    deviceId: appState.agentSession.deviceId,
    agentName: appState.agentSession.deviceName
  }));
  if (result.success) {
    appState.agentSession.pairingCode = result.pairingCode || "";
    appState.agentSession.pairingSessionId = result.pairingSessionId || "";
    appState.agentSession.expiresAt = result.expiresAt || "";
  }
  return { ...result, session: sanitizeAgentSession() };
}

export async function confirmAgentPairing() {
  await ensureDeviceIdentity();
  if (!appState.agentSession.pairingSessionId) {
    return { success: false, paired: false, message: "Start pairing before confirming.", session: sanitizeAgentSession() };
  }
  const result = await import("../../agent/heartbeat.js").then(m => m.confirmPairing({
    pairingSessionId: appState.agentSession.pairingSessionId,
    deviceId: appState.agentSession.deviceId
  }));
  const returnedAgentToken = result.accessToken || result.agentToken;
  if (result.success && result.paired && returnedAgentToken) {
    appState.agentSession.accessToken = returnedAgentToken;
    appState.agentSession.agentId = result.agentId || "";
    appState.agentSession.hubId = result.hubId || result.shopId || "";
    appState.agentSession.pairedAt = new Date().toISOString();
    appState.agentSession.pairingCode = "";
    await import("../../local/config.js").then(m => m.saveConfig({
      deviceId: appState.agentSession.deviceId,
      deviceName: appState.agentSession.deviceName,
      agentId: appState.agentSession.agentId,
      hubId: appState.agentSession.hubId,
      selectedPrinterName: appState.agentSession.selectedPrinterName
    }));
    await setStoredDesktopAgent(null, {
      agentToken: appState.agentSession.accessToken,
      agentId: appState.agentSession.agentId,
      hubId: appState.agentSession.hubId,
      deviceId: appState.agentSession.deviceId,
      deviceName: appState.agentSession.deviceName,
      pairedAt: appState.agentSession.pairedAt,
      selectedPrinterName: appState.agentSession.selectedPrinterName
    });
    result.runtime = await startAgentRuntime("agent:paired");
  }
  return { ...result, accessToken: undefined, agentToken: undefined, refreshToken: undefined, session: sanitizeAgentSession() };
}

export async function migrateFileLocalStorageAuth() {
  if (!app.isPackaged) return;
  const existing = await getStoredDesktopAuth();
  if (existing?.auth?.token && existing.auth.user) return;
  const localIndex = getProductionIndexPath(shellDir);
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
    if (!migrationWindow.isDestroyed()) {
      migrationWindow.destroy();
    }
  }
}
