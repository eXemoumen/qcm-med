/**
 * In-memory IP-based rate limiter.
 *
 * Tracks request counts per IP in a sliding window. Designed for
 * single-instance dev/staging. For production multi-instance deployments,
 * swap the internal Map for a Redis-backed store (e.g., ioredis INCR+EXPIRE).
 */

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

const store = new Map<string, RateLimitEntry>();

/** Auto-cleanup stale entries every 5 minutes */
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now - entry.windowStart > CLEANUP_INTERVAL_MS) {
      store.delete(key);
    }
  }
}, CLEANUP_INTERVAL_MS);

/**
 * Check if a given IP is within the rate limit.
 *
 * @param ip       - Client IP address (or fallback identifier).
 * @param maxReqs  - Max requests allowed in the window (default 100).
 * @param windowMs - Window duration in ms (default 60 000 = 1 minute).
 * @returns `{ allowed: boolean; remaining: number }`.
 */
export function checkRateLimit(
  ip: string,
  maxReqs = 100,
  windowMs = 60_000
): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const entry = store.get(ip);

  if (!entry || now - entry.windowStart > windowMs) {
    // New window
    store.set(ip, { count: 1, windowStart: now });
    return { allowed: true, remaining: maxReqs - 1 };
  }

  entry.count += 1;

  if (entry.count > maxReqs) {
    return { allowed: false, remaining: 0 };
  }

  return { allowed: true, remaining: maxReqs - entry.count };
}
