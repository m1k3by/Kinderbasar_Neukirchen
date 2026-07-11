import { describe, it, expect, vi, beforeEach } from 'vitest';
import { adminToken, sellerToken } from '../helpers/tokens';

// ─── next/headers mock ────────────────────────────────────────────────────────
const cookiesGetMock = vi.hoisted(() => vi.fn());
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => Promise.resolve({ get: cookiesGetMock })),
}));

// ─── Prisma mock ──────────────────────────────────────────────────────────────
const prismaMock = vi.hoisted(() => ({
  cake: {
    deleteMany: vi.fn(),
  },
}));
vi.mock('@/app/lib/prisma', () => ({ prisma: prismaMock }));

import { POST } from '@/app/api/admin/clear-cakes/route';

function makeRequest() {
  return {} as any;
}

describe('POST /api/admin/clear-cakes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when no token', async () => {
    cookiesGetMock.mockReturnValue(undefined);
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
  });

  it('returns 401 for invalid token', async () => {
    cookiesGetMock.mockReturnValue({ value: 'garbage' });
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin token', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    const res = await POST(makeRequest());
    expect(res.status).toBe(403);
  });

  it('deletes all cakes and returns count on admin request → 200', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.cake.deleteMany.mockResolvedValue({ count: 42 });
    const res = await POST(makeRequest());
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.count).toBe(42);
    expect(prismaMock.cake.deleteMany).toHaveBeenCalled();
  });

  it('returns 500 on DB error', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.cake.deleteMany.mockRejectedValue(new Error('DB error'));
    const res = await POST(makeRequest());
    expect(res.status).toBe(500);
  });
});
