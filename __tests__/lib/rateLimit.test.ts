import { describe, it, expect, vi, afterEach } from 'vitest';
import { rateLimit } from '@/app/lib/rateLimit';

afterEach(() => {
  vi.useRealTimers();
});

describe('rateLimit', () => {
  it('first call always returns true', () => {
    expect(rateLimit('test-first-01', { maxRequests: 5, windowMs: 60_000 })).toBe(true);
  });

  it('allows up to maxRequests within window', () => {
    const key = 'test-max-02';
    for (let i = 0; i < 3; i++) {
      expect(rateLimit(key, { maxRequests: 3, windowMs: 60_000 })).toBe(true);
    }
  });

  it('blocks the (maxRequests + 1)th call', () => {
    const key = 'test-block-03';
    for (let i = 0; i < 5; i++) {
      rateLimit(key, { maxRequests: 5, windowMs: 60_000 });
    }
    expect(rateLimit(key, { maxRequests: 5, windowMs: 60_000 })).toBe(false);
  });

  it('different identifiers are independent', () => {
    const config = { maxRequests: 1, windowMs: 60_000 };
    expect(rateLimit('test-indep-A-04', config)).toBe(true);
    // Exceeding limit on A
    expect(rateLimit('test-indep-A-04', config)).toBe(false);
    // B should still be allowed
    expect(rateLimit('test-indep-B-04', config)).toBe(true);
  });

  it('resets after windowMs elapses', async () => {
    const key = 'test-reset-05';
    const config = { maxRequests: 1, windowMs: 100 };
    expect(rateLimit(key, config)).toBe(true);
    expect(rateLimit(key, config)).toBe(false); // blocked

    await new Promise(r => setTimeout(r, 150));   // wait for window to expire

    expect(rateLimit(key, config)).toBe(true);    // window reset
  });

  it('counts correctly over multiple calls', () => {
    const key = 'test-count-06';
    const cfg = { maxRequests: 3, windowMs: 60_000 };
    expect(rateLimit(key, cfg)).toBe(true);  // 1
    expect(rateLimit(key, cfg)).toBe(true);  // 2
    expect(rateLimit(key, cfg)).toBe(true);  // 3
    expect(rateLimit(key, cfg)).toBe(false); // 4 – blocked
    expect(rateLimit(key, cfg)).toBe(false); // 5 – still blocked
  });
});
