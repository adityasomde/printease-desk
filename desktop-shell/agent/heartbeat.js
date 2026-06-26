import { getApiBaseUrl } from "../config/backend.js";

const VERSION = "0.1.0";

function createHeaders(agentToken) {
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  if (agentToken) {
    headers.Authorization = `Bearer ${agentToken}`;
  }

  return headers;
}

export async function backendRequest({ endpoint, method = "GET", agentToken, body }) {
  const isFormData = body instanceof FormData;
  const headers = createHeaders(agentToken);
  
  if (isFormData) {
    delete headers["Content-Type"];
  }

  const response = await fetch(`${getApiBaseUrl()}${endpoint}`, {
    method,
    headers,
    body: isFormData ? body : (body ? JSON.stringify(body) : undefined),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data.message || `Backend API request failed with status ${response.status}`);
    error.status = response.status;
    error.details = data;
    throw error;
  }

  return data;
}

export function createHeartbeatPayload({ paused = false, status = "online", selectedPrinter = "" } = {}) {
  return {
    status,
    paused,
    selectedPrinter: selectedPrinter || null,
    platform: process.platform,
    version: VERSION,
  };
}

export async function startPairing({ deviceId, agentName }) {
  if (!deviceId || !agentName) {
    return {
      success: false,
      message: "Device ID and device name are required before pairing.",
    };
  }

  try {
    return await backendRequest({
      endpoint: "/agent/pair/start",
      method: "POST",
      body: {
        deviceId,
        agentName,
        platform: process.platform,
        version: VERSION,
      },
    });
  } catch (error) {
    return {
      success: false,
      message: error.message || "Could not start pairing.",
      status: error.status || 0,
    };
  }
}

export async function confirmPairing({ pairingSessionId, deviceId }) {
  if (!pairingSessionId || !deviceId) {
    return {
      success: false,
      message: "Pairing session ID and device ID are required before confirming pairing.",
    };
  }

  try {
    return await backendRequest({
      endpoint: "/agent/pair/confirm",
      method: "POST",
      body: {
        pairingSessionId,
        deviceId,
      },
    });
  } catch (error) {
    return {
      success: false,
      paired: false,
      message: error.message || "Could not confirm pairing.",
      status: error.status || 0,
    };
  }
}

export async function sendHeartbeat({ agentToken, paused = false, status = "online", selectedPrinter = "" } = {}) {
  if (!agentToken) {
    return {
      success: false,
      message: "Pair the desktop before sending heartbeat.",
    };
  }

  try {
    return await backendRequest({
      endpoint: "/agent/heartbeat",
      method: "POST",
      agentToken,
      body: createHeartbeatPayload({ paused, status, selectedPrinter }),
    });
  } catch (error) {
    return {
      success: false,
      message: error.message || "Could not send heartbeat.",
      status: error.status || 0,
    };
  }
}
