const OFFICIAL_RENDER_BACKEND_URL = "https://printease-backend-byex.onrender.com";

function normalizeBackendUrl(url) {
  const value = String(url || "").trim().replace(/\/+$/, "");

  if (!value) return "";

  // Desktop APIs expect backend origin, not /api base URL.
  // Prevent accidental /api/api/health if an env var includes /api.
  return value.endsWith("/api") ? value.slice(0, -4) : value;
}

export function getBackendUrl() {
  const configuredUrl = normalizeBackendUrl(
    process.env.PRINTEASE_BACKEND_URL || process.env.VITE_API_URL || process.env.BACKEND_URL
  );

  if (configuredUrl && configuredUrl !== OFFICIAL_RENDER_BACKEND_URL) {
    console.warn("[DESKTOP BACKEND CONFIG] Using custom backend URL (development/unpacked mode).", {
      configuredUrl,
      officialBackendUrl: OFFICIAL_RENDER_BACKEND_URL,
    });
    // Let the desktop agent connect to the local server in development
    return configuredUrl;
  }

  return OFFICIAL_RENDER_BACKEND_URL;
}

export function getApiBaseUrl() {
  return `${getBackendUrl()}/api`;
}
