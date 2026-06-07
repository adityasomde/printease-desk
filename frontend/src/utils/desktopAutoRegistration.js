import { clearStoredAgent, getAgentStatus, getDesktopStatus, getDeviceIdentity, saveStoredAgent, startJobPolling } from "./desktopBridge";
import { registerDesktopAgent } from "../services/api";

/**
 * Automatically handles desktop agent registration and cleanup based on user auth state.
 * - If user logs out -> clears local desktop agent credentials to stop auto-print.
 * - If user logs in as hub -> automatically registers the desktop and starts auto-print.
 */
export async function handleDesktopAutoRegistration(currentUser) {
  try {
    // If logged out, clear any existing agent session
    if (!currentUser) {
      await clearStoredAgent();
      return;
    }

    // Only hub accounts should act as desktop agents
    if (currentUser.role !== "hub") {
      return;
    }

    const currentSession = await getAgentStatus();
    
    // If already paired and matching the current hub, just ensure polling is running
    if (currentSession?.paired && currentSession?.hubId === (currentUser.hubId || currentUser.centreId)) {
      if (!currentSession?.polling) {
        await startJobPolling({ printerName: currentSession?.selectedPrinterName || undefined, intervalMs: 5000 });
      }
      return;
    }

    // Otherwise, we need to register this desktop for the logged-in hub
    const identity = await getDeviceIdentity();
    const status = await getDesktopStatus();
    const deviceId = currentSession?.deviceId || identity?.deviceId;
    const deviceName = currentSession?.deviceName || identity?.deviceName || "PrintEase Desktop";

    if (!deviceId) {
      console.warn("[Auto-Register] Device identity not ready.");
      return;
    }

    const result = await registerDesktopAgent({
      deviceId,
      deviceName,
      platform: status?.platform || window?.printeaseDesktop?.platform || "desktop",
      appVersion: status?.version,
      clientAction: "autoRegisterDesktopAgent",
    });

    const agentToken = result?.agentToken || result?.accessToken;
    
    if (result?.success && agentToken && result?.agentId && result?.hubId) {
      await saveStoredAgent({
        agentToken,
        agentId: result.agentId,
        hubId: result.hubId,
        linkedHubUserId: result.linkedHubUserId,
        linkedHubCentreId: result.linkedHubCentreId,
        deviceId,
        deviceName,
        selectedPrinterName: currentSession?.selectedPrinterName || "",
        pairedAt: new Date().toISOString(),
      });
      
      // Ensure job polling starts immediately
      await startJobPolling({ printerName: currentSession?.selectedPrinterName || undefined, intervalMs: 5000 });
      console.log("[Auto-Register] Desktop agent automatically registered and auto-print started.");
    } else {
      console.warn("[Auto-Register] Registration failed:", result?.message);
    }
  } catch (err) {
    console.error("[Auto-Register] Error during desktop auto-registration:", err);
  }
}
