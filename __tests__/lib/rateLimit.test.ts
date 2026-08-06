import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';

// ─── @upstash/* mocks (only exercised when UPSTASH_REDIS_REST_URL/TOKEN are set – see the
// second describe block below; harmless/unused for the in-memory fallback tests) ────────────
const limitMock = vi.hoisted(() => vi.fn());
// mockImplementation needs a real `function` (not an arrow function) here – app/lib/rateLimit.ts
// calls these with `new`, and arrow functions aren't constructible. A `function` that
// explicitly returns an object makes `new Ctor()` evaluate to that returned object.
const RedisMock = vi.hoisted(() => vi.fn().mockImplementation(function RedisMockImpl() {
  return { __brand: 'redis-client' };
}));
const slidingWindowMock = vi.hoisted(() => vi.fn().mockReturnValue('sliding-window-algorithm'));
const RatelimitCtor = vi.hoisted(() => vi.fn().mockImplementation(function RatelimitMockImpl() {
  return { limit: limitMock };
}));

vi.mock('@upstash/redis', () => ({ Redis: RedisMock }));
vi.mock('@upstash/ratelimit', () => ({
  Ratelimit: Object.assign(RatelimitCtor, { slidingWindow: slidingWindowMock }),
}));

afterEach(() => {
  vi.useRealTimers();
});

describe('rateLimit (in-memory fallback – no Upstash env vars configured)', () => {
  let rateLimit: typeof import('@/app/lib/rateLimit').rateLimit;

  beforeEach(async () => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    vi.resetModules();
    ({ rateLimit } = await import('@/app/lib/rateLimit'));
  });

  it('is an async function that returns a Promise<boolean>', () => {
    const result = rateLimit('test-async-00', { maxRequests: 5, windowMs: 60_000 });
    expect(result).toBeInstanceOf(Promise);
  });

  it('first call always returns true', async () => {
    expect(await rateLimit('test-first-01', { maxRequests: 5, windowMs: 60_000 })).toBe(true);
  });

  it('allows up to maxRequests within window', async () => {
    const key = 'test-max-02';
    for (let i = 0; i < 3; i++) {
      expect(await rateLimit(key, { maxRequests: 3, windowMs: 60_000 })).toBe(true);
    }
  });

  it('blocks the (maxRequests + 1)th call', async () => {
    const key = 'test-block-03';
    for (let i = 0; i < 5; i++) {
      await rateLimit(key, { maxRequests: 5, windowMs: 60_000 });
    }
    expect(await rateLimit(key, { maxRequests: 5, windowMs: 60_000 })).toBe(false);
  });

  it('different identifiers are independent', async () => {
    const config = { maxRequests: 1, windowMs: 60_000 };
    expect(await rateLimit('test-indep-A-04', config)).toBe(true);
    // Exceeding limit on A
    expect(await rateLimit('test-indep-A-04', config)).toBe(false);
    // B should still be allowed
    expect(await rateLimit('test-indep-B-04', config)).toBe(true);
  });

  it('resets after windowMs elapses', async () => {
    const key = 'test-reset-05';
    const config = { maxRequests: 1, windowMs: 100 };
    expect(await rateLimit(key, config)).toBe(true);
    expect(await rateLimit(key, config)).toBe(false); // blocked

    await new Promise(r => setTimeout(r, 150));   // wait for window to expire

    expect(await rateLimit(key, config)).toBe(true);    // window reset
  });

  it('counts correctly over multiple calls', async () => {
    const key = 'test-count-06';
    const cfg = { maxRequests: 3, windowMs: 60_000 };
    expect(await rateLimit(key, cfg)).toBe(true);  // 1
    expect(await rateLimit(key, cfg)).toBe(true);  // 2
    expect(await rateLimit(key, cfg)).toBe(true);  // 3
    expect(await rateLimit(key, cfg)).toBe(false); // 4 – blocked
    expect(await rateLimit(key, cfg)).toBe(false); // 5 – still blocked
  });
});

describe('rateLimit (Upstash-backed – UPSTASH_REDIS_REST_URL/TOKEN configured)', () => {
  let rateLimit: typeof import('@/app/lib/rateLimit').rateLimit;

  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.UPSTASH_REDIS_REST_URL = 'https://example.upstash.io';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
    vi.resetModules();
    ({ rateLimit } = await import('@/app/lib/rateLimit'));
  });

  afterEach(() => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  });

  it('uses the Upstash-backed limiter instead of the in-memory fallback when configured', async () => {
    limitMock.mockResolvedValue({ success: true });
    const allowed = await rateLimit('user@example.com', { maxRequests: 5, windowMs: 60_000 });
    expect(allowed).toBe(true);
    expect(RedisMock).toHaveBeenCalledWith({ url: 'https://example.upstash.io', token: 'test-token' });
    expect(limitMock).toHaveBeenCalledWith('user@example.com');
  });

  it('returns false when the Upstash limiter reports the limit exceeded', async () => {
    limitMock.mockResolvedValue({ success: false });
    const allowed = await rateLimit('user@example.com', { maxRequests: 5, windowMs: 60_000 });
    expect(allowed).toBe(false);
  });

  it('reuses the same Ratelimit instance for repeated calls with the same config', async () => {
    limitMock.mockResolvedValue({ success: true });
    await rateLimit('a', { maxRequests: 10, windowMs: 60_000 });
    await rateLimit('b', { maxRequests: 10, windowMs: 60_000 });
    // Same (maxRequests, windowMs) pair → the Ratelimit constructor should only run once.
    expect(RatelimitCtor).toHaveBeenCalledTimes(1);
  });
});
