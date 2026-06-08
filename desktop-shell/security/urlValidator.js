import { getApiBaseUrl } from "../config/backend.js";

export function isSafeApprovalUrl(urlStr) {
  if (!urlStr || typeof urlStr !== 'string') return false;
  try {
    const url = new URL(urlStr);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
    
    // Only allow URL that points to the trusted backend or frontend domain
    const trustedBackend = new URL(getApiBaseUrl());
    
    // Check if hostname matches or is a trusted Vercel preview (if applicable, but safer to match exact)
    // For agent approval, the URL is usually frontend URL
    // We should strictly ensure it doesn't navigate to malicious sites
    if (url.hostname !== trustedBackend.hostname && !url.hostname.includes('printease') && !url.hostname.includes('printhubdesi') && url.hostname !== 'localhost') {
        return false;
    }
    return true;
  } catch {
    return false;
  }
}
