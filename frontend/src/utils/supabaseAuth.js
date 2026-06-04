const SUPABASE_URL = String(import.meta.env.VITE_SUPABASE_URL || "").replace(/\/+$/, "");
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

function requireSupabaseConfig() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("Supabase Auth is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
  }
}

function authHeaders() {
  requireSupabaseConfig();
  return {
    apikey: SUPABASE_ANON_KEY,
    "Content-Type": "application/json",
  };
}

function authBearerHeaders(accessToken) {
  return {
    ...authHeaders(),
    Authorization: `Bearer ${accessToken}`,
  };
}

async function authRequest(endpoint, body) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1${endpoint}`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error_description || data.msg || data.message || "Supabase Auth request failed.");
  }

  return data;
}

export function isSupabaseAuthConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

export async function signInWithEmailPassword(email, password) {
  return authRequest("/token?grant_type=password", { email, password });
}

export async function signUpWithEmailPassword(email, password, metadata = {}) {
  return authRequest("/signup", { email, password, data: metadata });
}

export async function refreshSupabaseSession(refreshToken) {
  return authRequest("/token?grant_type=refresh_token", { refresh_token: refreshToken });
}

export async function getSupabaseUser(accessToken) {
  requireSupabaseConfig();
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: authBearerHeaders(accessToken),
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error_description || data.msg || data.message || "Could not load Supabase profile.");
  }

  return data;
}

export function startGoogleOAuth() {
  requireSupabaseConfig();
  const redirectTo = `${window.location.origin}${window.location.pathname}`;
  const params = new URLSearchParams({
    provider: "google",
    redirect_to: redirectTo,
  });
  window.location.assign(`${SUPABASE_URL}/auth/v1/authorize?${params.toString()}`);
}

export function readSupabaseSessionFromUrl() {
  const hash = window.location.hash?.startsWith("#") ? window.location.hash.slice(1) : "";
  const params = new URLSearchParams(hash || window.location.search);
  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");

  if (!accessToken) return null;

  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_in: Number(params.get("expires_in") || 0),
    token_type: params.get("token_type") || "bearer",
  };
}

export function clearSupabaseUrlSession() {
  if (!window.location.hash) return;
  window.history.replaceState({}, document.title, `${window.location.pathname}${window.location.search}`);
}
