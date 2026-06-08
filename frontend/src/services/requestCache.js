const cache = new Map();
const inFlightRequests = new Map();

/**
 * Fetch a JSON payload with in-flight deduplication and TTL caching.
 * @param {string} key - Cache key.
 * @param {function} fetcher - Function returning a promise with the JSON payload.
 * @param {object} options - Options object: { ttlMs = 120000, force = false }
 * @returns {Promise<any>}
 */
export async function getCachedJson(key, fetcher, { ttlMs = 120000, force = false } = {}) {
  if (!force && cache.has(key)) {
    const cached = cache.get(key);
    if (Date.now() - cached.timestamp < ttlMs) {
      return cached.data;
    }
    // Stale: remove it and let the fetch proceed
    cache.delete(key);
  }

  // In-flight deduplication
  if (inFlightRequests.has(key)) {
    return inFlightRequests.get(key);
  }

  const fetchPromise = (async () => {
    try {
      const data = await fetcher();
      cache.set(key, { data, timestamp: Date.now() });
      return data;
    } finally {
      inFlightRequests.delete(key);
    }
  })();

  inFlightRequests.set(key, fetchPromise);
  return fetchPromise;
}

export function invalidateCache(key) {
  cache.delete(key);
}

export function invalidateCachePrefix(prefix) {
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) {
      cache.delete(key);
    }
  }
}

export function clearRequestCache() {
  cache.clear();
}
