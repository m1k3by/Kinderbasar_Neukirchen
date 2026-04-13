import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Prisma mock ──────────────────────────────────────────────────────────────
const prismaMock = vi.hoisted(() => ({
  seller: {
    findMany: vi.fn(),
  },
}));
vi.mock('@/app/lib/prisma', () => ({ prisma: prismaMock }));

import { GET } from '@/app/api/sellers/route';

describe('GET /api/sellers', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns list of sellers → 200', async () => {
    prismaMock.seller.findMany.mockResolvedValue([
      { sellerId: 1234, firstName: 'Max', lastName: 'Muster', email: 'm@b.de', sellerStatusActive: true, isEmployee: false, isCashier: false, createdAt: new Date(), qrCode: null, barcode: null, taskSignups: [], cakes: [] },
    ]);
    const res = await GET(new Request('http://localhost/api/sellers'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveLength(1);
    expect(json[0].sellerId).toBe(1234);
  });

  it('returns empty array when no sellers', async () => {
    prismaMock.seller.findMany.mockResolvedValue([]);
    const res = await GET(new Request('http://localhost/api/sellers'));
    expect(await res.json()).toEqual([]);
  });

  it('returns 500 on DB error', async () => {
    prismaMock.seller.findMany.mockRejectedValue(new Error('DB error'));
    const res = await GET(new Request('http://localhost/api/sellers'));
    expect(res.status).toBe(500);
  });
});
