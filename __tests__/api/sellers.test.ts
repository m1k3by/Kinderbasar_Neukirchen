import { describe, it, expect, vi, beforeEach } from 'vitest';
import { adminToken, sellerToken } from '../helpers/tokens';

// ─── next/headers mock ────────────────────────────────────────────────────────
const cookiesGetMock = vi.hoisted(() => vi.fn());
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => Promise.resolve({ get: cookiesGetMock })),
}));

// ─── Prisma mock ──────────────────────────────────────────────────────────────
const prismaMock = vi.hoisted(() => ({
  seller: {
    findMany: vi.fn(),
  },
}));
vi.mock('@/app/lib/prisma', () => ({ prisma: prismaMock }));

import { GET } from '@/app/api/sellers/route';

function makeRequest(query = '') {
  return new Request(`http://localhost/api/sellers${query}`);
}

const fakeSeller = {
  sellerId: 1234,
  firstName: 'Max',
  lastName: 'Muster',
  email: 'm@b.de',
  sellerStatusActive: true,
  isEmployee: false,
  isCashier: false,
  createdAt: new Date(),
  _count: { taskSignups: 0, cakes: 0 },
};

describe('GET /api/sellers', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when no token', async () => {
    cookiesGetMock.mockReturnValue(undefined);
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it('returns 403 for a non-admin (self-lookups now go through /api/me instead)', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    const res = await GET(makeRequest());
    expect(res.status).toBe(403);
    expect(prismaMock.seller.findMany).not.toHaveBeenCalled();
  });

  it('returns { sellers, nextCursor } → 200 (admin)', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.seller.findMany.mockResolvedValue([fakeSeller]);
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.sellers).toHaveLength(1);
    expect(json.sellers[0].sellerId).toBe(1234);
    expect(json.nextCursor).toBeNull();
  });

  it('does not select qrCode/barcode, and uses _count instead of full taskSignups/cakes arrays', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.seller.findMany.mockResolvedValue([fakeSeller]);
    await GET(makeRequest());
    const call = prismaMock.seller.findMany.mock.calls[0][0];
    expect(call.select.qrCode).toBeUndefined();
    expect(call.select.barcode).toBeUndefined();
    expect(call.select.taskSignups).toBeUndefined();
    expect(call.select.cakes).toBeUndefined();
    expect(call.select._count).toEqual({ select: { taskSignups: true, cakes: true } });
  });

  it('returns empty sellers array when no sellers', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.seller.findMany.mockResolvedValue([]);
    const res = await GET(makeRequest());
    expect(await res.json()).toEqual({ sellers: [], nextCursor: null });
  });

  it('returns 500 on DB error', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.seller.findMany.mockRejectedValue(new Error('DB error'));
    const res = await GET(makeRequest());
    expect(res.status).toBe(500);
  });

  it('defaults to limit 100, fetching limit+1 rows to detect a next page', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.seller.findMany.mockResolvedValue([fakeSeller]);
    await GET(makeRequest());
    const call = prismaMock.seller.findMany.mock.calls[0][0];
    expect(call.take).toBe(101);
  });

  it('clamps a limit above 500 down to the max', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.seller.findMany.mockResolvedValue([]);
    await GET(makeRequest('?limit=99999'));
    expect(prismaMock.seller.findMany.mock.calls[0][0].take).toBe(501);
  });

  it('falls back to the default limit for a non-positive limit', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.seller.findMany.mockResolvedValue([]);
    await GET(makeRequest('?limit=-5'));
    expect(prismaMock.seller.findMany.mock.calls[0][0].take).toBe(101);
  });

  it('passes the cursor through as { sellerId } with skip: 1', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.seller.findMany.mockResolvedValue([]);
    await GET(makeRequest('?cursor=5000'));
    const call = prismaMock.seller.findMany.mock.calls[0][0];
    expect(call.cursor).toEqual({ sellerId: 5000 });
    expect(call.skip).toBe(1);
  });

  it('returns 400 for a non-numeric cursor', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    const res = await GET(makeRequest('?cursor=not-a-number'));
    expect(res.status).toBe(400);
  });

  it('returns a truthy nextCursor and trims the extra row when more results exist than limit', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    const rows = Array.from({ length: 3 }, (_, i) => ({ ...fakeSeller, sellerId: 1000 + i }));
    prismaMock.seller.findMany.mockResolvedValue(rows); // 3 rows returned for limit=2 → 1 extra
    const res = await GET(makeRequest('?limit=2'));
    const json = await res.json();
    expect(json.sellers).toHaveLength(2);
    expect(json.nextCursor).toBe(1002);
  });

  it('builds a case-insensitive OR search filter over firstName/lastName/email (+ sellerId when numeric)', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.seller.findMany.mockResolvedValue([]);
    await GET(makeRequest('?search=1234'));
    const where = prismaMock.seller.findMany.mock.calls[0][0].where;
    expect(where.OR).toEqual(
      expect.arrayContaining([
        { firstName: { contains: '1234', mode: 'insensitive' } },
        { lastName: { contains: '1234', mode: 'insensitive' } },
        { email: { contains: '1234', mode: 'insensitive' } },
        { sellerId: 1234 },
      ])
    );
  });

  it('omits the sellerId branch of the search filter for a non-numeric search term', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.seller.findMany.mockResolvedValue([]);
    await GET(makeRequest('?search=Muster'));
    const where = prismaMock.seller.findMany.mock.calls[0][0].where;
    expect(where.OR.some((c: any) => 'sellerId' in c)).toBe(false);
  });
});
