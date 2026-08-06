// Async, pluggable rate limiting.
//
// When UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN are configured, limits are enforced
// via @upstash/ratelimit + @upstash/redis, so they are correctly shared across serverless
// instances (Vercel runs many concurrent instances of the same function – a plain in-process
// Map is NOT shared between them, which made the old implementation a no-op guard in
// production). Without those env vars (local dev, tests), this falls back to the previous
// in-memory Map behaviour so nothing extra needs to be configured to run locally.
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

// ─── In-memory fallback (local dev / tests only – NOT shared across instances) ──────────────

interface MemoryEntry {
  count: number;
  resetTime: number;
}

const memoryStore = new Map<string, MemoryEntry>();
let lastSweep = Date.now();

// Lazily sweeps expired entries at most once every 10 minutes, piggy-backed on a real call
// instead of a module-scope setInterval (which keeps a serverless instance alive forever and
// is dead weight on every instance that never even uses the in-memory path).
function sweepExpiredIfDue(): void {
  const now = Date.now();
  if (now - lastSweep < 10 * 60 * 1000) return;
  lastSweep = now;
  for (const [key, entry] of memoryStore.entries()) {
    if (now > entry.resetTime) memoryStore.delete(key);
  }
}

function memoryRateLimit(identifier: string, config: RateLimitConfig): boolean {
  sweepExpiredIfDue();
  const now = Date.now();
  const entry = memoryStore.get(identifier);

  if (!entry || now > entry.resetTime) {
    memoryStore.set(identifier, { count: 1, resetTime: now + config.windowMs });
    return true;
  }

  if (entry.count >= config.maxRequests) {
    return false;
  }

  entry.count++;
  return true;
}

// ─── Upstash-backed limiter (production / any env with Redis configured) ───────────────────

const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
const redis = redisUrl && redisToken ? new Redis({ url: redisUrl, token: redisToken }) : null;

// Ratelimit instances are bound to a fixed (maxRequests, window) pair, so cache one per
// distinct config instead of constructing a new one on every call.
const limiterCache = new Map<string, Ratelimit>();

function getLimiter(config: RateLimitConfig): Ratelimit {
  const cacheKey = `${config.maxRequests}:${config.windowMs}`;
  let limiter = limiterCache.get(cacheKey);
  if (!limiter) {
    const windowSeconds = Math.max(1, Math.round(config.windowMs / 1000));
    limiter = new Ratelimit({
      redis: redis!,
      limiter: Ratelimit.slidingWindow(config.maxRequests, `${windowSeconds} s`),
      analytics: false,
      prefix: 'ratelimit',
    });
    limiterCache.set(cacheKey, limiter);
  }
  return limiter;
}

/**
 * Returns true if the request identified by `identifier` is allowed under `config`, false if
 * the limit has been exceeded. Backed by Upstash Redis when configured (see module doc
 * comment above), otherwise falls back to an in-memory Map.
 */
export async function rateLimit(identifier: string, config: RateLimitConfig): Promise<boolean> {
  if (redis) {
    const { success } = await getLimiter(config).limit(identifier);
    return success;
  }
  return memoryRateLimit(identifier, config);
}
