import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Prisma mock ──────────────────────────────────────────────────────────────
const prismaMock = vi.hoisted(() => ({
  seller: {
    findFirst: vi.fn(),
    count: vi.fn(),
    update: vi.fn(),
  },
  settings: {
    findMany: vi.fn(),
  },
}));
vi.mock('@/app/lib/prisma', () => ({ prisma: prismaMock }));

import { PUT } from '@/app/api/sellers/seller-status/route';

function makeRequest(body: object, ip = '127.0.0.1') {
  return new Request('http://localhost/api/sellers/seller-status', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify(body),
  });
}

const FAR_FUTURE = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
const FAR_PAST   = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

describe('PUT /api/sellers/seller-status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.settings.findMany.mockResolvedValue([]);
  });

  it('returns 400 when sellerId is missing', async () => {
    const res = await PUT(makeRequest({ sellerStatusActive: true }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when sellerId is not a number', async () => {
    const res = await PUT(makeRequest({ sellerId: 'abc', sellerStatusActive: true }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/ungültig/i);
  });

  it('returns 404 when seller not found', async () => {
    prismaMock.seller.findFirst.mockResolvedValue(null);
    const res = await PUT(makeRequest({ sellerId: 9999, sellerStatusActive: true }));
    expect(res.status).toBe(404);
  });

  it('deactivates seller without checking period → 200', async () => {
    prismaMock.seller.findFirst.mockResolvedValue({
      sellerId: 1234,
      isEmployee: false,
      sellerStatusActive: true,
    });
    prismaMock.seller.update.mockResolvedValue({ sellerId: 1234, sellerStatusActive: false });

    const res = await PUT(makeRequest({ sellerId: 1234, sellerStatusActive: false }));
    expect(res.status).toBe(200);
    expect((await res.json()).sellerStatusActive).toBe(false);
  });

  it('activates seller when within window and below cap → 200', async () => {
    prismaMock.seller.findFirst.mockResolvedValue({
      sellerId: 1234,
      isEmployee: false,
      sellerStatusActive: false,
    });
    prismaMock.settings.findMany.mockResolvedValue([
      { key: 'activation_seller_start', value: FAR_PAST },
      { key: 'activation_seller_end',   value: FAR_FUTURE },
    ]);
    prismaMock.seller.count.mockResolvedValue(0); // 0 active sellers → below cap
    prismaMock.seller.update.mockResolvedValue({ sellerId: 1234, sellerStatusActive: true });

    const res = await PUT(makeRequest({ sellerId: 1234, sellerStatusActive: true }));
    expect(res.status).toBe(200);
    expect((await res.json()).sellerStatusActive).toBe(true);
  });

  it('returns 400 when activation cap reached', async () => {
    prismaMock.seller.findFirst.mockResolvedValue({
      sellerId: 1234,
      isEmployee: false,
      sellerStatusActive: false,
    });
    prismaMock.settings.findMany.mockResolvedValue([
      { key: 'activation_seller_start', value: FAR_PAST },
      { key: 'activation_seller_end',   value: FAR_FUTURE },
    ]);
    // MAX_SELLERS=200, return 200 active → at cap
    prismaMock.seller.count.mockResolvedValue(200);

    const res = await PUT(makeRequest({ sellerId: 1234, sellerStatusActive: true }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/200/);
  });

  it('returns 403 when seller activation window is closed', async () => {
    prismaMock.seller.findFirst.mockResolvedValue({
      sellerId: 1234,
      isEmployee: false,
      sellerStatusActive: false,
    });
    prismaMock.settings.findMany.mockResolvedValue([
      { key: 'activation_seller_start', value: FAR_PAST },
      { key: 'activation_seller_end',   value: FAR_PAST }, // both in the past
    ]);

    const res = await PUT(makeRequest({ sellerId: 1234, sellerStatusActive: true }));
    expect(res.status).toBe(403);
  });

  it('activates employee without checking seller cap', async () => {
    prismaMock.seller.findFirst.mockResolvedValue({
      sellerId: 2000,
      isEmployee: true,
      sellerStatusActive: false,
    });
    prismaMock.settings.findMany.mockResolvedValue([
      { key: 'activation_employee_start', value: FAR_PAST },
      { key: 'activation_employee_end',   value: FAR_FUTURE },
    ]);
    prismaMock.seller.update.mockResolvedValue({ sellerId: 2000, sellerStatusActive: true });

    const res = await PUT(makeRequest({ sellerId: 2000, sellerStatusActive: true }));
    expect(res.status).toBe(200);
    expect(prismaMock.seller.count).not.toHaveBeenCalled(); // no cap check
  });

  it('returns 500 on unexpected DB error', async () => {
    prismaMock.seller.findFirst.mockRejectedValue(new Error('DB error'));
    const res = await PUT(makeRequest({ sellerId: 1234, sellerStatusActive: true }));
    expect(res.status).toBe(500);
  });
});
