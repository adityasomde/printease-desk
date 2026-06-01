const DESKTOP_ONLY_RESPONSE = {
  success: false,
  error: "Desktop features are only available in PrintEase Desktop.",
};

function getBridge() {
  if (typeof window === "undefined") return null;
  return window.printeaseDesktop || null;
}

function desktopFallback() {
  return { ...DESKTOP_ONLY_RESPONSE };
}

export function isDesktop() {
  if (typeof window === "undefined") return false;
  return Boolean(getBridge()?.isDesktop || window.location.protocol === "file:" || window.location.protocol === "app:");
}

export async function listPrinters() {
  const bridge = getBridge();
  if (!bridge?.listPrinters) return desktopFallback();

  try {
    return await bridge.listPrinters();
  } catch (error) {
    return {
      success: false,
      error: error.message || DESKTOP_ONLY_RESPONSE.error,
    };
  }
}

export async function selectPrinter(payload = {}) {
  const bridge = getBridge();
  if (!bridge?.selectPrinter) return desktopFallback();

  try {
    return await bridge.selectPrinter(payload);
  } catch (error) {
    return {
      success: false,
      error: error.message || "Could not select printer.",
    };
  }
}

export function onPrintersUpdated(callback) {
  const bridge = getBridge();
  if (!bridge?.onPrintersUpdated) return () => {};

  return bridge.onPrintersUpdated(callback);
}

export function onAgentUpdated(callback) {
  const bridge = getBridge();
  if (!bridge?.onAgentUpdated) return () => {};

  return bridge.onAgentUpdated(callback);
}

export async function diagnosePrinters() {
  const bridge = getBridge();
  if (!bridge?.diagnosePrinters) return desktopFallback();

  try {
    return await bridge.diagnosePrinters();
  } catch (error) {
    return {
      success: false,
      error: error.message || "Could not run printer diagnostics.",
    };
  }
}

export async function testPrint(payload = {}) {
  const bridge = getBridge();
  if (!bridge?.testPrint) return desktopFallback();

  try {
    return await bridge.testPrint(payload);
  } catch (error) {
    return {
      success: false,
      error: error.message || "Could not send test print.",
    };
  }
}

export async function stopPrinting() {
  const bridge = getBridge();
  if (!bridge?.stopPrinting) return desktopFallback();

  try {
    return await bridge.stopPrinting();
  } catch (error) {
    return {
      success: false,
      error: error.message || "Could not stop printing.",
    };
  }
}

export async function getDesktopStatus() {
  const bridge = getBridge();
  if (!bridge?.getDesktopStatus) return desktopFallback();

  try {
    return await bridge.getDesktopStatus();
  } catch (error) {
    return {
      success: false,
      error: error.message || "Could not load desktop status.",
    };
  }
}

export async function checkBackendHealth() {
  const bridge = getBridge();
  if (!bridge?.checkBackendHealth) return desktopFallback();

  try {
    return await bridge.checkBackendHealth();
  } catch (error) {
    return {
      success: false,
      error: error.message || "Could not check backend health.",
    };
  }
}

async function callDesktop(method, fallbackMessage, payload) {
  const bridge = getBridge();
  if (!bridge?.[method]) return desktopFallback();

  try {
    return await bridge[method](payload);
  } catch (error) {
    return {
      success: false,
      message: error.message || fallbackMessage,
    };
  }
}

async function callDesktopAgent(method, flatMethod, fallbackMessage, payload) {
  const bridge = getBridge();
  const agentBridge = bridge?.agent;
  if (!agentBridge?.[method]) return callDesktop(flatMethod, fallbackMessage, payload);

  try {
    return await agentBridge[method](payload);
  } catch (error) {
    return {
      success: false,
      message: error.message || fallbackMessage,
    };
  }
}

export function getAgentStatus() {
  return callDesktop("getAgentStatus", "Could not load agent status.");
}

export function startPairing(payload = {}) {
  return callDesktop("startPairing", "Could not start desktop pairing.", payload);
}

export function startApprovalPairing(payload = {}) {
  return callDesktop("startApprovalPairing", "Could not start approval pairing.", payload);
}

export function openApprovalUrl(url) {
  return callDesktop("openApprovalUrl", "Could not open approval URL.", url);
}

export function confirmPairing() {
  return callDesktop("confirmPairing", "Could not confirm desktop pairing.");
}

export function confirmApprovalPairing(pairingSessionId) {
  return callDesktop("confirmApprovalPairing", "Could not confirm approval pairing.", pairingSessionId);
}

export function sendHeartbeat() {
  return callDesktop("sendHeartbeat", "Could not send heartbeat.");
}

export function syncPrinters() {
  return callDesktop("syncPrinters", "Could not sync printers.");
}

export function pollPrintJobs(payload = {}) {
  return callDesktop("pollPrintJobs", "Could not poll print jobs.", payload);
}

export function startJobPolling(payload = {}) {
  return callDesktop("startJobPolling", "Could not start print job polling.", payload);
}

export function stopJobPolling() {
  return callDesktop("stopJobPolling", "Could not stop print job polling.");
}

export function getStoredAuth() {
  return callDesktop("getStoredAuth", "Could not load desktop auth storage.");
}

export function saveStoredAuth(payload = {}) {
  return callDesktop("saveStoredAuth", "Could not save desktop auth storage.", payload);
}

export function clearStoredAuth() {
  return callDesktop("clearStoredAuth", "Could not clear desktop auth storage.");
}

export function getStoredAgent() {
  return callDesktopAgent("getStored", "getStoredAgent", "Could not load desktop agent storage.");
}

export function saveStoredAgent(payload = {}) {
  return callDesktopAgent("setStored", "saveStoredAgent", "Could not save desktop agent storage.", payload);
}

export function clearStoredAgent() {
  return callDesktopAgent("clearStored", "clearStoredAgent", "Could not clear desktop agent storage.");
}

export function getDeviceIdentity() {
  return callDesktopAgent("getDeviceIdentity", "getDeviceIdentity", "Could not load desktop device identity.");
}
