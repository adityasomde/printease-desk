import { secureHandle } from "../../security/ipcSecurity.js";
import { getStoredDesktopAuth, setStoredDesktopAuth, clearStoredDesktopAuth, getStoredDesktopAgent, setStoredDesktopAgent, clearStoredDesktopAgent, startAgentPairing, confirmAgentPairing, ensureDeviceIdentity } from "../agent/authStore.js";
import { appState, sanitizeAgentSession } from "../state/appState.js";
import { app } from "electron";

export function registerAuthIpc() {
  secureHandle("desktopAuth:get", () => getStoredDesktopAuth(), app.isPackaged);
  secureHandle("desktopAuth:set", setStoredDesktopAuth, app.isPackaged);
  secureHandle("desktopAuth:clear", () => clearStoredDesktopAuth(), app.isPackaged);
  
  secureHandle("desktopAgent:get", () => getStoredDesktopAgent(), app.isPackaged);
  secureHandle("desktopAgent:set", setStoredDesktopAgent, app.isPackaged);
  secureHandle("desktopAgent:clear", () => clearStoredDesktopAgent(), app.isPackaged);
  
  secureHandle("desktopAgent:device-identity", async () => {
    await ensureDeviceIdentity();
    return {
      success: true,
      deviceId: appState.agentSession.deviceId,
      deviceName: appState.agentSession.deviceName,
    };
  }, app.isPackaged);

  secureHandle("agent:status", () => sanitizeAgentSession(), app.isPackaged);
  secureHandle("agent:start-pairing", startAgentPairing, app.isPackaged);
  secureHandle("agent:confirm-pairing", confirmAgentPairing, app.isPackaged);
}
