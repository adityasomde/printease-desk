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
    console.warn("[DESKTOP BACKEND CONFIG] Ignoring untrusted backend URL. PrintEase Desktop is pinned to official Render backend.", {
      configuredUrl,
      officialBackendUrl: OFFICIAL_RENDER_BACKEND_URL,
    });
  }

  return OFFICIAL_RENDER_BACKEND_URL;
}

export function getApiBaseUrl() {
  return `${OFFICIAL_RENDER_BACKEND_URL}/api`;
}
