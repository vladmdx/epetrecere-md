import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// SEC — Production-grade rate limiter backed by Upstash Redis.
//
// On serverless (Vercel), an in-memory Map resets on every cold start and
// each function instance has its own counter — effectively no rate limiting
// under load. Upstash provides a globally-shared sliding window that works
// correctly across instances and cold starts.
//
// When UPSTASH_REDIS_REST_URL is not set (local dev without Redis), we
// fall back to the in-memory strategy so `npm run dev` works without any
// extra config. The fallback logs a warning on first use.

let fallbackWarned = false;

// ── Upstash-backed limiter (production) ─────────────────────────────────

const hasUpstash = !!(
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
);

const redis = hasUpstash
  ? new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    })
  : null;

// Cache Ratelimit instances per unique (limit, windowMs) combo so we don't
// recreate them on every call.
const limiters = new Map<string, Ratelimit>();

function getUpstashLimiter(limit: number, windowMs: number): Ratelimit {
  const key = `${limit}:${windowMs}`;
  let rl = limiters.get(key);
  if (!rl) {
    rl = new Ratelimit({
      redis: redis!,
      limiter: Ratelimit.slidingWindow(limit, `${windowMs} ms`),
      analytics: true,
      prefix: "rl",
    });
    limiters.set(key, rl);
  }
  return rl;
}

// ── In-memory fallback (dev only) ───────────────────────────────────────

const memMap = new Map<string, { count: number; resetAt: number }>();

function memoryRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): { success: boolean; remaining: number } {
  if (!fallbackWarned) {
    fallbackWarned = true;
    console.warn(
      "[rate-limit] UPSTASH_REDIS_REST_URL not set — using in-memory fallback. " +
        "This is fine for local dev but NOT safe for production.",
    );
  }

  const now = Date.now();
  const entry = memMap.get(key);

  if (!entry || now > entry.resetAt) {
    memMap.set(key, { count: 1, resetAt: now + windowMs });
    return { success: true, remaining: limit - 1 };
  }

  if (entry.count >= limit) {
    return { success: false, remaining: 0 };
  }

  entry.count++;
  return { success: true, remaining: limit - entry.count };
}

// Periodic cleanup for the in-memory fallback.
if (typeof setInterval !== "undefined" && !hasUpstash) {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of memMap) {
      if (now > entry.resetAt) memMap.delete(key);
    }
  }, 60_000);
}

// ── Public API ──────────────────────────────────────────────────────────

/**
 * Rate-limit a key within a sliding window.
 *
 * - In production (Upstash configured): uses Redis-backed global sliding window.
 * - In dev (no Upstash): uses a process-local Map (same API contract).
 *
 * @param key     Unique identifier (e.g. `leads:${ip}`)
 * @param limit   Max requests per window (default 100)
 * @param windowMs Window size in ms (default 60 000 = 1 minute)
 */
export async function rateLimit(
  key: string,
  limit = 100,
  windowMs = 60_000,
): Promise<{ success: boolean; remaining: number }> {
  if (!hasUpstash) {
    return memoryRateLimit(key, limit, windowMs);
  }

  const rl = getUpstashLimiter(limit, windowMs);
  const result = await rl.limit(key);
  return { success: result.success, remaining: result.remaining };
}
