type JsonFetchResult<T = any> = {
  ok: boolean;
  status: number;
  data: T | null;
};

type CacheEntry = {
  expiresAt: number;
  value: JsonFetchResult;
};

const responseCache = new Map<string, CacheEntry>();
const inFlightRequests = new Map<string, Promise<JsonFetchResult>>();

async function parseJsonSafely(response: Response): Promise<any | null> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Deduplicate identical GET requests across components/mounts (including React Strict Mode remounts in dev).
 */
export async function fetchJsonWithDedupe<T = any>(
  url: string,
  options?: {
    ttlMs?: number;
    cacheKey?: string;
    requestInit?: RequestInit;
  }
): Promise<JsonFetchResult<T>> {
  const ttlMs = options?.ttlMs ?? 0;
  const cacheKey = options?.cacheKey || url;
  const requestInit = options?.requestInit;

  if (ttlMs > 0) {
    const cached = responseCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value as JsonFetchResult<T>;
    }
  }

  const inFlight = inFlightRequests.get(cacheKey);
  if (inFlight) {
    return (await inFlight) as JsonFetchResult<T>;
  }

  const requestPromise = (async () => {
    const response = await fetch(url, requestInit);
    const data = await parseJsonSafely(response);
    const result: JsonFetchResult = {
      ok: response.ok,
      status: response.status,
      data,
    };

    if (ttlMs > 0 && response.ok) {
      responseCache.set(cacheKey, {
        expiresAt: Date.now() + ttlMs,
        value: result,
      });
    }

    return result;
  })();

  inFlightRequests.set(cacheKey, requestPromise);
  try {
    return (await requestPromise) as JsonFetchResult<T>;
  } finally {
    inFlightRequests.delete(cacheKey);
  }
}

