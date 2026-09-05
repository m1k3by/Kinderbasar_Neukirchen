import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sellerToken } from '../helpers/tokens';

const cookiesGetMock = vi.hoisted(() => vi.fn());
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => Promise.resolve({ get: cookiesGetMock })),
}));

const rateLimitMock = vi.hoisted(() => vi.fn());
vi.mock('@/app/lib/rateLimit', () => ({ rateLimit: rateLimitMock }));

const recordErrorMock = vi.hoisted(() => vi.fn());
vi.mock('@/app/lib/errorLog', () => ({ recordError: recordErrorMock }));

import { POST } from '@/app/api/errors/route';

function makeRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request('http://localhost/api/errors', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '10.0.0.1', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('POST /api/errors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cookiesGetMock.mockReturnValue(undefined);
    rateLimitMock.mockResolvedValue(true);
    recordErrorMock.mockResolvedValue(undefined);
  });

  it('rejects a report without a message', async () => {
    const res = await POST(makeRequest({ stack: 'irgendwas' }));

    expect(res.status).toBe(400);
    expect(recordErrorMock).not.toHaveBeenCalled();
  });

  it('rejects a blank message', async () => {
    const res = await POST(makeRequest({ message: '   ' }));

    expect(res.status).toBe(400);
    expect(recordErrorMock).not.toHaveBeenCalled();
  });

  it('rate limits per IP', async () => {
    rateLimitMock.mockResolvedValue(false);
    const res = await POST(makeRequest({ message: 'kaputt' }));

    expect(res.status).toBe(429);
    expect(rateLimitMock).toHaveBeenCalledWith('errors:ip:10.0.0.1', expect.any(Object));
    expect(recordErrorMock).not.toHaveBeenCalled();
  });

  it('accepts a report from a logged-out visitor', async () => {
    const res = await POST(makeRequest({ message: 'kaputt', route: '/login' }));

    expect(res.status).toBe(204);
    expect(recordErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'CLIENT', message: 'kaputt', route: '/login', sellerId: null, role: null })
    );
  });

  it('attaches the seller so the admin sees who it happened to', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    const res = await POST(
      makeRequest({ message: 'kaputt', stack: 'Error: kaputt\n  at x' }, { 'user-agent': 'Safari/iPhone' })
    );

    expect(res.status).toBe(204);
    expect(recordErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'CLIENT',
        sellerId: 1234,
        role: 'seller',
        stack: 'Error: kaputt\n  at x',
        userAgent: 'Safari/iPhone',
      })
    );
  });

  it('drops non-string route and stack instead of writing junk', async () => {
    const res = await POST(makeRequest({ message: 'kaputt', route: 42, stack: { a: 1 } }));

    expect(res.status).toBe(204);
    expect(recordErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({ route: null, stack: null })
    );
  });

  it('falls back to x-real-ip and then to "unknown" for the rate limit key', async () => {
    const noForwarded = new Request('http://localhost/api/errors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-real-ip': '10.0.0.2' },
      body: JSON.stringify({ message: 'kaputt' }),
    });
    await POST(noForwarded);
    expect(rateLimitMock).toHaveBeenCalledWith('errors:ip:10.0.0.2', expect.any(Object));

    const noIp = new Request('http://localhost/api/errors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'kaputt' }),
    });
    await POST(noIp);
    expect(rateLimitMock).toHaveBeenLastCalledWith('errors:ip:unknown', expect.any(Object));
  });

  it('rejects a null body without crashing', async () => {
    const res = await POST(makeRequest(null));

    expect(res.status).toBe(400);
    expect(recordErrorMock).not.toHaveBeenCalled();
  });

  it('answers 500 on an unparsable body instead of throwing', async () => {
    const res = await POST(makeRequest('kein json'));

    expect(res.status).toBe(500);
    expect(recordErrorMock).not.toHaveBeenCalled();
  });
});
