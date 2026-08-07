const CACHE_PREFIX = 'agent-shift-cache-';
const DEFAULT_TTL_MINUTES = 60 * 24; // 24 hours

interface CacheItem<T> {
    data: T;
    timestamp: number;
    ttl: number; // minutes
}

/**
 * Generates a deterministic hash from a string or object.
 * Simple DJB2 hash implementation for client-side usage.
 */
export async function generateCacheKey(action: string, params: unknown): Promise<string> {
    const str = action + JSON.stringify(params);
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
        hash = (hash * 33) ^ str.charCodeAt(i);
    }
    return CACHE_PREFIX + (hash >>> 0).toString(16);
}

/**
 * Retrieves cached data if it exists and hasn't expired.
 */
export function getCachedData<T>(key: string): T | null {
    if (typeof window === 'undefined') return null;

    try {
        const itemStr = localStorage.getItem(key);
        if (!itemStr) return null;

        const item: CacheItem<T> = JSON.parse(itemStr);
        const now = Date.now();
        const expirationTime = item.timestamp + item.ttl * 60 * 1000;

        if (now > expirationTime) {
            try {
                localStorage.removeItem(key);
            } catch {
                // ignore storage access errors
            }
            return null;
        }

        return item.data;
    } catch (e) {
        // Storage access denied or parse error
        console.warn('Cache get error', e);
        return null;
    }
}

/**
 * Saves data to cache with a TTL (Time To Live).
 */
export function setCachedData<T>(key: string, data: T, ttlMinutes: number = DEFAULT_TTL_MINUTES): void {
    if (typeof window === 'undefined') return;

    try {
        const item: CacheItem<T> = {
            data,
            timestamp: Date.now(),
            ttl: ttlMinutes,
        };
        localStorage.setItem(key, JSON.stringify(item));
    } catch (e) {
        console.error('Cache set error', e);
        // QuotaExceededError handling could go here
    }
}
