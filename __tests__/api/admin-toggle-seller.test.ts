import { describe, it, expect, vi, beforeEach } from 'vitest';
import { adminToken, sellerToken } from '../helpers/tokens';

// ─── next/headers mock (toggle-seller-status uses `await cookies()`) ─────────
const cookiesGetMock = vi.hoisted(() => vi.fn());
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => Promise.resolve({ get: cookiesGetMock })),
}));

// ─── Prisma mock ──────────────────────────────────────────────────────────────
const prismaMock = vi.hoisted(() => ({
  seller: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
}));
vi.mock('@/app/lib/prisma', () => ({ prisma: prismaMock }));

import { POST } from '@/app/api/admin/toggle-seller-status/route';

function makeRequest(body: object) {
  return new Request('http://localhost/api/admin/toggle-seller-status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/admin/toggle-seller-status', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when no token cookie', async () => {
    cookiesGetMock.mockReturnValue(undefined);
    const res = await POST(makeRequest({ sellerId: 1234 }));
    expect(res.status).toBe(401);
  });

  it('returns 401 for invalid token', async () => {
    cookiesGetMock.mockReturnValue({ value: 'garbage-token' });
    const res = await POST(makeRequest({ sellerId: 1234 }));
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin token', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    const res = await POST(makeRequest({ sellerId: 1234 }));
    expect(res.status).toBe(403);
  });

  it('returns 400 when sellerId is missing', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it('returns 404 when seller not found', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.seller.findUnique.mockResolvedValue(null);
    const res = await POST(makeRequest({ sellerId: 9999 }));
    expect(res.status).toBe(404);
  });

  it('toggles false → true on admin request → 200', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.seller.findUnique.mockResolvedValue({ sellerId: 1234, sellerStatusActive: false });
    prismaMock.seller.update.mockResolvedValue({ sellerId: 1234, sellerStatusActive: true });

    const res = await POST(makeRequest({ sellerId: 1234 }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.sellerStatusActive).toBe(true);
    expect(prismaMock.seller.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { sellerStatusActive: true } })
    );
  });

  it('toggles true → false on admin request → 200', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.seller.findUnique.mockResolvedValue({ sellerId: 1234, sellerStatusActive: true });
    prismaMock.seller.update.mockResolvedValue({ sellerId: 1234, sellerStatusActive: false });

    const res = await POST(makeRequest({ sellerId: 1234 }));
    const json = await res.json();
    expect(json.sellerStatusActive).toBe(false);
  });

  it('accepts string sellerId', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.seller.findUnique.mockResolvedValue({ sellerId: 1234, sellerStatusActive: false });
    prismaMock.seller.update.mockResolvedValue({ sellerId: 1234, sellerStatusActive: true });

    const res = await POST(makeRequest({ sellerId: '1234' }));
    expect(res.status).toBe(200);
  });
});
