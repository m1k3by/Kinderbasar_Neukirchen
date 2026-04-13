// Simple in-memory rate limiting
// ⚠️ WARNING: This is NOT suitable for production with multiple server instances (e.g., Vercel serverless).
// Each instance has its own memory, so rate limits are NOT shared across instances.
// For production, use a Redis-based solution like @upstash/ratelimit or Vercel KV.

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimitMap = new Map<string, RateLimitEntry>();

// Cleanup old entries every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitMap.entries()) {
    if (now > entry.resetTime) {
      rateLimitMap.delete(key);
    }
  }
}, 10 * 60 * 1000);

export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

export function rateLimit(identifier: string, config: RateLimitConfig): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(identifier);

  if (!entry || now > entry.resetTime) {
    // First request or window expired - create new entry
    rateLimitMap.set(identifier, {
      count: 1,
      resetTime: now + config.windowMs,
    });
    return true;
  }

  if (entry.count >= config.maxRequests) {
    // Rate limit exceeded
    return false;
  }

  // Increment counter
  entry.count++;
  return true;
}
